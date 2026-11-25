# Real and simulated behavior

| Behavior | Implementation |
| --- | --- |
| Worker, platform, insurer, bank, oracle and regulator identities | **SIMULATED** demo identities. Their role certificates are signed by the two actual sample MSP CAs. |
| Weather, traffic, social and platform observations | **SIMULATED** scenario inputs. The oracle service uses distinct signing identities and deterministic variation. |
| Premium collection and payout transfer | **SIMULATED** UPI. No money moves. The service persists its outcomes and delivers authenticated callbacks. |
| Policy, activity, quorum, payout and audit state | Real chaincode state and transactions on DRUNIX. |
| Two-organization endorsement and commit | Real sample endorsement and ledger commit. Organizational role isolation relies on certificate attributes within those two MSPs. |
| Private enrollment inputs | Real transient and private collection writes. Every walkthrough uses synthetic details. |
| Duplicate handling and caps | Real ledger idempotency, worker-hour locks and weekly cap accounting. |
| Surge results | Measured on the documented WSL2 sample using simulated inputs. No production throughput estimate is made. |
| Local fixture mode | **SIMULATED** browser records. It displays no ledger proof and runs no payout decision. |
| Production insurance, live feeds, payment rails and Falcon deployment | Outside this demo. |
