package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/hyperledger/fabric-protos-go-apiv2/ledger/queryresult"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

type tx = contractapi.TransactionContextInterface

const (
	validation    = "ERR_VALIDATION"
	unauthorized  = "ERR_UNAUTHORIZED"
	notFound      = "ERR_NOT_FOUND"
	conflict      = "ERR_CONFLICT"
	stateError    = "ERR_STATE"
	capExceeded   = "ERR_CAP_EXCEEDED"
	quorumPending = "ERR_QUORUM_PENDING"
)

type ledgerError struct{ code, message string }

func (e ledgerError) Error() string { return e.code + ": " + e.message }

func failure(code, message string) error { return ledgerError{code, message} }

func authorize(ctx tx, roles ...string) error {
	role, found, err := ctx.GetClientIdentity().GetAttributeValue("role")
	if err != nil || !found || !slices.Contains(roles, role) {
		return failure(unauthorized, "caller role is required")
	}
	return nil
}

func identityAttribute(ctx tx, name string) (string, error) {
	value, found, err := ctx.GetClientIdentity().GetAttributeValue(name)
	if err != nil || !found || !validID(value) {
		return "", failure(unauthorized, "caller identity attribute is required")
	}
	return value, nil
}

func validID(id string) bool { return policyIDPattern.MatchString(id) }

func validZone(zone string) bool {
	switch zone {
	case "mumbai", "chennai", "kolkata", "delhi", "hyderabad", "bangalore", "pune", "ahmedabad", "jaipur", "lucknow":
		return true
	default:
		return false
	}
}

func validPlatform(platform string) bool { return platform == "zomato" || platform == "swiggy" }

func timestamp(ctx tx) (int64, error) {
	value, err := ctx.GetStub().GetTxTimestamp()
	if err != nil || value == nil || value.CheckValid() != nil || value.Seconds <= 0 {
		return 0, failure(stateError, "invalid transaction timestamp")
	}
	return value.Seconds, nil
}

func read[T any](ctx tx, key string) (*T, error) {
	data, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, failure(stateError, "could not read ledger state")
	}
	if data == nil {
		return nil, nil
	}
	var value T
	if json.Unmarshal(data, &value) != nil {
		return nil, failure(stateError, "invalid stored ledger state")
	}
	return &value, nil
}

func required[T any](ctx tx, key string) (*T, error) {
	value, err := read[T](ctx, key)
	if err == nil && value == nil {
		err = failure(notFound, "ledger record does not exist")
	}
	return value, err
}

func write(ctx tx, key string, value any) error {
	data, err := json.Marshal(value)
	if err != nil || ctx.GetStub().PutState(key, data) != nil {
		return failure(stateError, "could not write ledger state")
	}
	return nil
}

func emit(ctx tx, name string, value any) error {
	data, err := json.Marshal(value)
	if err != nil || ctx.GetStub().SetEvent(name, data) != nil {
		return failure(stateError, "could not emit chaincode event")
	}
	return nil
}

func composite(ctx tx, name string, parts ...string) (string, error) {
	key, err := ctx.GetStub().CreateCompositeKey(name, parts)
	if err != nil {
		return "", failure(stateError, "could not create ledger index key")
	}
	return key, nil
}

func digest(parts ...string) string {
	hash := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(hash[:])
}

type receipt[T any] struct {
	Fingerprint string `json:"fingerprint"`
	Result      T      `json:"result"`
}

func replay[T any](ctx tx, operation, id string, input any) (string, string, *T, error) {
	if !validID(id) {
		return "", "", nil, failure(validation, "invalid idempotency key")
	}
	clientID, err := ctx.GetClientIdentity().GetID()
	if err != nil || clientID == "" {
		return "", "", nil, failure(unauthorized, "could not identify caller")
	}
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil || mspID == "" {
		return "", "", nil, failure(unauthorized, "could not identify caller organization")
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return "", "", nil, failure(validation, "invalid operation input")
	}
	key, fingerprint := "request:"+digest(operation, mspID, clientID, id), digest(string(encoded))
	existing, err := read[receipt[T]](ctx, key)
	if err != nil {
		return "", "", nil, err
	}
	if existing == nil {
		return key, fingerprint, nil, nil
	}
	if existing.Fingerprint != fingerprint {
		return "", "", nil, failure(conflict, "idempotency key already used with different input")
	}
	return key, fingerprint, &existing.Result, nil
}

func saveReceipt[T any](ctx tx, key, fingerprint string, value *T) error {
	return write(ctx, key, receipt[T]{fingerprint, *value})
}

func weekStartIST(epoch int64) string {
	ist := time.Unix(epoch, 0).In(time.FixedZone("IST", 19800))
	days := (int(ist.Weekday()) + 6) % 7
	return ist.AddDate(0, 0, -days).Format("2006-01-02")
}

