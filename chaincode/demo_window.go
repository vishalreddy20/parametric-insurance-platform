package main

import (
	"slices"
	"strconv"
)

type DemoWindow struct {
	Zone          string   `json:"zone"`
	Start         int64    `json:"windowStart"`
	ConfigVersion int64    `json:"configVersion"`
	Signers       []string `json:"signers"`
	Closed        bool     `json:"closed"`
}

func demoWindowKey(zone string, start int64) string {
	return "demo-window:" + zone + ":" + strconv.FormatInt(start, 10)
}

// CloseDemoWindow is available only when an insurer enables demo closure.
// A completed window requires unanimous, distinct oracle attestations.
func (c *OracleQuorumContract) CloseDemoWindow(ctx tx, zone string, start int64) (*DemoWindow, error) {
	if err := authorize(ctx, "oracle"); err != nil {
		return nil, err
	}
	oracle, err := identityAttribute(ctx, "oracleId")
	if err != nil {
		return nil, err
	}
	if !validZone(zone) || start <= 0 || start%hour != 0 {
		return nil, failure(validation, "invalid demo window")
	}
	key := demoWindowKey(zone, start)
	receiptKey := "demo-window-replay:" + digest(key, oracle)
	existing, err := read[DemoWindow](ctx, receiptKey)
	if err != nil || existing != nil {
		return existing, err
	}
	cfg, err := currentConfig(ctx)
	if err != nil {
		return nil, err
	}
	if !cfg.DemoClose || !slices.Contains(cfg.Oracles, oracle) {
		return nil, failure(unauthorized, "demo closure is disabled or the oracle is not registered")
	}
	now, err := timestamp(ctx)
	if err != nil {
		return nil, err
	}
	if now < start || now-start >= hour+maxFreshness {
		return nil, failure(validation, "demo closure is outside the active observation window")
	}
	window, err := read[DemoWindow](ctx, key)
	if err != nil {
		return nil, err
	}
	if window == nil {
		window = &DemoWindow{Zone: zone, Start: start, ConfigVersion: cfg.Version, Signers: []string{}}
	} else if window.ConfigVersion != cfg.Version {
		return nil, failure(conflict, "cannot finish a demo closure across configuration versions")
	}
	window.Signers = append(window.Signers, oracle)
	window.Closed = len(window.Signers) == len(cfg.Oracles)
	if err := write(ctx, key, window); err != nil {
		return nil, err
	}
	if err := write(ctx, receiptKey, window); err != nil {
		return nil, err
	}
	if window.Closed {
		if err := emit(ctx, "DemoWindowClosed", window); err != nil {
			return nil, err
		}
	}
	return window, nil
}
