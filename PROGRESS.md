# Progress

## Phase 0 — Verified

- The branch is `parashield-drunix`. The active UI loads `src/app/pages/*` through `src/app/App.tsx`. Application records are stored through `src/app/services/mock-db.ts` in localStorage. The active UI uses Supabase Auth. Its Edge Function has no active UI caller.
- `git ls-files -- .env dist node_modules` produced no paths. The staged removals of previously tracked `.env` and `dist/` are included in this phase. `git check-ignore` confirmed the local environment file and generated artifacts are ignored.
- The owner accepted the secret scan result of `.env` present in history only, no other secrets reported. The owner is handling rotation.
- `npm ci && npm test && npm run build` passed on Node 20.20.2. Vitest passed all 4 tests in 2 files. npm reported 19 dependency vulnerabilities (1 low, 5 moderate, 9 high, 4 critical). Build output was generated in ignored `dist/`. The same commands also passed in a temporary archive of the Phase 0 commit with no local environment file.

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
- Added a persistent event cursor and batched, five-concurrent policy fan-out. Settlement jobs remain queued when mock UPI is disabled. Gateway proposal traffic uses the Lite Peers. Committed events stream from a Committing Peer. The initial Lite Peer stream did not deliver the declared event, while the Committing Peer stream passed.
- `npm --prefix gateway test` passed all 3 tests, including replay after a failed page. `DRUNIX_RUNTIME=... scripts/gateway-integration.sh` passed against chaincode 2.0 with authenticated enrollment, replay, premium, activity, pagination, role denial, two signed quorum readings and durable event intake.
- The committed payout path was exercised in Go stub tests. The live integration queued a declared event but did not wait for the event window to close or settle a live payout. Demo role certificates are issued by the sample CAs and occupy the sample's two MSPs.

## Phase 4 — Verified on DRUNIX

- Added the insurer-only oracle simulation service and persistent mock UPI service. The oracle adapters reuse the prototype's weather, social, traffic and platform scenario logic, and each submits with a distinct signed identity. All service responses mark simulation explicitly.
- `npm --prefix mock-upi test` passed both tests, covering concurrent duplicate requests, conflicting data, stored failed outcomes and callback recovery across restart. The gateway's 3 tests passed and the oracle build succeeded.
- `DRUNIX_RUNTIME=... scripts/services-integration.sh` passed against the running sample. Normal and disagreement storms each submitted 3 authenticated readings. The offline scenario declared with 2. The simulated premium callback moved the policy to ACTIVE on DRUNIX and returned the same result on replay. Payout settlement callbacks were tested against a fake receiver in this phase. Live payout settlement still awaits an eligible closed event.

## Phase 5 — Browser and build verification passed

- The active frontend now defaults to the ledger provider. It includes worker onboarding, simulated premium collection, policy and payout state, quorum and block proof, insurer and read-only regulator views, and a measured benchmark panel. Prototype-local claim automation is isolated under `src/app/legacy`.
- `npm test` passed all 13 frontend tests. `npm run build` and the gateway's 3 tests passed. The root test runner only collects frontend tests. Gateway and UPI tests remain in their packages.
- Chromium against DRUNIX verified login routing, enrollment, premium confirmation, empty claims, gateway offline/retry, insurer simulation, regulator reconciliation, and session expiry. Chromium also verified local fixture mode without gateway requests. The walkthrough is in `docs/DEMO.md`. This run did not include a settled payout proof.

## Phase 6 — Surge verification passed on two Lite Peers

- `scripts/surge-test 20` first settled 20/20 policies on contract version 3.0. A 32-policy attempt then exposed an empty native SQL bookmark after 25 records. That run was interrupted with 25 settlements. After deploying 3.1, the original event was replayed and recovered all 32 unique policies across four read pages, with no double payment.
- A fresh `scripts/surge-test 32` run on 3.1 passed. All 32 policies settled across two fan-out pages. There were zero failures, duplicates, and MVCC retries. Ledger and simulated UPI each reconciled to 1,920,000 paise. The gateway verified an actual reserved payout block number from the committed event stream.
- End-to-end time 80,026.34 ms, storm-to-terminal time 48,781.98 ms, 0.66 settled payouts/s, p50 41,302.74 ms and p95 48,778.42 ms under the recorded workload. Environment, methodology and JSON are in `docs/BENCHMARKS.md` and `docs/benchmark-latest.json`. The documented sample has two Lite Peers. Four peers and a 1,000-policy run were not exercised.
- `go vet` and the Go suite passed at 82.8% statement coverage. Frontend build and 13 tests, three gateway tests, two mock UPI tests, and the chaincode 3.1 smoke test also passed.

## Phase 7 — Fresh checkout and submitted demo workflow verified

