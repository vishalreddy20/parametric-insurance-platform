# Real and simulated behavior

| Behavior | Implementation |
| --- | --- |
| Worker, platform, insurer, bank, oracle and regulator identities | **SIMULATED** demo identities. The sample CAs issue real role certificates. Workers use policy-scoped gateway sessions backed by a platform certificate. |
| Weather, traffic, social and platform observations | **SIMULATED** scenario inputs. The oracle service uses distinct signing identities and deterministic variation. |
| Premium collection and payout transfer | **SIMULATED** UPI. No money moves. The service persists its outcomes and delivers authenticated callbacks. |
| Policy, activity, quorum, payout and audit state | Real chaincode state and transactions on DRUNIX. |
| Two MSPs and attribute-based access control (ABAC) | Ledger writes require endorsements from Org1MSP and Org2MSP. Org1MSP holds insurer, bank and regulator identities. Org2MSP holds platform and oracle identities. Chaincode authorizes operations using the `role`, `platformId` and `oracleId` certificate attributes. |
| Private enrollment inputs | Real transient and private collection writes. Every walkthrough uses synthetic details. |
| Duplicate handling and caps | Real ledger idempotency, worker-hour locks and weekly cap accounting. |
| Surge results | Measured on the documented WSL2 sample using simulated inputs. No production throughput estimate is made. |
| Local fixture mode | **SIMULATED** browser records. It displays no ledger proof and runs no payout decision. |
| Falcon deployment | **UNVERIFIED**. The demo uses the upstream Docker sample. |
| 4-Lite-Peer scaling | **UNVERIFIED**. The surge measurements use two Lite Peers. |
| Production insurance, live feeds and payment rails | Outside this demo. |
