# DRUNIX development runbook

## Start or restart

Run `scripts/dev-up.sh` with an external writable `DRUNIX_RUNTIME` at the
pinned revision. Retain that path for restarts. Keep the runtime and its
generated crypto together with the sample ledger volumes. The startup script
joins the channel, deploys the chaincode and runs the ledger smoke test before
starting the application processes.

The launcher issues identities from the current sample crypto when the runtime
manifest is absent. On every gateway start, including when a manifest already
exists, the gateway checks the certificate and private key match and submits a
signed channel query with each configured identity before opening its HTTP
listener. This verifies the identities and TLS connection against the live
network without writing to the ledger.

## Diagnose startup

| Gateway error | Action |
| --- | --- |
| `ERR_LEDGER_MSP_MISMATCH` | Compare the running sample and configured runtime. Reissue identities using the current sample crypto. |
| `ERR_LEDGER_IDENTITY_KEY` | Reissue the identity manifest and its matching key files together. |
| `ERR_LEDGER_IDENTITY_CHECK` | Verify peer reachability, channel membership and TLS trust. |

After an authorised ledger reset, use a fresh external
`PARASHIELD_DEMO_STATE` directory so credentials, event cursors and jobs
belong to the new ledger. Leave manifests and key files outside the repo and
keep their contents out of logs. If the original ledger still exists, recover
the corresponding original sample crypto before reusing that ledger.

After starting a fresh stack, run the checks with the same runtime path.
The integration scripts provision their own temporary role identities.

```bash
scripts/smoke-test.sh
scripts/gateway-integration.sh
scripts/services-integration.sh
```

## Run a surge measurement

Provision separate insurer, platform and regulator accounts. Complete their MFA
enrolment in the browser. Set `PARASHIELD_SURGE_ACCOUNTS` to a user-owned,
mode-0600 JSON file outside the repository. Its `insurer`, `platform` and
`regulator` entries each contain `username`, `password` and the current
authenticator `code` as strings. An optional prepared worker run also uses a
`worker` entry with `username` and `password`. Use freshly generated
authenticator codes for each invocation. Keep the file private and remove the
codes once the run starts.

Set `PARASHIELD_BENCHMARK_REPORT` and `PARASHIELD_BENCHMARK_TABLE` to new paths
to preserve recorded benchmark artefacts.
