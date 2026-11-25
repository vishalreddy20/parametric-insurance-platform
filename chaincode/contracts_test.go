package main

import (
	"encoding/json"
	"errors"
	"os"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"github.com/hyperledger/fabric-protos-go-apiv2/ledger/queryresult"
	pb "github.com/hyperledger/fabric-protos-go-apiv2/peer"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type testIdentity struct {
	cid.ClientIdentity
	role, actor, msp string
}

func (i testIdentity) GetID() (string, error)    { return i.role + ":" + i.actor, nil }
func (i testIdentity) GetMSPID() (string, error) { return i.msp, nil }
func (i testIdentity) GetAttributeValue(key string) (string, bool, error) {
	var value string
	switch key {
	case "role":
		value = i.role
	case "platformId", "oracleId":
		value = i.actor
	}
	return value, value != "", nil
}

type testStub struct {
	shim.ChaincodeStubInterface
	state, private, transient map[string][]byte
	now                       int64
	event                     string
	history                   []*queryresult.KeyModification
}

func (s *testStub) GetState(key string) ([]byte, error)     { return s.state[key], nil }
func (s *testStub) PutState(key string, value []byte) error { s.state[key] = value; return nil }
func (s *testStub) DelState(key string) error               { delete(s.state, key); return nil }
func (s *testStub) PutPrivateData(collection, key string, value []byte) error {
	s.private[collection+":"+key] = value
	return nil
}
func (s *testStub) GetTransient() (map[string][]byte, error) { return s.transient, nil }
func (s *testStub) GetTxTimestamp() (*timestamppb.Timestamp, error) {
	return &timestamppb.Timestamp{Seconds: s.now}, nil
}
func (s *testStub) GetTxID() string                      { return "simulated-test-tx" }
func (s *testStub) SetEvent(name string, _ []byte) error { s.event = name; return nil }
func (s *testStub) CreateCompositeKey(name string, parts []string) (string, error) {
	return shim.CreateCompositeKey(name, parts)
}
func (s *testStub) SplitCompositeKey(key string) (string, []string, error) {
	parts := strings.Split(strings.Trim(key, "\x00"), "\x00")
	return parts[0], parts[1:], nil
}
func (s *testStub) GetStateByPartialCompositeKey(name string, parts []string) (shim.StateQueryIteratorInterface, error) {
	it, _, err := s.GetStateByPartialCompositeKeyWithPagination(name, parts, 1000, "")
	return it, err
}
func (s *testStub) GetStateByPartialCompositeKeyWithPagination(name string, parts []string, size int32, bookmark string) (shim.StateQueryIteratorInterface, *pb.QueryResponseMetadata, error) {
	prefix, err := shim.CreateCompositeKey(name, parts)
	if err != nil {
		return nil, nil, err
	}
	keys := []string{}
	for key := range s.state {
		if strings.HasPrefix(key, prefix) && key > bookmark {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	page := keys[:min(int(size), len(keys))]
	rows := []*queryresult.KV{}
	for _, key := range page {
		rows = append(rows, &queryresult.KV{Key: key, Value: s.state[key]})
	}
	meta := &pb.QueryResponseMetadata{}
	if len(page) < len(keys) {
		meta.Bookmark = page[len(page)-1]
	}
	return &testIterator[*queryresult.KV]{rows}, meta, nil
}
func (s *testStub) GetHistoryForKey(string) (shim.HistoryQueryIteratorInterface, error) {
	return &testIterator[*queryresult.KeyModification]{s.history}, nil
}

type testIterator[T any] struct{ rows []T }

func (it *testIterator[T]) HasNext() bool { return len(it.rows) > 0 }
func (it *testIterator[T]) Next() (T, error) {
	next := it.rows[0]
	it.rows = it.rows[1:]
	return next, nil
}
func (it *testIterator[T]) Close() error { return nil }

const testStart int64 = 1763985600

func testContext() (*contractapi.TransactionContext, *testStub) {
	stub := &testStub{state: map[string][]byte{}, private: map[string][]byte{}, transient: map[string][]byte{}, now: testStart}
	ctx := &contractapi.TransactionContext{}
	ctx.SetStub(stub)
	as(ctx, "insurer", "insurer-test")
	return ctx, stub
}

func as(ctx *contractapi.TransactionContext, role, actor string) {
	ctx.SetClientIdentity(testIdentity{role: role, actor: actor, msp: "TestMSP"})
}
func must[T any](t *testing.T, result T, err error) T {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	return result
}
func checkCode(t *testing.T, err error, code string) {
	t.Helper()
	var typed ledgerError
	if !errors.As(err, &typed) || typed.code != code {
		t.Fatalf("expected %s, got %v", code, err)
	}
}
func seedConfig(t *testing.T, ctx tx, quorum int) {
	t.Helper()
	cfg := defaultConfig()
	cfg.Waiting, cfg.Quorum = 0, quorum
	value, err := (&ConfigContract{}).SetConfig(ctx, cfg, "config-initial")
	must(t, value, err)
}
func enroll(t *testing.T, ctx *contractapi.TransactionContext, stub *testStub, id, zone string) *Policy {
	t.Helper()
	as(ctx, "platform", "zomato")
	stub.transient[workerCollection] = []byte(`{"identity":"SIMULATED","phone":"SIMULATED","bank":"SIMULATED","salt":"8231efa6bdbf75a71cf3eedf872d7e31ad04ec31f7d4793aa5734e3285e96a4e"}`)
	terms := PolicyTerms{WorkerID: id, Zone: zone, Platform: "zomato", Tier: "standard", WeeklyIncome: 400000, WeeklyMinutes: 2400, PremiumAmount: 20000}
	encoded, err := json.Marshal(terms)
	stub.transient["policyTerms"] = must(t, encoded, err)
	p, err := (&PolicyContract{}).CreatePolicy(ctx, id)
	return must(t, p, err)
}

func pay(t *testing.T, ctx *contractapi.TransactionContext, id string, term int64, ref string) *Policy {
	t.Helper()
	as(ctx, "bank", "bank-test")
	p, err := (&PolicyContract{}).RecordPremiumPaid(ctx, id, term, 20000, ref, ref)
	return must(t, p, err)
}

func attest(t *testing.T, ctx *contractapi.TransactionContext, id, platform string, start, end int64) {
	t.Helper()
	as(ctx, "platform", platform)
	record, err := (&ActivityContract{}).RecordActivityAttestation(ctx, Activity{id, platform, start, end}, "activity-"+id)
	must(t, record, err)
}
func observe(ctx *contractapi.TransactionContext, actor, zone, trigger string, start, value, seen int64) (*Event, error) {
	as(ctx, "oracle", actor)
	rule, _ := defaultConfig().trigger(trigger)
	return (&OracleQuorumContract{}).SubmitReading(ctx, Observation{zone, trigger, start, value, rule.Unit, seen})
}
func declareEvent(t *testing.T, ctx *contractapi.TransactionContext, stub *testStub, zone, trigger string, start int64) *Event {
	t.Helper()
	stub.now = start + 120
	rule, _ := defaultConfig().trigger(trigger)
	event, err := observe(ctx, "oracle-1", zone, trigger, start, rule.Threshold, start+60)
	return must(t, event, err)
}

func TestContractRegistration(t *testing.T) {
	cc, err := newChaincode()
	must(t, cc, err)
}

func TestGoldenPayoutVectors(t *testing.T) {
	data, err := os.ReadFile("../testdata/premium-vectors.json")
	must(t, data, err)
	var vectors []struct {
		Name, Tier                         string
		Income, Minutes, LostHours, Amount int64
	}
	if err := json.Unmarshal(data, &vectors); err != nil {
		t.Fatal(err)
	}
	for _, vector := range vectors {
		t.Run(vector.Name, func(t *testing.T) {
			tier, ok := defaultConfig().tier(vector.Tier)
			if !ok {
				t.Fatal("unknown tier")
			}
			if got := compensation(vector.Income, vector.Minutes, vector.LostHours, tier); got != vector.Amount {
				t.Fatalf("computed %d paise, expected %d", got, vector.Amount)
			}
		})
	}
}

func TestWeekBoundaryIST(t *testing.T) {
	monday := time.Date(2026, 11, 22, 18, 30, 0, 0, time.UTC).Unix()
	if weekStartIST(monday-1) != "2026-11-16" || weekStartIST(monday) != "2026-11-23" || weekStartIST(monday-1800) != "2026-11-16" {
		t.Fatal("incorrect IST week assignment")
	}
}

func TestConfigVersioningAndValidation(t *testing.T) {
	ctx, _ := testContext()
	contract := &ConfigContract{}
	initial, err := contract.GetConfig(ctx)
	cfg := must(t, initial, err)
	cfg.Quorum = 1
	first, err := contract.SetConfig(ctx, *cfg, "update")
	if must(t, first, err).Version != 1 {
		t.Fatal("expected version 1")
	}
	replayed, err := contract.SetConfig(ctx, *cfg, "update")
	if must(t, replayed, err).Version != 1 {
		t.Fatal("replay version changed")
	}
	cfg.Waiting = 0
	_, err = contract.SetConfig(ctx, *cfg, "update")
	checkCode(t, err, conflict)
	_, err = contract.SetConfig(ctx, *cfg, "stale-version")
	checkCode(t, err, conflict)
	cfg.Version = 1
	cfg.Oracles = []string{"a", "a"}
	_, err = contract.SetConfig(ctx, *cfg, "duplicate-oracles")
	checkCode(t, err, validation)
	for _, modify := range []func(*Config){
		func(c *Config) { c.Freshness = maxFreshness + 1 },
		func(c *Config) { c.Basic.Cap = 0 },
		func(c *Config) { c.Triggers = nil },
		func(c *Config) { c.Triggers[0].Unit = "invalid" },
	} {
		next := defaultConfig()
		next.Version = 1
		modify(&next)
		_, err = contract.SetConfig(ctx, next, "invalid")
		checkCode(t, err, validation)
	}
	as(ctx, "regulator", "regulator-test")
	_, err = contract.SetConfig(ctx, *cfg, "forbidden")
	checkCode(t, err, unauthorized)
}

func TestQuorumAndImmutableLateReading(t *testing.T) {
	ctx, stub := testContext()
	start := testStart + hour
	stub.now = start + 120
	first, err := observe(ctx, "oracle-1", "mumbai", "severe_storm", start, 60, start)
	if got := must(t, first, err); got.Status != pending || got.Code != quorumPending {
		t.Fatal(got)
	}
	second, err := observe(ctx, "oracle-2", "mumbai", "severe_storm", start, 59, start)
	if got := must(t, second, err); got.Status != pending {
		t.Fatal(got)
	}
	dupe, err := observe(ctx, "oracle-1", "mumbai", "severe_storm", start, 75, start)
	if got := must(t, dupe, err); len(got.Readings) != 1 || got.Readings[0].Value != 60 {
		t.Fatal(got)
	}
	_, err = observe(ctx, "unknown", "mumbai", "severe_storm", start, 100, start)
	checkCode(t, err, unauthorized)
	_, err = observe(ctx, "oracle-3", "mumbai", "severe_storm", start, 600, start)
	checkCode(t, err, validation)
	_, err = observe(ctx, "oracle-3", "mumbai", "severe_storm", start, 60, stub.now+1)
	checkCode(t, err, validation)
	_, err = observe(ctx, "oracle-3", "mumbai", "invalid", start, 60, start)
	checkCode(t, err, validation)
	stub.now = start + 1801
	_, err = observe(ctx, "oracle-3", "mumbai", "severe_storm", start, 60, start)
	checkCode(t, err, validation)
	final, err := observe(ctx, "oracle-3", "mumbai", "severe_storm", start, 60, start+2)
	if got := must(t, final, err); got.Status != declared || got.Code != "" || stub.event != "EventDeclared" {
		t.Fatal(got)
	}
	as(ctx, "regulator", "regulator-test")
	summary, err := (&AuditContract{}).GetEventSummary(ctx, final.Key)
	if got := must(t, summary, err); !slices.Equal(got.Readings, final.Readings) {
		t.Fatal(got)
	}

	as(ctx, "insurer", "insurer-test")
	seedConfig(t, ctx, 1)
	early := declareEvent(t, ctx, stub, "mumbai", "heavy_rainfall", start+hour)
	if early.Status != declared {
		t.Fatal(early)
	}
	late, err := observe(ctx, "oracle-2", "mumbai", "heavy_rainfall", start+hour, 70, start+hour)
	if got := must(t, late, err); len(got.Readings) != 1 || got.TxID != early.TxID {
		t.Fatal(got)
	}
	if stub.state["observation:"+digest(early.Key, "oracle-2")] == nil {
		t.Fatal("late reading was not stored")
	}
	stored, err := (&OracleQuorumContract{}).GetEvent(ctx, early.Key)
	if got := must(t, stored, err); !slices.Equal(got.Readings, early.Readings) {
		t.Fatal(got)
	}
}

func TestPolicyLifecycleAndPrivacy(t *testing.T) {
	ctx, stub := testContext()
	contract := &PolicyContract{}
	p := enroll(t, ctx, stub, "policy-a", "mumbai")
	if p.Status != pendingPremium || string(stub.private[workerCollection+":policy:policy-a"]) == "" ||
		strings.Contains(string(stub.state["policy:policy-a"]), "SIMULATED") {
		t.Fatal("incorrect public/private state")
	}
	_, err := contract.CreatePolicy(ctx, "invalid policy")
	checkCode(t, err, validation)
	paid := pay(t, ctx, p.ID, 1, "upi-premium")
	if paid.Status != active || paid.WaitingUntil != stub.now+86400 {
		t.Fatal(paid)
	}
	replay := pay(t, ctx, p.ID, 1, "upi-premium")
	if *paid.Terms != *replay.Terms || paid.PaidAt != replay.PaidAt {
		t.Fatal("premium replay changed")
	}
	_, err = contract.RecordPremiumPaid(ctx, p.ID, 1, 1, "upi-other", "different")
	checkCode(t, err, stateError)
	as(ctx, "platform", "swiggy")
	_, err = contract.GetPolicy(ctx, p.ID)
	checkCode(t, err, unauthorized)
	as(ctx, "platform", "zomato")
	original, err := contract.CreatePolicy(ctx, p.ID)
	if must(t, original, err).Status != pendingPremium {
		t.Fatal("enrollment replay did not preserve original result")
	}
	stub.transient["policyTerms"] = []byte(`{"workerId":"x","zone":"unknown"}`)
	_, err = contract.CreatePolicy(ctx, "bad-terms")
	checkCode(t, err, validation)
	_, err = contract.RenewPolicy(ctx, p.ID, "too-early")
	checkCode(t, err, stateError)
	pausedPolicy, err := contract.PausePolicy(ctx, p.ID, "pause")
	if must(t, pausedPolicy, err).Status != paused {
		t.Fatal(pausedPolicy)
	}
	_, err = contract.PausePolicy(ctx, p.ID, "pause-twice")
	checkCode(t, err, stateError)
	as(ctx, "regulator", "regulator-test")
	page, err := contract.ListPoliciesByZone(ctx, "mumbai", paused, 1, "")
	if len(must(t, page, err).Policies) != 1 {
		t.Fatal(page)
	}
	stub.now = paid.EndsAt
	summary, err := (&AuditContract{}).GetPolicySummary(ctx, p.ID)
	if must(t, summary, err).Status != expired {
		t.Fatal(summary)
	}
	as(ctx, "platform", "zomato")
	renewed, err := contract.RenewPolicy(ctx, p.ID, "renew")
	if got := must(t, renewed, err); got.Term != 2 || got.PaidAt != 0 || got.Status != pendingPremium {
		t.Fatal(got)
	}
	pay(t, ctx, p.ID, 2, "upi-renewal")
	as(ctx, "insurer", "insurer-test")
	closed, err := contract.CancelPolicy(ctx, p.ID, "cancel")
	if must(t, closed, err).Status != cancelled {
		t.Fatal(closed)
	}
}

func TestActivityValidation(t *testing.T) {
	ctx, stub := testContext()
	contract := &ActivityContract{}
	request := Activity{"worker", "zomato", stub.now - 20, stub.now}
	_, err := contract.RecordActivityAttestation(ctx, request, "attest")
	checkCode(t, err, unauthorized)
	as(ctx, "platform", "swiggy")
	_, err = contract.RecordActivityAttestation(ctx, request, "attest")
	checkCode(t, err, unauthorized)
	as(ctx, "platform", "zomato")
	request.End++
	_, err = contract.RecordActivityAttestation(ctx, request, "attest")
	checkCode(t, err, validation)
	request.End = request.Start
	_, err = contract.RecordActivityAttestation(ctx, request, "attest")
	checkCode(t, err, validation)
	request.End = stub.now
	result, err := contract.RecordActivityAttestation(ctx, request, "attest")
	if *must(t, result, err) != request {
		t.Fatal(result)
	}
	replay, err := contract.RecordActivityAttestation(ctx, request, "attest")
	if *must(t, replay, err) != request {
		t.Fatal(replay)
	}
}

func setupPayout(t *testing.T) (*contractapi.TransactionContext, *testStub, *Policy) {
	t.Helper()
	ctx, stub := testContext()
	seedConfig(t, ctx, 1)
	p := enroll(t, ctx, stub, "policy-main", "mumbai")
	return ctx, stub, pay(t, ctx, p.ID, 1, "premium-main")
}
func reserve(t *testing.T, ctx *contractapi.TransactionContext, stub *testStub, event *Event, p *Policy) *Payout {
	t.Helper()
	stub.now = max(stub.now, event.End+maxFreshness)
	as(ctx, "insurer", "insurer-test")
	result, err := (&TriggerContract{}).ProcessEventForPolicy(ctx, event.Key, p.ID)
	return must(t, result, err)
}

func TestPayoutOverlapCapsAndSettlement(t *testing.T) {
	ctx, stub, p := setupPayout(t)
	low := declareEvent(t, ctx, stub, p.Terms.Zone, "extreme_heat", testStart+hour)
	high := declareEvent(t, ctx, stub, p.Terms.Zone, "severe_storm", testStart+hour)
	middle := declareEvent(t, ctx, stub, p.Terms.Zone, "extreme_heat", testStart+2*hour)
	third := declareEvent(t, ctx, stub, p.Terms.Zone, "extreme_heat", testStart+3*hour)
	stub.now = third.End + maxFreshness
	attest(t, ctx, p.Terms.WorkerID, p.Terms.Platform, low.Start, third.End)
	as(ctx, "insurer", "insurer-test")
	trigger := &TriggerContract{}
	payout := &PayoutContract{}
	_, err := trigger.ProcessEventForPolicy(ctx, low.Key, p.ID)
	checkCode(t, err, conflict)
	first := reserve(t, ctx, stub, high, p)
	if first.Amount != 60000 || stub.event != "PayoutReserved" {
		t.Fatal(first)
	}
	original, err := payout.CreatePayout(ctx, high.Key, p.ID)
	if *must(t, original, err) != *first {
		t.Fatal(original)
	}
	second := reserve(t, ctx, stub, middle, p)
	if second.Amount != 40000 {
		t.Fatal(second)
	}
	_, err = trigger.ProcessEventForPolicy(ctx, third.Key, p.ID)
	checkCode(t, err, capExceeded)

	as(ctx, "bank", "bank-test")
	firstDone, err := payout.RecordSettlement(ctx, first.ID, settled, "sim-settled", "callback-one")
	if must(t, firstDone, err).Status != settled || stub.event != "PayoutSettled" {
		t.Fatal(firstDone)
	}
	secondDone, err := payout.RecordSettlement(ctx, second.ID, failed, "sim-failed", "callback-two")
	if must(t, secondDone, err).Status != failed || stub.event != "PayoutFailed" {
		t.Fatal(secondDone)
	}
	replay, err := payout.RecordSettlement(ctx, second.ID, failed, "sim-failed", "second-request")
	if *must(t, replay, err) != *secondDone {
		t.Fatal(replay)
	}
	_, err = payout.RecordSettlement(ctx, second.ID, settled, "sim-failed", "different-request")
	checkCode(t, err, conflict)
	_, err = payout.RecordSettlement(ctx, second.ID, settled, "new-ref", "different-request")
	checkCode(t, err, stateError)
	loaded, err := payout.GetPayout(ctx, second.ID)
	if must(t, loaded, err).Status != failed {
		t.Fatal(loaded)
	}
	replacement := reserve(t, ctx, stub, third, p)
	if replacement.Status != reserved {
		t.Fatal(replacement)
	}
	as(ctx, "regulator", "regulator-test")
	_, err = payout.RecordSettlement(ctx, replacement.ID, settled, "forbidden", "forbidden")
	checkCode(t, err, unauthorized)

	audit := &AuditContract{}
	sum, err := audit.Reconcile(ctx, first.Week, p.Terms.Zone, 10, "")
	if totals := must(t, sum, err); totals.SettledCount != 1 || totals.FailedCount != 1 || totals.ReservedCount != 1 ||
		totals.SettledPaise != 60000 || totals.FailedPaise != 40000 || totals.ReservedPaise != 40000 {
		t.Fatal(totals)
	}
	page, err := audit.Reconcile(ctx, first.Week, p.Terms.Zone, 1, "")
	if must(t, page, err).Bookmark == "" {
		t.Fatal("missing bookmark")
	}
	stub.history = []*queryresult.KeyModification{{TxId: "tx-1", Timestamp: &timestamppb.Timestamp{Seconds: stub.now}, Value: stub.state["payout:"+first.ID]}}
	history, err := audit.GetHistory(ctx, "payout:"+first.ID)
	if len(must(t, history, err)) != 1 {
		t.Fatal(history)
	}
	_, err = audit.GetHistory(ctx, "enrollment:"+p.ID)
	checkCode(t, err, validation)
	_, err = audit.Reconcile(ctx, "2026-11-24", p.Terms.Zone, 1, "")
	checkCode(t, err, validation)
}

func TestPayoutOnePaisaOver(t *testing.T) {
	ctx, stub, p := setupPayout(t)
	event := declareEvent(t, ctx, stub, p.Terms.Zone, "extreme_heat", testStart+hour)
	stub.now = event.End + maxFreshness
	attest(t, ctx, p.Terms.WorkerID, p.Terms.Platform, event.Start, event.End)
	as(ctx, "insurer", "insurer-test")
	key := "cap:" + p.ID + ":" + weekStartIST(event.Start)
	if err := write(ctx, key, int64(60001)); err != nil {
		t.Fatal(err)
	}
	_, err := (&PayoutContract{}).CreatePayout(ctx, event.Key, p.ID)
	checkCode(t, err, capExceeded)
	balance, err := reservedCap(ctx, key)
	if must(t, balance, err) != 60001 {
		t.Fatal("cap counter changed")
	}
}

func TestPayoutIneligibility(t *testing.T) {
	for _, scenario := range []struct {
		name   string
		modify func(*Policy, *testStub, *Event)
	}{
		{"wrong zone", func(p *Policy, _ *testStub, _ *Event) { p.Terms.Zone = "delhi" }},
		{"unpaid", func(p *Policy, _ *testStub, _ *Event) { p.PaidAt = 0 }},
		{"paused", func(p *Policy, _ *testStub, _ *Event) { p.Status = paused }},
		{"cancelled", func(p *Policy, _ *testStub, _ *Event) { p.Status = cancelled }},
		{"expired", func(p *Policy, _ *testStub, e *Event) { p.EndsAt = e.Start }},
		{"waiting", func(p *Policy, _ *testStub, e *Event) { p.WaitingUntil = e.Start + 1 }},
		{"late premium", func(p *Policy, _ *testStub, e *Event) { p.StartsAt = e.Start + 1 }},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			ctx, stub, p := setupPayout(t)
			event := declareEvent(t, ctx, stub, p.Terms.Zone, "extreme_heat", testStart+hour)
			scenario.modify(p, stub, event)
			if err := write(ctx, "policy:"+p.ID, p); err != nil {
				t.Fatal(err)
			}
			stub.now = event.End + maxFreshness
			as(ctx, "insurer", "insurer-test")
			_, err := (&TriggerContract{}).ProcessEventForPolicy(ctx, event.Key, p.ID)
			checkCode(t, err, stateError)
		})
	}
	ctx, stub, p := setupPayout(t)
	event := declareEvent(t, ctx, stub, p.Terms.Zone, "extreme_heat", testStart+hour)
	trigger := &TriggerContract{}
	_, err := trigger.ProcessEventForPolicy(ctx, event.Key, p.ID)
	checkCode(t, err, unauthorized)
	as(ctx, "insurer", "insurer-test")
	_, err = trigger.ProcessEventForPolicy(ctx, event.Key, p.ID)
	checkCode(t, err, quorumPending)
	stub.now = event.End + maxFreshness
	attest(t, ctx, p.Terms.WorkerID, "swiggy", event.Start, event.End)
	as(ctx, "insurer", "insurer-test")
	_, err = trigger.ProcessEventForPolicy(ctx, event.Key, p.ID)
	checkCode(t, err, stateError)
	_, err = trigger.ProcessEventForPolicy(ctx, "invalid", p.ID)
	checkCode(t, err, validation)
}

func TestSmokePolicyCompatibility(t *testing.T) {
	ctx, stub := testContext()
	ctx.SetClientIdentity(testIdentity{msp: "Org2MSP"})
	stub.transient[workerCollection] = []byte(`{"identity":"SIMULATED","phone":"SIMULATED","bank":"SIMULATED","salt":"8231efa6bdbf75a71cf3eedf872d7e31ad04ec31f7d4793aa5734e3285e96a4e"}`)
	contract := &PolicyContract{}
	p, err := contract.CreatePolicy(ctx, smokePolicy)
	if got := must(t, p, err); got.WorkerHash != smokeHash || got.Terms != nil {
		t.Fatal(got)
	}
	replayed, err := contract.CreatePolicy(ctx, smokePolicy)
	if *must(t, replayed, err) != *p {
		t.Fatal(replayed)
	}
	ctx.SetClientIdentity(testIdentity{msp: "Org1MSP"})
	result, err := contract.GetPolicy(ctx, smokePolicy)
	if *must(t, result, err) != *p {
		t.Fatal(result)
	}
}

func TestReadAuthorizationAndPagination(t *testing.T) {
	ctx, stub, p := setupPayout(t)
	event := declareEvent(t, ctx, stub, p.Terms.Zone, "extreme_heat", testStart+hour)
	other := declareEvent(t, ctx, stub, p.Terms.Zone, "severe_storm", testStart+2*hour)
	stub.now = other.End + maxFreshness
	attest(t, ctx, p.Terms.WorkerID, p.Terms.Platform, event.Start, other.End)
	a := reserve(t, ctx, stub, event, p)
	reserve(t, ctx, stub, other, p)
	payout := &PayoutContract{}
	oracle := &OracleQuorumContract{}
	policy := &PolicyContract{}
	audit := &AuditContract{}

	payouts, err := payout.ListPayouts(ctx, p.ID, 1, "")
	if page := must(t, payouts, err); len(page.Records) != 1 || page.Bookmark == "" {
		t.Fatal(page)
	}
	next, err := payout.ListPayouts(ctx, p.ID, 1, payouts.Bookmark)
	if page := must(t, next, err); len(page.Records) != 1 || page.Records[0].ID == payouts.Records[0].ID {
		t.Fatal(page)
	}
	events, err := oracle.ListEvents(ctx, "mumbai", 1, "")
	if page := must(t, events, err); len(page.Records) != 1 || page.Records[0].Key != event.Key || page.Bookmark == "" {
		t.Fatal(page)
	}
	_, err = oracle.ListEvents(ctx, "mumbai", 0, "")
	checkCode(t, err, validation)
	_, err = oracle.ListEvents(ctx, "invalid", 1, "")
	checkCode(t, err, validation)
	_, err = payout.GetPayout(ctx, "invalid")
	checkCode(t, err, validation)
	_, err = payout.GetPayout(ctx, digest("missing"))
	checkCode(t, err, notFound)
	_, err = oracle.GetEvent(ctx, "invalid")
	checkCode(t, err, validation)
	_, err = policy.GetPolicy(ctx, "malformed id")
	checkCode(t, err, validation)
	_, err = policy.GetPolicy(ctx, "missing")
	checkCode(t, err, notFound)
	stub.now = p.EndsAt
	expiredPage, err := policy.ListPoliciesByZone(ctx, p.Terms.Zone, expired, 10, "")
	if page := must(t, expiredPage, err); len(page.Policies) != 1 || page.Policies[0].Status != expired {
		t.Fatal(page)
	}
	_, err = policy.ListPoliciesByZone(ctx, "invalid", active, 1, "")
	checkCode(t, err, validation)
	_, err = audit.GetHistory(ctx, "payout:"+a.ID)
	checkCode(t, err, unauthorized)
	_, err = audit.GetPolicySummary(ctx, p.ID)
	checkCode(t, err, unauthorized)
	_, err = audit.GetEventSummary(ctx, event.Key)
	checkCode(t, err, unauthorized)
	_, err = audit.Reconcile(ctx, a.Week, "mumbai", 10, "")
	checkCode(t, err, unauthorized)

	as(ctx, "visitor", "visitor-test")
	_, err = payout.GetPayout(ctx, a.ID)
	checkCode(t, err, unauthorized)
	_, err = payout.ListPayouts(ctx, p.ID, 1, "")
	checkCode(t, err, unauthorized)
	_, err = oracle.GetEvent(ctx, event.Key)
	checkCode(t, err, unauthorized)
	_, err = oracle.ListEvents(ctx, "mumbai", 1, "")
	checkCode(t, err, unauthorized)
	_, err = oracle.SubmitReading(ctx, Observation{})
	checkCode(t, err, unauthorized)
	_, err = policy.GetPolicy(ctx, p.ID)
	checkCode(t, err, unauthorized)
	_, err = policy.ListPoliciesByZone(ctx, "mumbai", active, 1, "")
	checkCode(t, err, unauthorized)
	_, err = policy.CreatePolicy(ctx, "new")
	checkCode(t, err, unauthorized)
	_, err = policy.RecordPremiumPaid(ctx, p.ID, 1, 1, "premium-new", "new")
	checkCode(t, err, unauthorized)
	_, err = policy.CancelPolicy(ctx, p.ID, "new")
	checkCode(t, err, unauthorized)
	_, err = (&ConfigContract{}).GetConfig(ctx)
	checkCode(t, err, unauthorized)
}

func TestReplayBindingAndMalformedInputs(t *testing.T) {
	ctx, stub := testContext()
	p := enroll(t, ctx, stub, "policy-main", "mumbai")
	policy := &PolicyContract{}
	_, err := policy.CreatePolicy(ctx, "another")
	checkCode(t, err, conflict)
	stub.transient[workerCollection] = []byte(`{"identity":"SIMULATED"}`)
	_, err = policy.CreatePolicy(ctx, "invalid-salt")
	checkCode(t, err, validation)
	stub.transient[workerCollection] = make([]byte, 2049)
	_, err = policy.CreatePolicy(ctx, "oversized")
	checkCode(t, err, validation)
	pay(t, ctx, p.ID, 1, "premium-test")
	payment, err := policy.RecordPremiumPaid(ctx, p.ID, 1, p.Terms.PremiumAmount, "premium-test", "alias")
	if must(t, payment, err).Status != active {
		t.Fatal(payment)
	}
	_, err = policy.RecordPremiumPaid(ctx, p.ID, 1, p.Terms.PremiumAmount, "changed-ref", "alias")
	checkCode(t, err, conflict)
	_, err = policy.RecordPremiumPaid(ctx, p.ID, 2, p.Terms.PremiumAmount, "premium-test", "unrelated-request")
	checkCode(t, err, conflict)
	_, err = policy.RecordPremiumPaid(ctx, p.ID, 1, 0, "premium-test", "bad-amount")
	checkCode(t, err, validation)
	_, err = (&PayoutContract{}).RecordSettlement(ctx, "invalid", failed, "ref", "test")
	checkCode(t, err, validation)
	as(ctx, "oracle", "")
	_, err = (&OracleQuorumContract{}).SubmitReading(ctx, Observation{})
	checkCode(t, err, unauthorized)
	as(ctx, "oracle", "oracle-1")
	_, err = (&OracleQuorumContract{}).SubmitReading(ctx, Observation{Zone: "invalid"})
	checkCode(t, err, validation)

	as(ctx, "insurer", "insurer-test")
	_, err = policy.CancelPolicy(ctx, p.ID, "not valid")
	checkCode(t, err, validation)
	if err.Error() != "ERR_VALIDATION: invalid idempotency key" {
		t.Fatal(err)
	}
	_, err = policy.CancelPolicy(ctx, p.ID, "close")
	if err != nil {
		t.Fatal(err)
	}
	_, err = policy.CancelPolicy(ctx, p.ID, "again")
	checkCode(t, err, stateError)
	stub.state["policy:"+p.ID] = []byte("corrupt")
	_, err = policy.GetPolicy(ctx, p.ID)
	checkCode(t, err, stateError)
	stub.now = 0
	_, err = timestamp(ctx)
	checkCode(t, err, stateError)
}
