# Decisions

## Preserve the prototype's working entry point during the audit

Phase 0 keeps the existing Vite layout and Supabase Auth. The active route tree and localStorage data layer can be verified in place. Moving the frontend or changing authentication during the audit would combine feature work with baseline verification.

## Keep existing Git history

The owner accepted the historical environment-file finding and is rotating the affected credentials. This phase keeps the file out of the index and leaves existing history intact, as directed.

## Use a local automation identity for the audit commit

Git has no configured author in this checkout. The audit commit uses a command-local Codex identity. This leaves repository settings and the owner’s authorship untouched.

## Use the upstream two-organization DRUNIX sample

The documented sample at revision `8090e0ce58802c8a0f13d23a6abe5a2d35456cc5`
provisions two peer organizations. The sample has no documented four-org
configuration. Phase 1 maps Org1 to insurer and Org2 to platform for the
enrollment verification. It uses YugabyteDB because that is the documented
default, and uses point reads so enrollment does not depend on rich queries.
Extending the upstream topology with independently provisioned bank, oracle
and regulator identities is deferred. The enrollment policy and private
collection both require endorsement by Org1 and Org2.

## Build and run from an external DRUNIX checkout

The sample generates MSP, channel, and lifecycle artifacts in its checkout.
A separate temporary checkout preserves the reference and keeps those artifacts
outside ParaShield. The deployment wrapper also stages chaincode in a temporary
directory because the upstream lifecycle script runs `go mod vendor` in place.
