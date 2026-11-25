package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"regexp"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

const workerCollection = "workerPII"

var policyIDPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

type PolicyContract struct {
	contractapi.Contract
}

type workerPII struct {
	Identity string `json:"identity"`
	Phone    string `json:"phone"`
	Bank     string `json:"bank"`
	Salt     string `json:"salt"`
}

func parseExact(data []byte, value any) bool {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	return decoder.Decode(value) == nil && decoder.Decode(new(any)) == io.EOF
}

func canonicalPII(private []byte) ([]byte, string, error) {
	var worker workerPII
	if len(private) == 0 || len(private) > 2048 || !parseExact(private, &worker) {
		return nil, "", failure(validation, "invalid worker data")
	}
	salt, err := hex.DecodeString(worker.Salt)
	if err != nil || len(salt) != 32 || worker.Identity == "" || worker.Phone == "" || worker.Bank == "" {
		return nil, "", failure(validation, "worker details and a 32-byte hex salt are required")
	}
	worker.Salt = hex.EncodeToString(salt)
	canonical, err := json.Marshal(worker)
	if err != nil {
		return nil, "", failure(stateError, "could not encode worker data")
	}
	hash := sha256.Sum256(canonical)
	return canonical, hex.EncodeToString(hash[:]), nil
}

func newChaincode() (*contractapi.ContractChaincode, error) {
	policy := &PolicyContract{}
	policy.Name = "PolicyContract"
	config := &ConfigContract{}
	config.Name = "ConfigContract"
	activity := &ActivityContract{}
	activity.Name = "ActivityContract"
	oracle := &OracleQuorumContract{}
	oracle.Name = "OracleQuorumContract"
	trigger := &TriggerContract{}
	trigger.Name = "TriggerContract"
	payout := &PayoutContract{}
	payout.Name = "PayoutContract"
	audit := &AuditContract{}
	audit.Name = "AuditContract"
	return contractapi.NewChaincode(policy, config, activity, oracle, trigger, payout, audit)
}

func start() error {
	cc, err := newChaincode()
	if err != nil {
		return fmt.Errorf("initialize chaincode: %w", err)
	}
	return cc.Start()
}

func main() {
	if err := start(); err != nil {
		log.Fatal(err)
	}
}