- Added the one-command quickstart, measured benchmark dashboard setup, architecture and threat model, real/simulated inventory, edge-case matrix and recording checklist. Preserved LICENSE and ATTRIBUTIONS.md.
- Started from a fresh Git checkout of the release candidate and empty sample ledger. `scripts/demo-up.sh` rebuilt the pinned DRUNIX binaries, installed packages, created the channel, deployed chaincode 3.1 and passed the smoke test. An initial teardown check failed with `invalid spec: :/host/var/run/docker.sock: empty section between colons`. Passing the same Docker socket value as upstream fixed the check. Teardown was verified again.
- Fresh verification passed the frontend build and 13 tests, `go vet` and 82.8% chaincode coverage, 3 gateway tests, 2 mock UPI tests, the live gateway and simulator integration scripts, and the one-policy prepared demo. Chromium displayed an actual settled payout with its reservation transaction ID, committed block number and quorum, plus the measured 32-policy benchmark.
- The fresh source checkout stayed clean after the full run. Source control contains no current environment files, dependency trees, generated build artifacts or sample credentials. The owner-accepted historical finding is unchanged. The root npm audit still reported 19 vulnerabilities.
- The remaining operational gaps are independent bank/oracle/regulator MSPs and the corresponding transaction-specific endorsements, verified four-Lite-Peer scaling or 1,000-policy measurements, Falcon, failover and production integrations.

## UI and authentication overhaul

- The interface foundations, role navigation and page states are specified in `docs/DESIGN.md`.
- The gateway has a migrated SQLite account repository, access-code policy and Argon2id verifier, TOTP counter verification, and an interactive provisioning command. These components are groundwork. The running gateway still uses the previous authentication path.
- Before frontend changes, the live smoke test requires a working DRUNIX runtime. The retained sample ledger rejected credentials from a fresh runtime with `access denied: channel [parashield] creator org unknown, creator is malformed`.
- The approved local sample reset regenerated network crypto, rejoined the channel and deployed the unchanged chaincode. Smoke, gateway integration and service integration passed. The startup guard accepted the fresh manifest and rejected the pre-reset identity before HTTP startup. The benchmark files stayed unchanged.
- Auth cutover acceptance requires Argon2id, persistent sessions, TOTP and refresh rotation on the normal browser request path. Keep the current gateway healthy while testing the replacement, then remove the old human sign-in path once the replacement passes. Simulator and payment callbacks still need independently authenticated service identities.
- Browser account creation and sign-in now use the SQLite, Argon2id, TOTP and cookie-session request path. The developer launcher issues service credentials only. Both integration scripts use browser-auth clients with isolated accounts. The old human bearer sign-in route was removed. See `docs/SECURITY.md` for the remaining items.
- Regulator routes now exclude individual worker policies, claims and payouts. Worker and platform ledger-proof reads validate the referenced payout and policy ownership. Route tests and the live gateway integration passed.
- Slice 1 uses the new account shell for signup, sign-in, account overview, and the wrong-role 403. The live gateway persists account lockouts and atomically handles signup retries. The existing local reset was verified with the smoke test before changes.
- Slice 2 adds Account security with live authenticator status, active sessions, individual revocation and sign out everywhere. Session listings and mutations are scoped to the authenticated account.
- Slice 3 adds the worker onboarding profile, plan, review and activation routes, with encrypted server drafts, the existing premium calculation and a gateway-confirmed enrollment receipt.
- Slice 4 replaces the old worker workspace, adds a payout status timeline and a right-side ledger proof drawer. Coverage, cap, event and payout values are sourced from the gateway. Historical caps are shown as unavailable when the current ledger configuration does not match the policy version.
- Slice 5 replaces the insurer console with the shared shell, zone and status filters, signed storm simulation results, and a surge page using the published 32-, 200-, and 1,000-policy reports. Live reconciliation stays on the regulator route under the existing role checks.

- Slice 6 regulator workspace now shows read-only events and paginated ledger reconciliation through the shared shell. Chromium verified live events, MFA, role denial and desktop/360 px accessibility. The Slice 5 retry also declared a live event with two signed readings and one offline oracle.

- Slice 6 adds the platform-scoped worker directory and the admin staff provisioning and session revocation controls. Browser MFA, provisioning, role denial and axe passed. A live cookie-authenticated run activated a worker policy, accepted platform activity, closed a signed storm window, settled the simulated payout, verified its committed block, reconciled regulator totals and denied regulator access to the policy.

- Slice 7 removes the unreferenced prototype screens, Supabase dependency, local browser data path and old launcher names. Existing claim-processor regression tests retain their fixtures outside the product import path. Strict frontend type checking now passes. The live smoke test and both integration scripts passed. The evaluator walkthrough documents separate role sessions and a prepared, signed settlement run.
