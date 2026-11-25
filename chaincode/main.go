package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
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

type Policy struct {
	ID         string `json:"id"`
	WorkerHash string `json:"workerHash"`
}

type workerPII struct {
	Identity string `json:"identity"`
	Phone    string `json:"phone"`
	Bank     string `json:"bank"`
	Salt     string `json:"salt"`
}

func (c *PolicyContract) CreatePolicy(ctx contractapi.TransactionContextInterface, id string) (*Policy, error) {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil || msp != "Org2MSP" {
		return nil, errors.New("ERR_UNAUTHORIZED: enrollment requires the sample platform MSP")
	}
	if !policyIDPattern.MatchString(id) {
		return nil, errors.New("ERR_VALIDATION: invalid policy ID")
	}

	stub := ctx.GetStub()
	transient, err := stub.GetTransient()
	if err != nil {
		return nil, errors.New("ERR_STATE: could not read transient data")
	}
	private := transient[workerCollection]
	if len(private) == 0 || len(private) > 2048 {
		return nil, errors.New("ERR_VALIDATION: invalid worker data size")
	}
	var worker workerPII
	decoder := json.NewDecoder(bytes.NewReader(private))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&worker); err != nil || decoder.Decode(new(any)) != io.EOF {
		return nil, errors.New("ERR_VALIDATION: invalid worker data")
	}
	salt, err := hex.DecodeString(worker.Salt)
	if err != nil || len(salt) != 32 || worker.Identity == "" || worker.Phone == "" || worker.Bank == "" {
		return nil, errors.New("ERR_VALIDATION: worker details and a 32-byte hex salt are required")
	}
	canonical, err := json.Marshal(worker)
	if err != nil {
		return nil, errors.New("ERR_STATE: could not encode worker data")
	}
	digest := sha256.Sum256(canonical)
	policy := &Policy{ID: id, WorkerHash: hex.EncodeToString(digest[:])}
	key := "policy:" + id
	existing, err := stub.GetState(key)
	if err != nil {
		return nil, errors.New("ERR_STATE: could not read policy")
	}
	if existing != nil {
		var saved Policy
		if err := json.Unmarshal(existing, &saved); err != nil {
			return nil, errors.New("ERR_STATE: invalid saved policy")
		}
		if saved != *policy {
			return nil, errors.New("ERR_CONFLICT: policy ID already exists")
		}
		return &saved, nil
	}
	public, err := json.Marshal(policy)
	if err != nil {
		return nil, errors.New("ERR_STATE: could not encode policy")
	}
	if err := stub.PutPrivateData(workerCollection, key, canonical); err != nil {
		return nil, errors.New("ERR_STATE: could not write private worker data")
	}
	if err := stub.PutState(key, public); err != nil {
		return nil, errors.New("ERR_STATE: could not write policy")
	}
	return policy, nil
}

func (c *PolicyContract) GetPolicy(ctx contractapi.TransactionContextInterface, id string) (*Policy, error) {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil || (msp != "Org1MSP" && msp != "Org2MSP") {
		return nil, errors.New("ERR_UNAUTHORIZED: sample insurer or platform MSP required")
	}
	if !policyIDPattern.MatchString(id) {
		return nil, errors.New("ERR_VALIDATION: invalid policy ID")
	}
	data, err := ctx.GetStub().GetState("policy:" + id)
	if err != nil {
		return nil, errors.New("ERR_STATE: could not read policy")
	}
	if data == nil {
		return nil, errors.New("ERR_NOT_FOUND: policy does not exist")
	}
	var policy Policy
	if err := json.Unmarshal(data, &policy); err != nil {
		return nil, errors.New("ERR_STATE: invalid saved policy")
	}
	return &policy, nil
}

func start() error {
	contract := &PolicyContract{}
	contract.Name = "PolicyContract"
	cc, err := contractapi.NewChaincode(contract)
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
