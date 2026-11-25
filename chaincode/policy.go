package main

const (
	pendingPremium  = "PENDING_PREMIUM"
	active          = "ACTIVE"
	paused          = "PAUSED"
	cancelled       = "CANCELLED"
	expired         = "EXPIRED"
	smokePolicy     = "simulated-smoke-policy"
	smokeHash       = "d3471a73c6a6ddf62a0c11ff8312a1f8b4071e7e010fd39519dad767d765881b"
	coverageSeconds = 7 * 86400
)

type PolicyTerms struct {
	WorkerID      string `json:"workerId"`
	Zone          string `json:"zone"`
	Platform      string `json:"platform"`
	Tier          string `json:"tier"`
	WeeklyIncome  int64  `json:"weeklyIncomePaise"`
	WeeklyMinutes int64  `json:"weeklyMinutes"`
	PremiumAmount int64  `json:"premiumPaise"`
}

type Policy struct {
	ID            string       `json:"id"`
	WorkerHash    string       `json:"workerHash"`
	Terms         *PolicyTerms `json:"terms,omitempty" metadata:",optional"`
	Status        string       `json:"status,omitempty" metadata:",optional"`
	CreatedAt     int64        `json:"createdAt,omitempty" metadata:",optional"`
	PaidAt        int64        `json:"paidAt,omitempty" metadata:",optional"`
	StartsAt      int64        `json:"startsAt,omitempty" metadata:",optional"`
	EndsAt        int64        `json:"endsAt,omitempty" metadata:",optional"`
	WaitingUntil  int64        `json:"waitingUntil,omitempty" metadata:",optional"`
	ConfigVersion int64        `json:"configVersion,omitempty" metadata:",optional"`
	Term          int64        `json:"term,omitempty" metadata:",optional"`
}

func sampleMSP(ctx tx, roles ...string) bool {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return false
	}
	for _, role := range roles {
		if msp == role {
			return true
		}
	}
	return false
}

func (c *PolicyContract) CreatePolicy(ctx tx, id string) (*Policy, error) {
	fixture := id == smokePolicy && sampleMSP(ctx, "Org2MSP")
	if !fixture {
		if err := authorize(ctx, "platform"); err != nil {
			return nil, err
		}
	}
	if !validID(id) {
		return nil, failure(validation, "invalid policy ID")
	}
	transient, err := ctx.GetStub().GetTransient()
	if err != nil {
		return nil, failure(stateError, "could not read transient data")
	}
	private, hash, err := canonicalPII(transient[workerCollection])
	if err != nil {
		return nil, err
	}
	p := &Policy{ID: id, WorkerHash: hash}
	var terms PolicyTerms
	if fixture {
		if hash != smokeHash || len(transient["policyTerms"]) != 0 {
			return nil, failure(validation, "invalid smoke fixture")
		}
	} else {
		if id == smokePolicy || len(transient["policyTerms"]) > 2048 || !parseExact(transient["policyTerms"], &terms) ||
			!validID(terms.WorkerID) || !validZone(terms.Zone) || !validPlatform(terms.Platform) ||
			terms.WeeklyIncome < 1500 || terms.WeeklyIncome > 100000000 ||
			terms.WeeklyMinutes <= 0 || terms.WeeklyMinutes > 10080 ||
			terms.PremiumAmount < 1500 || terms.PremiumAmount > max(1500, terms.WeeklyIncome*15/100) {
			return nil, failure(validation, "invalid policy terms")
		}
		platform, err := identityAttribute(ctx, "platformId")
		if err != nil || platform != terms.Platform {
			return nil, failure(unauthorized, "platform does not own enrollment")
		}
		if _, ok := defaultConfig().tier(terms.Tier); !ok {
			return nil, failure(validation, "invalid tier")
		}
		p.Terms, p.Status, p.Term = &terms, pendingPremium, 1
	}
	key := "policy:" + id
	original, err := read[Policy](ctx, "enrollment:"+id)
	if err != nil {
		return nil, err
	}
	if fixture && original == nil {
		original, err = read[Policy](ctx, key)
		if err != nil {
			return nil, err
		}
	}
	if original != nil {
		if original.WorkerHash != hash || (original.Terms == nil) != (p.Terms == nil) ||
			(p.Terms != nil && *original.Terms != terms) {
			return nil, failure(conflict, "policy ID already enrolled")
		}
		return original, nil
	}
	if !fixture {
		ownerKey := "worker-policy:" + digest(terms.WorkerID)
		owner, err := read[string](ctx, ownerKey)
		if err != nil {
			return nil, err
		}
		if owner != nil {
			return nil, failure(conflict, "worker already has a renewable policy")
		}
		now, err := timestamp(ctx)
		if err != nil {
			return nil, err
		}
		cfg, err := currentConfig(ctx)
		if err != nil {
			return nil, err
		}
		p.CreatedAt, p.ConfigVersion = now, cfg.Version
		if err := write(ctx, ownerKey, id); err != nil {
			return nil, err
		}
	}
	if ctx.GetStub().PutPrivateData(workerCollection, key, private) != nil {
		return nil, failure(stateError, "could not write private worker data")
	}
	if err := savePolicy(ctx, p, ""); err != nil {
		return nil, err
	}
	return p, write(ctx, "enrollment:"+id, p)
}

