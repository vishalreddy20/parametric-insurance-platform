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

## Use the Fabric Gateway SDK and local durable checkpoints

The API sends evaluated and submitted proposals to the DRUNIX Lite Peer
endpoints. Event consumption uses the Committing Peer endpoint, where the
sample stores committed blocks. The worker persists its event cursor only
after writing a durable job. It checkpoints fan-out after a full page, so
a restart can replay a partial page and rely on ledger idempotency. Each
gateway instance requires its own persistent state directory.

The demo identity utility issues role-attribute certificates under the
ephemeral cryptogen sample CAs. Its credentials and manifest live outside
the source tree. Workers authenticate to the gateway and use a platform
actor behind it. Using production identities would require managed CAs,
organizational onboarding and credential rotation.

## Give each simulator its own signed oracle identity

Three simulated sources reuse the prototype disruption scenarios and give
each oracle a deterministic noise seed. Each submits through a separate
role-certificate identity. All readings are signed and stored by DRUNIX.
Only an insurer session can start a simulation. An offline run omits the
third submitter, and a disagreement run submits the dissent first so the
immutable declaration can retain it. Use a fresh zone/hour for each mode
because the first reading for an oracle and event key is authoritative.

## Persist simulated UPI results before invoking the ledger callback

Mock UPI uses one service instance and one persistent directory. The
reference fixes the outcome and binds it to a request payload. Retrying
delivery after a process failure uses the same reference at the gateway
and chaincode. The premium proxy assigns one reference per policy term,
and failed simulated premiums leave that term unpaid. No payment rail is
contacted.

## Default the UI to ledger mode and leave prototype fixtures read-only for claims

The frontend retains the prototype's layout, styles, sign-in entry, worker
tabs and dashboard cards. A typed data provider is the only active frontend
data connection. Worker and organization views come from the gateway.
`VITE_DATA_MODE=demo` exposes the local fixture worker without any
client-side payout execution or organization views. Retaining browser claim
automation would allow a UI-only decision to appear as a ledger settlement.

The gateway stores the transaction/block pair from committed DRUNIX events.
The frontend displays a pending proof state when event indexing has not caught
up. It shows a benchmark only when a measured report is available.

## Require unanimous oracle closure for accelerated demos

Ordinary event windows still close after the reading horizon. The insurer can
enable a demo-only early close in versioned configuration. All registered
oracle identities must commit a closure for the same zone and hour before
payout processing starts. Once an oracle signs, it cannot add a reading that
could declare a new event in that bucket. A late reading may still be stored
for an already declared event without changing the winner. The benchmark
restores the previous configuration. For overlap selection, coverage is
evaluated at the latest breached observation in the declaration, and cap
accounting still uses the IST week of the hour's start.

## Use application cursors over bounded composite-key partitions

During a live 32-policy run, the DRUNIX SQL state DB returned a full 25-policy
page with an empty native bookmark. Using that bookmark as the only cursor
would silently omit eligible workers. The chaincode now partitions the
composite indexes by hash, orders each bounded partition, and returns an
application cursor. An additional read partition preserves indexes written
by older versions. It rejects an overfull partition explicitly. New activity
attestations also write worker-and-hour markers so payout eligibility can
use a point read instead of depending on the sample's default range size.
