# Edge-case verification

| Case | Verification or handling |
| --- | --- |
| Duplicate submissions, premium references and settlement callbacks | Go receipt tests, live enrollment and premium replays, and concurrent mock UPI tests. Stable operation IDs return the original result. |
| Concurrent gateways, worker overlap and MVCC | Reservation reads the policy-week cap and worker-hour lock before writing both atomically. Fabric validates the read/write sets. The gateway retry test injects MVCC failure. A two-gateway race was not forced on the live sample. |
| Crash during fan-out or callback | Gateway test restarts after a partial page. The next run replays that page. Mock UPI test recovers a pending callback after restart. A live fan-out was also resumed after correcting a prematurely completed pagination checkpoint. |
| Oracle disagreement and offline source | Live normal, dissent and offline scenario tests. Go tests also cover 1-of-3, 2-of-3, duplicate and immutable late readings, stale/future observations and an unregistered oracle. |
| Event spans an IST week boundary | Go tests cover Sunday 23:59:59 and Monday 00:00 IST. The event is charged to the week containing its UTC hour-bucket start. |
| Weekly cap reached and payout failure | Go tests cover exact cap, one paisa over, multiple events, settle, fail and release. The 32-policy run asserts aggregate cap and payout reconciliation. |
| Paused or cancelled policy, unpaid or late premium, expiry and waiting period | Go tests reject ineligible states and observation times. Browser and gateway tests verify that premium changes a policy to active only after the simulated callback commits. |
| Wrong zone or missing and mismatched activity | Go payout tests reject these states. Activity is bound to the certificate platform and an overlapping hour. The demo supplies activity before fan-out. A late attestation does not automatically re-run a skipped policy. |
| Clock skew | Chaincode uses the transaction timestamp, rejects future and out-of-freshness readings and future activity, and requires stable time for the demo. No multi-host clock skew was injected. |
| Large fan-out and pagination | The live 1,000-policy rerun reconciled 1,000 unique payouts across ten fan-out pages. An earlier run exposed the sample SQL bookmark gap. The fix uses bounded hash partitions, retains older index keys, and rejects an overfull partition. [Benchmark results](BENCHMARKS.md#fresh-channel-reruns) |
| Invalid and oversized inputs | Zod schemas, HTTP body limits, typed chaincode validation and mock rejection tests. Golden vectors check integer loss compensation in Go and TypeScript. |
| Unauthorized calls and PII | Live role-denial and worker-scope checks, private enrollment path, and a public-readback assertion. There are no bank/phone/identity fields in public state. Logs omit request data and secrets. |
| Gateway restart, offline response and unknown commit | File-based cursor and jobs, gateway replay tests, browser offline/retry and a safe error asking to reuse the same operation ID if commit status is uncertain. No live network partition or Raft failover was injected. |
