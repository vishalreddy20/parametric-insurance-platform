package main

import (
	"encoding/json"
	"strconv"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

type TriggerContract struct{ contractapi.Contract }
type PayoutContract struct{ contractapi.Contract }

const reserved = "RESERVED"
const settled = "SETTLED"
const failed = "FAILED"

type Payout struct {
	ID          string `json:"id"`
	PolicyID    string `json:"policyId"`
	EventKey    string `json:"eventKey"`
	Zone        string `json:"zone"`
	Week        string `json:"weekStartIST"`
	LostHours   int64  `json:"lostHours"`
	Amount      int64  `json:"amountPaise"`
	Status      string `json:"status"`
	Reference   string `json:"reference"`
	ReservedAt  int64  `json:"reservedAt"`
	FinalizedAt int64  `json:"finalizedAt"`
	TxID        string `json:"txId"`
}

func divideRounded(numerator, denominator int64) int64 {
	return (numerator + denominator/2) / denominator
}

func compensation(income, weeklyMinutes, lostHours int64, tier Tier) int64 {
	base := divideRounded(income*lostHours*60*tier.Factor, weeklyMinutes*100)
	minimum := max(int64(5000), divideRounded(income, 100))
	return min(tier.Cap, max(minimum, base))
}

func (c *TriggerContract) ProcessEventForPolicy(ctx tx, eventID, policyID string) (*Payout, error) {
	return reservePayout(ctx, eventID, policyID)
}

func (c *PayoutContract) CreatePayout(ctx tx, eventID, policyID string) (*Payout, error) {
	return reservePayout(ctx, eventID, policyID)
}

func reservePayout(ctx tx, eventID, policyID string) (*Payout, error) {
	if err := authorize(ctx, "insurer"); err != nil {
		return nil, err
	}
	if !validEventKey(eventID) || !validID(policyID) {
		return nil, failure(validation, "invalid event or policy ID")
	}
	id := digest(policyID, eventID)
	existing, err := read[Payout](ctx, "payout-reservation:"+id)
	if err != nil || existing != nil {
		return existing, err
	}
	event, err := loadEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event.Status != declared {
		return nil, failure(quorumPending, "event has not reached quorum")
	}
	policy, err := loadPolicy(ctx, policyID)
	if err != nil {
		return nil, err
	}
	if !covers(policy, event) {
		return nil, failure(stateError, "policy was not eligible for the complete event window")
	}
	now, err := timestamp(ctx)
	if err != nil {
		return nil, err
	}
	if now < event.End+maxFreshness {
		window, err := read[DemoWindow](ctx, demoWindowKey(event.Zone, event.Start))
		if err != nil {
			return nil, err
		}
		if window == nil || !window.Closed {
			return nil, failure(quorumPending, "overlap selection waits for the reading window to close")
		}
	}
	activity, err := qualifiesActivity(ctx, policy.Terms, event)
	if err != nil {
		return nil, err
	}
	if !activity {
		return nil, failure(stateError, "missing overlapping platform attestation")
	}
	cfg, err := configVersion(ctx, policy.ConfigVersion)
	if err != nil {
		return nil, err
	}
	tier, ok := cfg.tier(policy.Terms.Tier)
	if !ok {
		return nil, failure(stateError, "invalid stored policy tier")
	}
	amount := compensation(policy.Terms.WeeklyIncome, policy.Terms.WeeklyMinutes, event.LostHours, tier)
	if err := chooseHighest(ctx, event, policy, tier, amount); err != nil {
		return nil, err
	}

	overlapKey := "overlap:" + digest(policy.Terms.WorkerID, strconv.FormatInt(event.Start, 10))
	winner, err := read[string](ctx, overlapKey)
	if err != nil {
		return nil, err
	}
	if winner != nil {
		return nil, failure(conflict, "an overlapping event already reserved compensation")
	}
	week := weekStartIST(event.Start)
	capKey := "cap:" + policyID + ":" + week
	used, err := reservedCap(ctx, capKey)
	if err != nil {
		return nil, err
	}
	if used > tier.Cap-amount {
		return nil, failure(capExceeded, "payout would exceed the policy's weekly cap")
	}
	p := &Payout{ID: id, PolicyID: policyID, EventKey: eventID, Zone: event.Zone, Week: week, LostHours: event.LostHours,
		Amount: amount, Status: reserved, ReservedAt: now, TxID: ctx.GetStub().GetTxID()}
	if err := indexRecord(ctx, "payout~week~zone~id", []string{week, event.Zone, id}, id); err != nil {
		return nil, err
	}
	if err := indexRecord(ctx, "payout~policy~id", []string{policyID, id}, id); err != nil {
		return nil, err
	}
	if err := write(ctx, capKey, used+amount); err != nil {
		return nil, err
	}
	if err := write(ctx, overlapKey, id); err != nil {
		return nil, err
	}
	if err := write(ctx, "payout:"+id, p); err != nil {
		return nil, err
	}
	if err := write(ctx, "payout-reservation:"+id, p); err != nil {
		return nil, err
	}
	return p, emit(ctx, "PayoutReserved", p)
}

func activityHourKey(worker, platform string, bucket int64) string {
	return "activity-hour:" + digest(worker, platform, strconv.FormatInt(bucket, 10))
}

func qualifiesActivity(ctx tx, terms *PolicyTerms, event *Event) (bool, error) {
	covered, err := read[bool](ctx, activityHourKey(terms.WorkerID, terms.Platform, event.Start))
	if err != nil || covered != nil {
		return covered != nil && *covered, err
	}
	// Earlier ledgers indexed attestations only by their exact intervals.
	iter, err := ctx.GetStub().GetStateByPartialCompositeKey("activity", []string{terms.WorkerID, terms.Platform})
	if err != nil {
		return false, failure(stateError, "could not query activity")
	}
	defer iter.Close()
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return false, failure(stateError, "could not iterate activity")
		}
		var activity Activity
		if json.Unmarshal(kv.Value, &activity) != nil {
			return false, failure(stateError, "invalid stored activity")
		}
		if activity.Start < event.End && activity.End > event.Start {
			return true, nil
		}
	}
	return false, nil
}