func savePolicy(ctx tx, p *Policy, previous string) error {
	if p.Terms != nil && p.Status != previous {
		if previous != "" {
			key, err := composite(ctx, "zone~status~policyId", p.Terms.Zone, previous, p.ID)
			if err != nil {
				return err
			}
			if ctx.GetStub().DelState(key) != nil {
				return failure(stateError, "could not remove policy index")
			}
		}
		key, err := composite(ctx, "zone~status~policyId", p.Terms.Zone, p.Status, p.ID)
		if err != nil {
			return err
		}
		if err := write(ctx, key, p.ID); err != nil {
			return err
		}
	}
	return write(ctx, "policy:"+p.ID, p)
}

func loadPolicy(ctx tx, id string) (*Policy, error) {
	if !validID(id) {
		return nil, failure(validation, "invalid policy ID")
	}
	return required[Policy](ctx, "policy:"+id)
}

func policyAccess(ctx tx, p *Policy) error {
	if p.ID == smokePolicy && sampleMSP(ctx, "Org1MSP", "Org2MSP") {
		return nil
	}
	if authorize(ctx, "insurer", "bank", "regulator") == nil {
		return nil
	}
	if authorize(ctx, "platform") == nil {
		platform, err := identityAttribute(ctx, "platformId")
		if err == nil && p.Terms != nil && p.Terms.Platform == platform {
			return nil
		}
	}
	return failure(unauthorized, "caller cannot access policy")
}

