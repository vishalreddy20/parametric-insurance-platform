# Surge benchmark

Measured by `scripts/surge-test` on 2026-11-25T09:33:14.682Z.

| Lite Peers | Policies | Settled | Failures | Payouts/s | p50 (ms) | p95 (ms) | MVCC retries | End-to-end (ms) | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 2 | 32 | 32 | 0 | 0.66 | 41302.74 | 48778.42 | 0 | 80026.34 | PASS |

- Network NPCI DRUNIX `8090e0ce58802c8a0f13d23a6abe5a2d35456cc5` with YugabyteDB. Chaincode 3.1.
- Machine 12th Gen Intel(R) Core(TM) i5-12500H, 16 logical CPUs, 7.6 GiB RAM, Linux 6.18.33.2-microsoft-standard-WSL2. Docker 29.9.3, Node v20.20.2.
- Payout rate and percentiles use the elapsed time from storm submission to observed terminal ledger state. This includes signed demo-window closure, fan-out, simulated settlement and polling. End-to-end also includes policy setup.
- The documented sample has fixed two-org Lite Peer endpoints and no four-Lite-Peer scaling procedure. Four Lite Peers were not benchmarked.
- The oracle inputs, identities and UPI were simulated. Ledger writes, commit, reconciliation and the stated timings were measured.

## Follow-up profiling and tuning

The runs below use the same two-peer topology and machine listed above, with
DRUNIX revision `8090e0ce58802c8a0f13d23a6abe5a2d35456cc5`, chaincode 3.1,
YugabyteDB, Docker 29.9.3, and Node v20.20.2. The mock UPI delay was 100 ms
and its configured failure rate was zero.

### What consumed the time

The original worker used 25-policy pages, five concurrent reservations, five
concurrent settlement requests, and a one-second poll. Its single loop could
hold up settlement while a reservation page awaited commit. The tuned worker
uses 100-policy pages, 24 concurrent reservations, 24 concurrent settlement
requests, a 100 ms poll, and separate bounded lanes. Benchmark preparation and
readback use 24 concurrent requests. The timed observer uses point lookups
for deterministic payout IDs. The reconciliation scan still checks the exact
settled count and amount for the workload zone, and the runner verifies every
UPI receipt.

The gateway measures endorsement, the orderer submission RPC, and the wait for
a valid commit separately. The RPC measures submission acknowledgement.
The subsequent wait includes ordering, block delivery, validation, and commit
notification. The UPI delay column measures the injected delay and scheduler
overhead. It excludes the bank callback, which is profiled separately where
available.

| Profile | Stage | Valid samples | p50 (ms) | p95 (ms) |
| --- | --- | ---: | ---: | ---: |
| Effective 2 s | Reservation endorsement | 39 | 246.97 | 736.97 |
| Effective 2 s | Reservation submit RPC | 39 | 7.40 | 21.03 |
| Effective 2 s | Reservation commit wait | 39 | 2679.24 | 2998.47 |
| Effective 2 s | Settlement endorsement | 32 | 58.34 | 70.46 |
| Effective 2 s | Settlement submit RPC | 32 | 24.31 | 39.90 |
| Effective 2 s | Settlement commit wait | 32 | 2372.48 | 2721.59 |
| Effective 2 s | Simulated UPI delay | 32 | 102.04 | 104.14 |
| Effective 250 ms, 32 policies | Reservation endorsement | 32 | 247.90 | 284.02 |
| Effective 250 ms, 32 policies | Reservation submit RPC | 32 | 23.88 | 73.26 |
| Effective 250 ms, 32 policies | Reservation commit wait | 32 | 997.90 | 1013.87 |
| Effective 250 ms, 32 policies | Settlement endorsement | 32 | 53.25 | 86.37 |
| Effective 250 ms, 32 policies | Settlement submit RPC | 32 | 33.55 | 53.87 |
| Effective 250 ms, 32 policies | Settlement commit wait | 32 | 569.96 | 648.40 |
| Effective 250 ms, 32 policies | Simulated UPI delay | 32 | 102.12 | 105.07 |
| Effective 250 ms, 200 policies | Reservation endorsement | 200 | 187.58 | 285.41 |
| Effective 250 ms, 200 policies | Reservation submit RPC | 200 | 21.38 | 73.42 |
| Effective 250 ms, 200 policies | Reservation commit wait | 200 | 1097.10 | 1465.95 |
| Effective 250 ms, 200 policies | Settlement endorsement | 200 | 45.01 | 97.12 |
| Effective 250 ms, 200 policies | Settlement submit RPC | 200 | 26.24 | 72.35 |
| Effective 250 ms, 200 policies | Settlement commit wait | 200 | 675.64 | 1410.52 |
| Effective 250 ms, 200 policies | Simulated UPI delay | 200 | 100.74 | 103.32 |
| Effective 250 ms, 200 policies | Mock UPI HTTP with callback | 200 | 921.44 | 1804.46 |

