package main

import (
	"slices"
	"strconv"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

const maxFreshness int64 = 3600

type ConfigContract struct{ contractapi.Contract }

type Tier struct {
	Cap    int64 `json:"cap"`
	Factor int64 `json:"factor"`
}

type Trigger struct {
	Code      string `json:"code"`
	Unit      string `json:"unit"`
	Threshold int64  `json:"threshold"`
	Min       int64  `json:"min"`
	Max       int64  `json:"max"`
	LostHours int64  `json:"lostHours"`
}

type Config struct {
	Version   int64     `json:"version"`
	Quorum    int       `json:"quorum"`
	Freshness int64     `json:"freshness"`
	Waiting   int64     `json:"waiting"`
	DemoClose bool      `json:"demoClose"`
	Oracles   []string  `json:"oracles"`
	Basic     Tier      `json:"basic"`
	Standard  Tier      `json:"standard"`
	Premium   Tier      `json:"premium"`
	Triggers  []Trigger `json:"triggers"`
}

func defaultConfig() Config {
	return Config{Version: 0, Quorum: 2, Freshness: 1800, Waiting: 86400,
		Oracles: []string{"oracle-1", "oracle-2", "oracle-3"},
		Basic:   Tier{100000, 80}, Standard: Tier{100000, 100}, Premium: Tier{150000, 120},
		Triggers: []Trigger{
			{"moderate_rainfall", "mm/day", 45, 0, 2000, 3},
			{"heavy_rainfall", "mm/day", 60, 0, 2000, 5},
			{"extreme_heat", "celsius", 45, -60, 80, 4},
			{"severe_storm", "km/h", 60, 0, 500, 6},
			{"hazardous_pollution", "aqi", 300, 0, 1000, 3},
			{"moderate_traffic_disruption", "score", 70, 0, 100, 2},
			{"severe_traffic_gridlock", "score", 85, 0, 100, 4},
			{"event_route_closure", "score", 85, 0, 100, 3},
			{"dispatch_degradation", "score", 90, 0, 100, 2},
			{"platform_outage", "score", 96, 0, 100, 5},
			{"strike", "confidence", 50, 0, 100, 8},
			{"shutdown", "confidence", 50, 0, 100, 5},
			{"curfew", "confidence", 50, 0, 100, 5},
			{"protest", "confidence", 50, 0, 100, 4},
		},
	}
}

func (cfg Config) tier(name string) (Tier, bool) {
	switch name {
	case "basic":
		return cfg.Basic, true
	case "standard":
		return cfg.Standard, true
	case "premium":
		return cfg.Premium, true
	default:
		return Tier{}, false
	}
}

func (cfg Config) trigger(code string) (Trigger, bool) {
	for _, rule := range cfg.Triggers {
		if rule.Code == code {
			return rule, true
		}
	}
	return Trigger{}, false
}

func currentConfig(ctx tx) (*Config, error) {
	cfg, err := read[Config](ctx, "config:current")
	if err == nil && cfg == nil {
		initial := defaultConfig()
		cfg = &initial
	}
	return cfg, err
}

func configVersion(ctx tx, version int64) (*Config, error) {
	if version == 0 {
		cfg := defaultConfig()
		return &cfg, nil
	}
	return required[Config](ctx, "config:version:"+strconv.FormatInt(version, 10))
}

func (c *ConfigContract) GetConfig(ctx tx) (*Config, error) {
	if err := authorize(ctx, "insurer", "platform", "bank", "oracle", "regulator"); err != nil {
		return nil, err
	}
	return currentConfig(ctx)
}

func (c *ConfigContract) SetConfig(ctx tx, cfg Config, id string) (*Config, error) {
	if err := authorize(ctx, "insurer"); err != nil {
		return nil, err
	}
	key, fingerprint, original, err := replay[Config](ctx, "config", id, cfg)
	if err != nil || original != nil {
		return original, err
	}
	if !validConfig(cfg) {
		return nil, failure(validation, "invalid configuration")
	}
	current, err := currentConfig(ctx)
	if err != nil {
		return nil, err
	}
	if cfg.Version != current.Version {
		return nil, failure(conflict, "configuration version changed")
	}
	cfg.Version++
	if err := write(ctx, "config:version:"+strconv.FormatInt(cfg.Version, 10), cfg); err != nil {
		return nil, err
	}
	if err := write(ctx, "config:current", cfg); err != nil {
		return nil, err
	}
	return &cfg, saveReceipt(ctx, key, fingerprint, &cfg)
}

func validConfig(cfg Config) bool {
	if cfg.Quorum < 1 || len(cfg.Oracles) < cfg.Quorum || len(cfg.Oracles) > 9 ||
		cfg.Freshness < 1 || cfg.Freshness > maxFreshness || cfg.Waiting < 0 || cfg.Waiting > 604800 {
		return false
	}
	for i, oracle := range cfg.Oracles {
		if !validID(oracle) || slices.Contains(cfg.Oracles[:i], oracle) {
			return false
		}
	}
	for _, tier := range []Tier{cfg.Basic, cfg.Standard, cfg.Premium} {
		if tier.Cap < 5000 || tier.Cap > 100000000 || tier.Factor <= 0 || tier.Factor > 200 {
			return false
		}
	}
	defaults := defaultConfig()
	if len(cfg.Triggers) != len(defaults.Triggers) {
		return false
	}
	for i, trigger := range cfg.Triggers {
		base := defaults.Triggers[i]
		if trigger.Code != base.Code || trigger.Unit != base.Unit || trigger.Min != base.Min ||
			trigger.Max != base.Max || trigger.Threshold < base.Min || trigger.Threshold > base.Max ||
			trigger.LostHours < 1 || trigger.LostHours > 24 {
			return false
		}
	}
	return true
}
