package main

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

type AuditContract struct{ contractapi.Contract }

type HistoryEntry struct {
	TxID      string `json:"txId"`
	Timestamp int64  `json:"timestamp"`
	Deleted   bool   `json:"deleted"`
	Value     string `json:"value"`
}

func (c *AuditContract) GetHistory(ctx tx, key string) ([]HistoryEntry, error) {
	if err := authorize(ctx, "regulator"); err != nil {
		return nil, err
	}
	kind, id, ok := strings.Cut(key, ":")
	if !ok || !((kind == "policy" && validID(id)) || (kind == "event" && validEventKey(id)) ||
		(kind == "payout" && validDigest(id))) {
		return nil, failure(validation, "invalid public history key")
	}
	iter, err := ctx.GetStub().GetHistoryForKey(key)
	if err != nil {
		return nil, failure(stateError, "ledger history is unavailable")
	}
	defer iter.Close()
	results := []HistoryEntry{}
	for iter.HasNext() {
		if len(results) >= 1000 {
			return nil, failure(stateError, "history exceeds the query limit")
		}
		record, err := iter.Next()
		if err != nil || record.Timestamp == nil {
			return nil, failure(stateError, "could not iterate ledger history")
		}
		results = append(results, HistoryEntry{TxID: record.TxId, Timestamp: record.Timestamp.Seconds, Deleted: record.IsDelete, Value: string(record.Value)})
	}
	return results, nil
}

func (c *AuditContract) GetPolicySummary(ctx tx, id string) (*Policy, error) {
	if err := authorize(ctx, "regulator"); err != nil {
		return nil, err
	}
	return (&PolicyContract{}).GetPolicy(ctx, id)
}

func (c *AuditContract) GetEventSummary(ctx tx, key string) (*Event, error) {
	if err := authorize(ctx, "regulator"); err != nil {
		return nil, err
	}
	return loadEvent(ctx, key)
}

type Reconciliation struct {
	ReservedCount int64  `json:"reservedCount"`
	SettledCount  int64  `json:"settledCount"`
	FailedCount   int64  `json:"failedCount"`
	ReservedPaise int64  `json:"reservedPaise"`
	SettledPaise  int64  `json:"settledPaise"`
	FailedPaise   int64  `json:"failedPaise"`
	Bookmark      string `json:"bookmark"`
}

func (c *AuditContract) Reconcile(ctx tx, week, zone string, size int32, bookmark string) (*Reconciliation, error) {
	if err := authorize(ctx, "regulator"); err != nil {
		return nil, err
	}
	date, err := time.Parse("2006-01-02", week)
	if err != nil || date.Weekday() != time.Monday || !validZone(zone) || size < 1 || size > 100 || len(bookmark) > 4096 {
		return nil, failure(validation, "invalid reconciliation page")
	}
	rows, next, err := queryIndexPage(ctx, "payout~week~zone~id", []string{week, zone}, size, bookmark)
	if err != nil {
		return nil, err
	}
	result := &Reconciliation{Bookmark: next}
	for _, kv := range rows {
		var id string
		if json.Unmarshal(kv.Value, &id) != nil || !validDigest(id) {
			return nil, failure(stateError, "invalid payout index")
		}
		payout, err := required[Payout](ctx, "payout:"+id)
		if err != nil {
			return nil, err
		}
		switch payout.Status {
		case reserved:
			result.ReservedCount++
			result.ReservedPaise += payout.Amount
		case settled:
			result.SettledCount++
			result.SettledPaise += payout.Amount
		case failed:
			result.FailedCount++
			result.FailedPaise += payout.Amount
		default:
			return nil, failure(stateError, "invalid stored payout state")
		}
	}
	return result, nil
}
