# ParaShield

ParaShield is a parametric income-protection demo for Zomato and Swiggy
delivery partners in India. It uses React, a Node Fabric Gateway service,
and Go smart contracts on NPCI's DRUNIX sample network.

ParaShield builds on the [earlier ZyroSafe prototype](ZYROSAFE_DEPLOYMENT.md).

**SIMULATED** demo identities, oracle data, and UPI transfers. DRUNIX commits
coverage, signed oracle readings, eligibility decisions, weekly caps and
settlement transitions.

```mermaid
flowchart LR
  Workers[Workers and organization users] --> UI[React UI]
  UI --> Gateway[Node REST and Fabric Gateway SDK]
  Sources[Three simulated oracle identities] --> Gateway
  Gateway --> Ledger[DRUNIX on channel parashield]
  Ledger --> Gateway
  Gateway <--> UPI[Simulated UPI]
```

## Prerequisites

Use a dedicated Docker environment. The upstream sample uses fixed container
names and its teardown removes sample chaincode containers, images and ledger
volumes.

| Tool | Verified version |
| --- | --- |
| OS | Ubuntu 26.04.1 on WSL2 x86-64 |
| Docker Engine and Compose | 29.9.3 and v5.7.0 with both `docker compose` and `docker-compose` available |
| Node and npm | 20.20.2 and 10.8.2 |
| Go | 1.26.8. The pinned DRUNIX source requires Go 1.26.1 or later. |
| Git, GNU Make, jq and OpenSSL | 2.53.0, 4.4.1, 1.8.1 and 3.5.5 |

The launcher uses DRUNIX revision `8090e0ce58802c8a0f13d23a6abe5a2d35456cc5`.
It uses `~/drunix` as the source if that revision is available there. Otherwise
it clones the upstream repository. The writable runtime and credentials live
outside ParaShield.

## Quickstart

From a fresh ParaShield checkout, run this command in the repository root.

```bash
scripts/dev-up.sh
```

`scripts/demo-up.sh` forwards to the same launcher for compatibility. See the [runbook](docs/RUNBOOK.md) for startup and network reset recovery.


The command builds the DRUNIX binaries, installs pinned application
dependencies, starts the sample, deploys chaincode, runs a ledger smoke test,
and starts the API, simulator, mock UPI and frontend. Open
http://127.0.0.1:5173. Health and ledger readiness are available at
`http://127.0.0.1:8080/health` and `http://127.0.0.1:8080/ready`.

The launcher prints the writable runtime path and the generated local demo
credentials manifest path. See the [five-minute demo](docs/DEMO.md) to use the
worker, insurer and regulator identities. Ctrl+C stops the application
services. Export the printed `DRUNIX_RUNTIME` and run
`scripts/network-down.sh` to delete sample ledger volumes.

For the local fixture view, run `npm ci` then
`VITE_DATA_MODE=demo npm run dev`. It uses simulated local records.

## Configuration

Set values as process environment variables. Vite and the application
services ignore dotenv files. The tracked examples contain placeholders
and document the stand-alone service interfaces.

| Variable | Purpose and default |
| --- | --- |
| `DRUNIX_RUNTIME` | Writable checkout outside ParaShield. The quickstart makes one in `/tmp` when omitted. |
| `PARASHIELD_DEMO_STATE` | External directory for demo identities, local keys and durable job/UPI state. The launcher makes one in `/tmp` when omitted. Reuse it with the same ledger. |
| `PARASHIELD_WEB_PORT`, `PARASHIELD_GATEWAY_PORT` | Loopback ports 5173 and 8080. |
| `PARASHIELD_ORACLE_PORT`, `PARASHIELD_UPI_PORT` | Loopback ports 8081 and 8082. |
| `PARASHIELD_UPI_LATENCY_MS`, `PARASHIELD_UPI_FAILURE_BPS` | Simulated delay and failure probability in basis points. Defaults are 100 ms and zero. |
| `PARASHIELD_BENCHMARK_REPORT` | JSON read by the benchmark API. The quickstart uses the measured report in `docs/`. |
| `VITE_DATA_MODE`, `VITE_GATEWAY_URL` | Browser mode and API base URL. Defaults are `ledger` and `http://127.0.0.1:8080`. |

## Verify

Run from the repository root after quickstart has installed packages. Export
the running `DRUNIX_RUNTIME` for the network and integration commands.

```bash
npm test
npm run build
(cd chaincode && go vet ./... && go test ./... -cover)
npm --prefix gateway test
npm --prefix mock-upi test
scripts/smoke-test.sh
scripts/gateway-integration.sh
scripts/services-integration.sh
```

To benchmark the same running sample, export `DRUNIX_RUNTIME` and
`PARASHIELD_DEMO_STATE` from the launcher and run `scripts/surge-test 32`.
Without an argument the script requests 1,000 policies. Use a dedicated
sample with simulated payment failures disabled. The runner temporarily
enables the signed demo-window close, creates synthetic policy records,
and writes measured reports. See [benchmark results](docs/BENCHMARKS.md).

## Troubleshooting

- If Docker is unreachable, start the Docker daemon and verify
  `docker info`. If `docker-compose` is missing, install the Compose CLI
  compatibility command expected by the upstream Yugabyte sample.
- If fixed container names are already in use, stop your previous sample
  with its own runtime and `scripts/network-down.sh`, or supply that
  running runtime to the quickstart.
- For a failed chaincode package install, check Docker access to
  `npcioss/drunix-ccenv:1.0` and `npcioss/drunix-baseos:1.0`. The deploy
  wrapper pulls those images if absent.
- Use a new demo state directory after recreating the sample's MSPs and
  ledger. Old certificates and event cursors belong to the previous network.
- For an empty claim timeline, confirm premium, waiting period, the
  platform activity window, quorum and window closure. The browser
  exposes gateway errors and supports retry with the same operation ID.

## Implementation notes

The verified sample uses two organizations, two Lite Peers, two Committing
Peers, YugabyteDB, KeyDB, stateless validation services and a Raft orderer.
Independent bank and oracle MSPs and Falcon were not exercised.

- [Architecture](docs/ARCHITECTURE.md)
- [Real and simulated behavior](docs/REAL_VS_SIMULATED.md)
- [Threat model](docs/THREAT_MODEL.md) and [edge-case verification](docs/EDGE_CASES.md)
- [Progress](PROGRESS.md), [decisions](DECISIONS.md), and [attributions](ATTRIBUTIONS.md)