func epochKey(epoch int64) string { return fmt.Sprintf("%012d", epoch) }

type ledgerPage[T any] struct {
	Records  []T    `json:"records"`
	Bookmark string `json:"bookmark"`
}

func indexedPage[T any](ctx tx, index string, prefix []string, size int32, bookmark, keyPrefix string) (*ledgerPage[T], error) {
	rows, next, err := queryIndexPage(ctx, index, prefix, size, bookmark)
	if err != nil {
		return nil, err
	}
	result := &ledgerPage[T]{Records: []T{}, Bookmark: next}
	for _, row := range rows {
		var id string
		if json.Unmarshal(row.Value, &id) != nil {
			return nil, failure(stateError, "invalid ledger index")
		}
		record, err := required[T](ctx, keyPrefix+id)
		if err != nil {
			return nil, err
		}
		result.Records = append(result.Records, *record)
	}
	return result, nil
}

const shardNames = "0123456789abcdef"
const indexScanLimit int32 = 4096

func indexLocation(ctx tx, index string, parts []string, id string) (string, string, error) {
	legacy, err := composite(ctx, index, parts...)
	if err != nil {
		return "", "", err
	}
	shard := digest(id)[:1]
	key, err := composite(ctx, index+"~shard", append([]string{shard}, parts...)...)
	return legacy, key, err
}

func removeIndex(ctx tx, index string, parts []string, id string) error {
	legacy, key, err := indexLocation(ctx, index, parts, id)
	if err != nil {
		return err
	}
	if ctx.GetStub().DelState(legacy) != nil || ctx.GetStub().DelState(key) != nil {
		return failure(stateError, "could not remove ledger index")
	}
	return nil
}

func indexRecord(ctx tx, index string, parts []string, id string) error {
	legacy, key, err := indexLocation(ctx, index, parts, id)
	if err != nil {
		return err
	}
	if ctx.GetStub().DelState(legacy) != nil {
		return failure(stateError, "could not retire the legacy ledger index")
	}
	return write(ctx, key, id)
}

// The DRUNIX SQL range scan may emit an empty native bookmark for a full
// page, and its SQL results are unordered. Read and sort bounded hash
// partitions, then use an application cursor. The last partition reads
// unsharded keys written by earlier chaincode versions.
func queryIndexPage(ctx tx, index string, prefix []string, size int32, bookmark string) ([]*queryresult.KV, string, error) {
	if size < 1 || size > 100 || len(bookmark) > 4096 {
		return nil, "", failure(validation, "invalid page options")
	}
	firstPartition, after := 0, ""
	if bookmark != "" {
		payload, err := base64.RawURLEncoding.DecodeString(bookmark)
		if err != nil || len(payload) < 2 || int(payload[0]) > len(shardNames) {
			return nil, "", failure(validation, "invalid index bookmark")
		}
		firstPartition, after = int(payload[0]), string(payload[1:])
	}
	rows := make([]*queryresult.KV, 0, size)
	for partition := firstPartition; partition <= len(shardNames); partition++ {
		name, parts := index, prefix
		if partition < len(shardNames) {
			name += "~shard"
			parts = append([]string{string(shardNames[partition])}, prefix...)
		}
		keyPrefix, err := composite(ctx, name, parts...)
		if err != nil {
			return nil, "", err
		}
		if after != "" && !strings.HasPrefix(after, keyPrefix) {
			return nil, "", failure(validation, "bookmark belongs to a different index")
		}
		shard, err := readIndexShard(ctx, name, parts, keyPrefix, after)
		if err != nil {
			return nil, "", err
		}
		for _, row := range shard {
			if len(rows) == int(size) {
				cursor := append([]byte{byte(partition)}, []byte(row.Key)...)
				return rows, base64.RawURLEncoding.EncodeToString(cursor), nil
			}
			rows = append(rows, row)
		}
		after = ""
	}
	return rows, "", nil
}

func readIndexShard(ctx tx, name string, parts []string, prefix, start string) ([]*queryresult.KV, error) {
	iter, _, err := ctx.GetStub().GetStateByPartialCompositeKeyWithPagination(name, parts, indexScanLimit+1, "")
	if err != nil {
		return nil, failure(stateError, "could not query ledger index partition")
	}
	defer iter.Close()
	var rows []*queryresult.KV
	var count int32
	for iter.HasNext() {
		row, err := iter.Next()
		if err != nil {
			return nil, failure(stateError, "could not iterate ledger index partition")
		}
		if !strings.HasPrefix(row.Key, prefix) {
			continue
		}
		count++
		if count > indexScanLimit {
			return nil, failure(stateError, "ledger index partition exceeds supported scan size")
		}
		if row.Key >= start {
			rows = append(rows, row)
		}
	}
	slices.SortFunc(rows, func(a, b *queryresult.KV) int { return strings.Compare(a.Key, b.Key) })
	return rows, nil
}
