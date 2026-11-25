# Threat model

ParaShield runs on an isolated development machine with synthetic data and
demo certificates. The browser and service listeners bind to loopback.
The sample CAs and service credentials belong to the demo operator.

| Threat | Current control and boundary |
| --- | --- |
| Oracle manipulation | The ledger authenticates registered certificate attributes, deduplicates observations and applies versioned thresholds. Collusion at quorum can still declare an event. There is no external feed attestation. Demo early closure requires unanimous signatures and is disabled by default. |
| Replay and concurrent payout | Request receipts, deterministic payout IDs, per-worker-hour keys and policy-week cap read/write sets make retries safe. The gateway retries Fabric MVCC conflicts and endorsement timeouts. A commit timeout returns an uncertain outcome and allows the same operation ID to be reused. |
| Role and tenant abuse | The gateway maps the session to a configured ledger identity. Worker access is policy-scoped and the chaincode checks role and platform attributes on every service operation. The sample CAs can issue multiple roles, so the two MSPs are a development trust boundary. Protect the generated manifest and keep service access loopback-only. |
| PII exposure | The default UI sends only synthetic details. Direct identity, phone and bank fields are transient input and go to `workerPII`. Logs omit bodies, JWTs and credential data. The hash salt is private. Authorized collection members can access the private record. The public worker ID must be an opaque token. |
| Spoofed location or availability | The chaincode checks policy zone and platform-signed activity overlap. It relies on the platform to attest attendance and zone accurately. The demo does not independently validate GPS, devices, or worker identity. |
| Loss of local service state | Durable atomic checkpoints and mock UPI records support restart and replay. Keep the gateway and mock UPI state with the sample network. Production high availability and cross-host storage are outside the demo. |
| DoS and oversize inputs | The API bounds request bodies and page size. Chaincode validates identifiers, enums, money and windows, caps partition scans and avoids global transaction counters. Local credentials and listener binding limit who can reach the demo. |
