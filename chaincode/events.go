package main

import (
	"slices"
	"strconv"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

const hour int64 = 3600
const maxAttestationWindow int64 = 7 * 86400

type ActivityContract struct{ contractapi.Contract }
type OracleQuorumContract struct{ contractapi.Contract }

type Activity struct {
	WorkerID string `json:"workerId"`
	Platform string `json:"platformId"`
	Start    int64  `json:"windowStart"`
	End      int64  `json:"windowEnd"`
}

func (c *ActivityContract) RecordActivityAttestation(ctx tx, activity Activity, id string) (*Activity, error) {
	if err := authorize(ctx, "platform"); err != nil {
		return nil, err
	}
	if !validID(activity.WorkerID) || !validPlatform(activity.Platform) ||
		activity.Start <= 0 || activity.End <= activity.Start || activity.End-activity.Start > maxAttestationWindow {
		return nil, failure(validation, "invalid activity interval")
	}
	platform, err := identityAttribute(ctx, "platformId")
	if err != nil || platform != activity.Platform {
		return nil, failure(unauthorized, "caller cannot attest for this platform")
	}
	key, fp, original, err := replay[Activity](ctx, "activity", id, activity)
	if err != nil || original != nil {
		return original, err
	}
	now, err := timestamp(ctx)
	if err != nil {
		return nil, err
	}
	if activity.End > now {
		return nil, failure(validation, "activity cannot occur in the future")
	}
	index, err := composite(ctx, "activity", activity.WorkerID, activity.Platform, epochKey(activity.Start), epochKey(activity.End))
	if err != nil {
		return nil, err
	}
	if err := write(ctx, index, activity); err != nil {
		return nil, err
	}
	for bucket := activity.Start - activity.Start%hour; bucket < activity.End; bucket += hour {
		if err := write(ctx, activityHourKey(activity.WorkerID, activity.Platform, bucket), true); err != nil {
			return nil, err
		}
	}
	return &activity, saveReceipt(ctx, key, fp, &activity)
}

type Observation struct {
	Zone       string `json:"zone"`
	Trigger    string `json:"triggerType"`
	Start      int64  `json:"windowStart"`
	Value      int64  `json:"value"`
	Unit       string `json:"unit"`
	ObservedAt int64  `json:"observedAt"`
}

type Reading struct {
	OracleID   string `json:"oracleId"`
	Value      int64  `json:"value"`
	ObservedAt int64  `json:"observedAt"`
	Breach     bool   `json:"breach"`
}

type Event struct {
	Key           string    `json:"eventKey"`
	Zone          string    `json:"zone"`
	Trigger       string    `json:"triggerType"`
	Start         int64     `json:"windowStart"`
	End           int64     `json:"windowEnd"`
	Unit          string    `json:"unit"`
	Status        string    `json:"status"`
	Code          string    `json:"code"`
	ConfigVersion int64     `json:"configVersion"`
	Quorum        int       `json:"quorum"`
	LostHours     int64     `json:"lostHours"`
	DeclaredAt    int64     `json:"declaredAt"`
	ObservedAt    int64     `json:"observedAt"`
	TxID          string    `json:"txId"`
	Readings      []Reading `json:"readings"`
}

const declared = "DECLARED"
const pending = "PENDING"

func eventKey(zone, trigger string, start int64) string {
	return zone + "|" + trigger + "|" + strconv.FormatInt(start, 10)
}

func validEventKey(key string) bool {
	before, start, ok := strings.Cut(key, "|")
	trigger, begin, more := strings.Cut(start, "|")
	epoch, err := strconv.ParseInt(begin, 10, 64)
	_, known := defaultConfig().trigger(trigger)
	return ok && more && validZone(before) && known && err == nil && epoch > 0 && epoch%hour == 0 && key == eventKey(before, trigger, epoch)
}

func (c *OracleQuorumContract) SubmitReading(ctx tx, observation Observation) (*Event, error) {
	if err := authorize(ctx, "oracle"); err != nil {
		return nil, err
	}
	oracle, err := identityAttribute(ctx, "oracleId")
	if err != nil {
		return nil, err
	}
	if !validZone(observation.Zone) || observation.Start <= 0 || observation.Start%hour != 0 ||
		observation.ObservedAt < observation.Start || observation.ObservedAt-observation.Start >= hour {
		return nil, failure(validation, "invalid observation window or zone")
	}
	key := eventKey(observation.Zone, observation.Trigger, observation.Start)
	if !validEventKey(key) {
		return nil, failure(validation, "unknown trigger")
	}
	readingKey := "reading:" + digest(key, oracle)
	original, err := read[Event](ctx, readingKey)
	if err != nil || original != nil {
		return original, err
	}
	now, err := timestamp(ctx)
	if err != nil {
		return nil, err
	}
	event, err := read[Event](ctx, "event:"+key)
	if err != nil {
		return nil, err
	}

	if event == nil || event.Status != declared {
		window, err := read[DemoWindow](ctx, demoWindowKey(observation.Zone, observation.Start))
		if err != nil {
			return nil, err
		}
		if window != nil && (window.Closed || slices.Contains(window.Signers, oracle)) {
			return nil, failure(conflict, "the oracle has sealed this demo reading window")
		}
	}

	var cfg *Config
	if event == nil {
		cfg, err = currentConfig(ctx)
	} else {
		cfg, err = configVersion(ctx, event.ConfigVersion)
	}
	if err != nil {
		return nil, err
	}
	// Revocations are effective immediately, while the rule and quorum for each event are versioned.
	current, err := currentConfig(ctx)
	if err != nil {
		return nil, err
	}
	if !slices.Contains(cfg.Oracles, oracle) || !slices.Contains(current.Oracles, oracle) {
		return nil, failure(unauthorized, "oracle is not registered")
	}
	if observation.ObservedAt > now || now-observation.ObservedAt > cfg.Freshness || now-observation.Start >= hour+maxFreshness {
		return nil, failure(validation, "reading is stale or future dated")
	}
	rule, ok := cfg.trigger(observation.Trigger)
	if !ok || observation.Unit != rule.Unit || observation.Value < rule.Min || observation.Value > rule.Max {
		return nil, failure(validation, "invalid reading unit or value")
	}
	if event == nil {
		event = &Event{Key: key, Zone: observation.Zone, Trigger: observation.Trigger, Start: observation.Start, End: observation.Start + hour,
			Unit: rule.Unit, Status: pending, Code: quorumPending, ConfigVersion: cfg.Version, Quorum: cfg.Quorum, LostHours: rule.LostHours, Readings: []Reading{}}
	}
	reading := Reading{OracleID: oracle, Value: observation.Value, ObservedAt: observation.ObservedAt, Breach: observation.Value >= rule.Threshold}
	if err := write(ctx, "observation:"+digest(key, oracle), reading); err != nil {
		return nil, err
	}
	if event.Status != declared {
		event.Readings = append(event.Readings, reading)
		breaches := 0
		latest := event.Start
		for _, record := range event.Readings {
			if record.Breach {
				breaches++
				latest = max(latest, record.ObservedAt)
			}
		}
		if breaches >= event.Quorum {
			event.Status, event.Code, event.DeclaredAt, event.ObservedAt, event.TxID = declared, "", now, latest, ctx.GetStub().GetTxID()
			if err := emit(ctx, "EventDeclared", event); err != nil {
				return nil, err
			}
		}
		if err := indexRecord(ctx, "event~zone~start~trigger", []string{event.Zone, epochKey(event.Start), event.Trigger}, key); err != nil {
			return nil, err
		}
		if err := write(ctx, "event:"+key, event); err != nil {
			return nil, err
		}
	}
	return event, write(ctx, readingKey, event)
}

func loadEvent(ctx tx, key string) (*Event, error) {
	if !validEventKey(key) {
		return nil, failure(validation, "invalid event key")
	}
	return required[Event](ctx, "event:"+key)
}

type EventPage ledgerPage[Event]

func (c *OracleQuorumContract) GetEvent(ctx tx, key string) (*Event, error) {
	if err := authorize(ctx, "oracle", "bank", "insurer", "platform", "regulator"); err != nil {
		return nil, err
	}
	return loadEvent(ctx, key)
}

func (c *OracleQuorumContract) ListEvents(ctx tx, zone string, size int32, bookmark string) (*EventPage, error) {
	if err := authorize(ctx, "oracle", "bank", "insurer", "platform", "regulator"); err != nil {
		return nil, err
	}
	if !validZone(zone) {
		return nil, failure(validation, "invalid event zone")
	}
	page, err := indexedPage[Event](ctx, "event~zone~start~trigger", []string{zone}, size, bookmark, "event:")
	return (*EventPage)(page), err
}