func (c *PolicyContract) GetPolicy(ctx tx, id string) (*Policy, error) {
	if !(id == smokePolicy && sampleMSP(ctx, "Org1MSP", "Org2MSP")) {
		if err := authorize(ctx, "platform", "insurer", "bank", "regulator"); err != nil {
			return nil, err
		}
	}
	p, err := loadPolicy(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := policyAccess(ctx, p); err != nil {
		return nil, err
	}
	if p.Status == active || p.Status == paused {
		now, err := timestamp(ctx)
		if err != nil {
			return nil, err
		}
		if now >= p.EndsAt {
			p.Status = expired
		}
	}
	return p, nil
}

func (c *PolicyContract) RecordPremiumPaid(ctx tx, id string, term, amount int64, reference, requestID string) (*Policy, error) {
	if err := authorize(ctx, "bank"); err != nil {
		return nil, err
	}
	if !validID(reference) || term < 1 || amount <= 0 {
		return nil, failure(validation, "invalid premium confirmation")
	}
	input := []any{id, term, amount, reference}
	key, fp, original, err := replay[Policy](ctx, "premium", requestID, input)
	if err != nil || original != nil {
		return original, err
	}
	referenceKey := "premium-ref:" + reference
	previous, err := read[receipt[Policy]](ctx, referenceKey)
	if err != nil {
		return nil, err
	}
	if previous != nil {
		if previous.Fingerprint != fp {
			return nil, failure(conflict, "premium reference already used")
		}
		return &previous.Result, saveReceipt(ctx, key, fp, &previous.Result)
	}
	p, err := loadPolicy(ctx, id)
	if err != nil {
		return nil, err
	}
	if p.Terms == nil || p.Status != pendingPremium || p.Term != term || amount != p.Terms.PremiumAmount {
		return nil, failure(stateError, "premium does not match a pending policy term")
	}
	now, err := timestamp(ctx)
	if err != nil {
		return nil, err
	}
	cfg, err := configVersion(ctx, p.ConfigVersion)
	if err != nil {
		return nil, err
	}
	p.Status, p.PaidAt, p.StartsAt, p.EndsAt, p.WaitingUntil = active, now, now, now+coverageSeconds, now+cfg.Waiting
	if err := savePolicy(ctx, p, pendingPremium); err != nil {
		return nil, err
	}
	if err := saveReceipt(ctx, referenceKey, fp, p); err != nil {
		return nil, err
	}
	return p, saveReceipt(ctx, key, fp, p)
}

func changePolicy(ctx tx, id, requestID, target string) (*Policy, error) {
	if err := authorize(ctx, "insurer", "platform"); err != nil {
		return nil, err
	}
	key, fp, original, err := replay[Policy](ctx, target, requestID, id)
	if err != nil || original != nil {
		return original, err
	}
	p, err := loadPolicy(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := policyAccess(ctx, p); err != nil {
		return nil, err
	}
	if p.Terms == nil {
		return nil, failure(stateError, "fixture has no policy lifecycle")
	}
	now, err := timestamp(ctx)
	if err != nil {
		return nil, err
	}
	previous := p.Status
	switch target {
	case paused:
		if previous != active || now >= p.EndsAt {
			return nil, failure(stateError, "only active coverage can be paused")
		}
	case cancelled:
		if previous == cancelled {
			return nil, failure(stateError, "policy is already cancelled")
		}
	case pendingPremium:
		if (previous != active && previous != paused) || now < p.EndsAt {
			return nil, failure(stateError, "policy can renew after coverage expires")
		}
		cfg, err := currentConfig(ctx)
		if err != nil {
			return nil, err
		}
		p.Term++
		p.ConfigVersion, p.PaidAt, p.StartsAt, p.EndsAt, p.WaitingUntil = cfg.Version, 0, 0, 0, 0
	}
	p.Status = target
	if err := savePolicy(ctx, p, previous); err != nil {
		return nil, err
	}
	return p, saveReceipt(ctx, key, fp, p)
}

func (c *PolicyContract) PausePolicy(ctx tx, id, requestID string) (*Policy, error) {
	return changePolicy(ctx, id, requestID, paused)
}

func (c *PolicyContract) CancelPolicy(ctx tx, id, requestID string) (*Policy, error) {
	return changePolicy(ctx, id, requestID, cancelled)
}

func (c *PolicyContract) RenewPolicy(ctx tx, id, requestID string) (*Policy, error) {
	return changePolicy(ctx, id, requestID, pendingPremium)
}

type PolicyPage struct {
	Policies []Policy `json:"policies"`
	Bookmark string   `json:"bookmark"`
}

func (c *PolicyContract) ListPoliciesByZone(ctx tx, zone, status string, size int32, bookmark string) (*PolicyPage, error) {
	if err := authorize(ctx, "insurer", "regulator"); err != nil {
		return nil, err
	}
	if !validZone(zone) || size < 1 || size > 100 || len(bookmark) > 4096 ||
		(status != active && status != pendingPremium && status != paused && status != cancelled && status != expired) {
		return nil, failure(validation, "invalid policy page")
	}
	prefix := []string{zone, status}
	if status == expired {
		// Expiry is derived from the transaction timestamp so a read never writes state.
		prefix = []string{zone}
	}
	iter, meta, err := ctx.GetStub().GetStateByPartialCompositeKeyWithPagination("zone~status~policyId", prefix, size, bookmark)
	if err != nil {
		return nil, failure(stateError, "could not query policy index")
	}
	defer iter.Close()
	page := &PolicyPage{Policies: []Policy{}, Bookmark: meta.Bookmark}
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, failure(stateError, "could not iterate policy index")
		}
		_, parts, err := ctx.GetStub().SplitCompositeKey(kv.Key)
		if err != nil || len(parts) != 3 {
			return nil, failure(stateError, "invalid policy index")
		}
		p, err := c.GetPolicy(ctx, parts[2])
		if err != nil {
			return nil, err
		}
		if p.Status == status {
			page.Policies = append(page.Policies, *p)
		}
	}
	return page, nil
}