func covers(policy *Policy, event *Event) bool {
	observed := max(event.ObservedAt, event.Start)
	return policy.Terms != nil && policy.Terms.Zone == event.Zone && policy.Status == active && policy.PaidAt > 0 &&
		observed >= policy.StartsAt && observed >= policy.WaitingUntil && observed < policy.EndsAt
}

func chooseHighest(ctx tx, event *Event, policy *Policy, tier Tier, amount int64) error {
	terms := policy.Terms
	for _, rule := range defaultConfig().Triggers {
		if rule.Code == event.Trigger {
			continue
		}
		otherKey := eventKey(event.Zone, rule.Code, event.Start)
		other, err := read[Event](ctx, "event:"+otherKey)
		if err != nil {
			return err
		}
		if other == nil || other.Status != declared || !covers(policy, other) {
			continue
		}
		otherAmount := compensation(terms.WeeklyIncome, terms.WeeklyMinutes, other.LostHours, tier)
		if otherAmount > amount || (otherAmount == amount && other.Key < event.Key) {
			return failure(conflict, "another overlapping event provides the selected compensation")
		}
	}
	return nil
}

func reservedCap(ctx tx, key string) (int64, error) {
	used, err := read[int64](ctx, key)
	if err != nil || used == nil {
		return 0, err
	}
	if *used < 0 {
		return 0, failure(stateError, "invalid weekly cap counter")
	}
	return *used, nil
}

func validDigest(id string) bool {
	if len(id) != 64 {
		return false
	}
	for _, value := range id {
		if !(value >= '0' && value <= '9') && !(value >= 'a' && value <= 'f') {
			return false
		}
	}
	return true
}

func (c *PayoutContract) RecordSettlement(ctx tx, id, status, reference, requestID string) (*Payout, error) {
	if err := authorize(ctx, "bank"); err != nil {
		return nil, err
	}
	if !validDigest(id) || !validID(reference) || (status != settled && status != failed) {
		return nil, failure(validation, "invalid settlement")
	}
	key, fp, original, err := replay[Payout](ctx, "settlement", requestID, []string{id, status, reference})
	if err != nil || original != nil {
		return original, err
	}
	referenceKey := "settlement-ref:" + reference
	previous, err := read[receipt[Payout]](ctx, referenceKey)
	if err != nil {
		return nil, err
	}
	if previous != nil {
		if previous.Fingerprint != fp {
			return nil, failure(conflict, "settlement reference already used")
		}
		return &previous.Result, saveReceipt(ctx, key, fp, &previous.Result)
	}
	p, err := required[Payout](ctx, "payout:"+id)
	if err != nil {
		return nil, err
	}
	if p.Status != reserved {
		return nil, failure(stateError, "only a reserved payout can be finalized")
	}
	now, err := timestamp(ctx)
	if err != nil {
		return nil, err
	}
	if now < p.ReservedAt {
		return nil, failure(validation, "settlement precedes reservation")
	}
	event := "PayoutSettled"
	if status == failed {
		event = "PayoutFailed"
		capKey := "cap:" + p.PolicyID + ":" + p.Week
		used, err := reservedCap(ctx, capKey)
		if err != nil {
			return nil, err
		}
		if used < p.Amount {
			return nil, failure(stateError, "reserved cap balance is inconsistent")
		}
		if err := write(ctx, capKey, used-p.Amount); err != nil {
			return nil, err
		}
	}
	p.Status, p.Reference, p.FinalizedAt = status, reference, now
	if err := write(ctx, "payout:"+id, p); err != nil {
		return nil, err
	}
	if err := saveReceipt(ctx, referenceKey, fp, p); err != nil {
		return nil, err
	}
	if err := saveReceipt(ctx, key, fp, p); err != nil {
		return nil, err
	}
	return p, emit(ctx, event, p)
}

func (c *PayoutContract) GetPayout(ctx tx, id string) (*Payout, error) {
	if err := authorize(ctx, "insurer", "platform", "bank", "regulator"); err != nil {
		return nil, err
	}
	if !validDigest(id) {
		return nil, failure(validation, "invalid payout ID")
	}
	payout, err := required[Payout](ctx, "payout:"+id)
	if err != nil {
		return nil, err
	}
	policy, err := loadPolicy(ctx, payout.PolicyID)
	if err != nil {
		return nil, err
	}
	if err := policyAccess(ctx, policy); err != nil {
		return nil, err
	}
	return payout, nil
}

type PayoutPage ledgerPage[Payout]

func (c *PayoutContract) ListPayouts(ctx tx, policyID string, size int32, bookmark string) (*PayoutPage, error) {
	if err := authorize(ctx, "platform", "insurer", "bank", "regulator"); err != nil {
		return nil, err
	}
	policy, err := loadPolicy(ctx, policyID)
	if err != nil {
		return nil, err
	}
	if err := policyAccess(ctx, policy); err != nil {
		return nil, err
	}
	page, err := indexedPage[Payout](ctx, "payout~policy~id", []string{policyID}, size, bookmark, "payout:")
	return (*PayoutPage)(page), err
}
