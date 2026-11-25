# Progress

## Phase 0 — Verified

- Branch: `parashield-drunix`. The active UI loads `src/app/pages/*` through `src/app/App.tsx`. Application records are stored through `src/app/services/mock-db.ts` in localStorage. The active UI uses Supabase Auth; its Edge Function has no active UI caller.
- `git ls-files -- .env dist node_modules` produced no paths. The staged removals of previously tracked `.env` and `dist/` are included in this phase. `git check-ignore` confirmed the local environment file and generated artifacts are ignored.
- Secret scan, owner-accepted result: `.env` present in history only, no other secrets reported. The owner is handling rotation.
- Existing verification: `npm ci && npm test && npm run build` passed on Node 20.20.2. Vitest passed all 4 tests in 2 files. npm reported 19 dependency vulnerabilities (1 low, 5 moderate, 9 high, 4 critical). Build output was generated in ignored `dist/`. The same commands also passed in a temporary archive of the Phase 0 commit with no local environment file.

## Phase 1 — Verified on the two-organization DRUNIX sample

- Inspected the upstream root and sample READMEs, architecture document location, channel scripts, Compose topology, and lifecycle commands at revision `8090e0ce58802c8a0f13d23a6abe5a2d35456cc5`. The standalone wiki Git endpoint returned `fatal: could not read Username for 'https://github.com': No such device or address`. The in-repository sample documentation was sufficient for startup.
- Built the documented binaries with `make peer orderer configtxgen configtxlator osnadmin cryptogen discover ledgerutil`. Ran `./network.sh up createChannel -c parashield -s yugabyte` from a separate writable checkout. The orderer joined `parashield` and all four sample peers joined the channel.
- The first chaincode install failed with `No such image: npcioss/drunix-ccenv:1.0`. The deployment wrapper now ensures the upstream Go builder and runtime images are locally available. The retry installed chaincode on both Lite Peers and committed definition 1.0, sequence 1, with both organizations' approval.
- `scripts/smoke-test.sh` enrolled a simulated policy with a transient private write into `workerPII` and verified that the public readback contained only the policy ID and the expected salted worker hash. `go vet ./...`, `go test ./...` (compilation, no Go test files in Phase 1), `bash -n` on every wrapper, and `git diff --check` passed.
- Verified the startup and deploy wrappers against the already running sample, repeated the smoke test, ran sample teardown twice, then brought the network back up through the repository wrapper, redeployed, and enrolled and read back a policy again. The network is running with the smoke fixture committed.
- Topology uses the two-organization sample with YugabyteDB, KeyDB services, single-node Raft, two Lite Peers, two Committing Peers, and two validation-service containers. The chaincode uses point reads and the sample's default SQL state database. Org1 and Org2 serve as insurer and platform respectively. The enrollment write requires both endorsements. A separate bank, oracle and regulator, and policies specific to their transactions, are outside this sample verification. Falcon and peer scaling were not exercised. The browser still uses the prototype data path.

## Phase 2 — Chaincode verified with a mocked Fabric stub

- Added versioned configuration, policy and premium lifecycle, platform activity, distinct signed-client oracle quorum, immutable declaration, deterministic payout selection and settlement, and regulator reads. Public records use opaque worker references. Direct worker identity, phone and bank details are accepted through transient data and stored in `workerPII`.
- Added paginated composite-key queries for event, policy, payout and reconciliation reads. Settlement failures release the reserved cap. Event and payout declarations include the originating transaction ID. The sample chaincode definition still uses both sample MSPs.
- `cd chaincode && go vet ./... && go test ./... -cover` passed with 83.4% statement coverage. `npm test` passed all 13 tests from a temporary snapshot without a local environment file, including nine shared Go and TypeScript compensation vectors.
- Mock tests cover contract behavior, serialization metadata registration and idempotency. Concurrent MVCC outcomes, private data propagation, role certificates and live state-database pagination await end-to-end verification against the gateway and running DRUNIX topology.

## Phase 3 — Verified on DRUNIX

- Added the Node 20 REST gateway using the Fabric Gateway SDK, certificate-attributed role identities, scoped demo JWTs, Zod validation, redacted structured logs, and bounded MVCC/endorsement retries. Submitted transactions wait for commit status and return transaction and block identifiers.
- Added a persistent event cursor and batched, five-concurrent policy fan-out. Settlement jobs remain queued when mock UPI is disabled. Gateway proposal traffic uses the Lite Peers; committed events stream from a Committing Peer. The initial Lite Peer stream did not deliver the declared event, while the Committing Peer stream passed.
- `npm --prefix gateway test` passed all 3 tests, including replay after a failed page. `DRUNIX_RUNTIME=... scripts/gateway-integration.sh` passed against chaincode 2.0 with authenticated enrollment, replay, premium, activity, pagination, role denial, two signed quorum readings and durable event intake.
- The committed payout path was exercised in Go stub tests. The live integration queued a declared event but did not wait for the event window to close or settle a live payout. Demo role certificates are issued by the sample CAs and occupy the sample's two MSPs.
