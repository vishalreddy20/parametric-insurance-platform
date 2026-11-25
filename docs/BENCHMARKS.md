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
