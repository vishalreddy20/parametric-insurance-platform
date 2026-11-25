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

## Close hourly reading windows before reserving compensation

Every event uses a half-open UTC hour bucket. Reservation opens at the end of
that hour plus the maximum allowed reading freshness (one hour). This lets
competing triggers reach quorum before a worker’s payout is reserved. Payouts
compare the capped compensation for each declared trigger and break ties by
event key. The worker-hour key and weekly policy counter are both read and
written in the same transaction so Fabric MVCC can reject concurrent writes.
Declaring a winner on arrival would let a smaller event preempt a later one.
An IST week-spanning event is attributed to the week containing its start.

## Version policy terms and use one renewable policy per worker

Enrollment and renewal snapshot the applicable configuration. Premium
confirmation starts a seven-day coverage term and its waiting period. A worker
has one renewable policy under an opaque platform-verified worker ID, across
platforms. A new term starts only after the previous one expires. Policies
cancelled, paused, or renewed before processing leave prior unprocessed events
ineligible. This keeps the MVP from creating overlapping policies or basing a
payout on an overwritten term. Supporting historical eligibility after renewal
would require term-specific lifecycle and fan-out indexes.

## Separate network endorsement from caller authorization

The Phase 1 lifecycle definition requires both sample MSP endorsements for every
write. Phase 2 authorizes contract operations through certificate attributes
(`role`, `platformId`, and `oracleId`). Only the fixed simulated enrollment
fixture retains the two-MSP administrative smoke path. No separate bank or oracle
MSP endorsement policy has been verified on the two-org sample.
