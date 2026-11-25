# ParaShield

ParaShield is a parametric income-protection demo for Zomato and Swiggy delivery
partners in India. It uses a React frontend, a Node Fabric Gateway service, and
Go smart contracts on NPCI's DRUNIX sample network.

**SIMULATED** demo identities, oracle data, and UPI transfers. The DRUNIX
ledger commits coverage, signed oracle readings, eligibility decisions, weekly
caps and settlement transitions.

## Run the DRUNIX demo

Install Docker with Compose, Git, Make, Go 1.26.1+, Node 20.9+, npm, jq and
OpenSSL. Use a dedicated Docker environment for the upstream test network.
Its cleanup uses fixed Docker names and removes sample chaincode images.

Prepare a writable DRUNIX checkout outside this repository. The verified
upstream revision is `8090e0ce58802c8a0f13d23a6abe5a2d35456cc5`.

```bash
runtime_parent=$(mktemp -d /tmp/parashield-drunix.XXXXXX)
git clone --no-hardlinks "$HOME/drunix" "$runtime_parent/drunix"
export DRUNIX_RUNTIME="$runtime_parent/drunix"
git -C "$DRUNIX_RUNTIME" checkout --detach 8090e0ce58802c8a0f13d23a6abe5a2d35456cc5
(cd "$DRUNIX_RUNTIME" && make peer orderer configtxgen configtxlator osnadmin cryptogen discover ledgerutil)
scripts/network-up.sh
scripts/deploy-chaincode.sh
scripts/smoke-test.sh
```

Install the application packages and start the demo from the repository root.

```bash
npm ci
npm --prefix gateway ci
npm --prefix oracles ci
npm --prefix mock-upi ci
npm --prefix gateway run build
npm --prefix oracles run build
node scripts/demo-stack.mjs
```

Open http://127.0.0.1:5173. The launcher displays the path to the locally
generated **SIMULATED** demo credentials manifest. See the [demo walkthrough](docs/DEMO.md).
Stop the application with Ctrl+C. `scripts/network-down.sh` tears down the
sample and deletes its ledger volumes. For the local fixture view, run
`VITE_DATA_MODE=demo npm run dev`.

Configuration examples sit in `.env.example` and the service directories.
Set configuration as process environment variables. The application ignores
dotenv files.

## Verify

```bash
npm test
npm run build
(cd chaincode && go vet ./... && go test ./... -cover)
npm --prefix gateway test
npm --prefix mock-upi test
scripts/gateway-integration.sh
scripts/services-integration.sh
```

The verified sample uses two organizations, YugabyteDB, KeyDB services, a
Raft orderer, and separate Lite Peers and Committing Peers. Insurer, platform,
bank, regulator, and three oracle identities use role attributes under the
two sample MSPs. A four-organization deployment and Falcon orchestration
remain outside the sample verification.

See [progress](PROGRESS.md), [decisions](DECISIONS.md), and
[attributions](ATTRIBUTIONS.md).