The first profiling passes had a second local gateway attached to the same
sample state. The 2 s reservation profile includes seven extra valid
submissions. The 250 ms effective-cut runs used one gateway instance, with
samples matched to the benchmark event key. These are application-level runs,
with storm submission and polling included as in the baseline. They measure
application throughput under these workloads.

The 200-policy follow-up used two 100-policy fan-out pages. The page reads took
4.10 s and 4.72 s. Including reservation transactions and checkpointing, the
pages took 10.53 s and 10.93 s. Mock UPI HTTP includes the injected delay and
the bank callback's commit wait, so those stages should not be added twice.

### Ordering experiment

A signed channel update set Fabric `BatchTimeout` to 250 ms. The orderer still
produced approximately two-second block gaps. The pinned DRUNIX Raft code uses
a separate `General.Drunix.BlockCutTime` setting. The experiment restored
channel `BatchTimeout` to 2 s, then used a Compose override for
`ORDERER_GENERAL_DRUNIX_BLOCKCUTTIME=0.25`. The orderer reported an active
0.25 s interval and preserved its existing Raft WAL and snapshot state. The
effective DRUNIX max batch remained 200.

For four blocks containing the tuned 32-policy reservation and settlement
traffic, Committing Peer 1 reported commits in 150–775 ms. The time from
orderer block write to the corresponding peer commit log was 167–805 ms.
Shorter block cutting removed much of the idle wait. Validation and commit
still consumed time.

At 1,000 policies, the first attempt recorded all terminal payouts but its
final reconciliation read reached the gateway's 6 s evaluate deadline
(HTTP 503 `ERR_LEDGER_UNAVAILABLE`, 6,002.6 ms). Two fan-out page retries also
recovered. A read-only recheck at the 30 s deadline confirmed all 1,000
settlements across ten pages, with zero duplicates, and matched the ledger,
audit and simulated UPI totals at 60,000,000 paise. The audit sweep lasted
49.477 s. The initial attempt remains a failed benchmark run. The deadline
change applies to evaluation only.

The application continues to confirm each transaction's valid commit before
advancing the corresponding work. The change overlaps independent waits.
Ledger rules, idempotency keys, caps, and the MVCC retry policy are unchanged.
[DRUNIX Raft implementation](https://github.com/npci/drunix/blob/8090e0ce58802c8a0f13d23a6abe5a2d35456cc5/orderer/consensus/etcdraft/chain.go)

### Reproduce

On the verified sample, stop any other gateway using the same chain and
checkpoint directory. Set `DRUNIX_RUNTIME` and `PARASHIELD_DEMO_STATE`, then run:

```bash
scripts/orderer-cut.sh 0.25
npm --prefix gateway run build
PARASHIELD_PROFILE=1 PARASHIELD_PAGE_SIZE=100 PARASHIELD_FANOUT_CONCURRENCY=24 \
PARASHIELD_SETTLEMENT_CONCURRENCY=24 PARASHIELD_WORKER_POLL_MS=100 \
PARASHIELD_UPI_LATENCY_MS=100 PARASHIELD_EVALUATE_TIMEOUT_MS=30000 PARASHIELD_SERVICES_ONLY=1 \
node scripts/demo-stack.mjs > /tmp/parashield-payout-profile.log 2>&1
```

From another terminal sharing those runtime paths, run
`PARASHIELD_SURGE_CONCURRENCY=24 scripts/surge-test 32`, then repeat with 200
and 1000 on eligible clean zones. The latest JSON supplies the `eventKey`.
Run `node scripts/profile-payouts.mjs /tmp/parashield-payout-profile.log EVENT_KEY`
to summarize successful transaction phase samples and count invalid commits.
