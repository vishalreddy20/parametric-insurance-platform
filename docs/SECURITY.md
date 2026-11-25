# Gateway authentication

Browser sign-in uses SQLite accounts and Argon2id with independent salts, 64 MiB
memory, three iterations and one lane. An optional 256-bit environment pepper
is applied before hashing. The password strength check uses zxcvbn. Workers can
self-register. Operators interactively provision staff with
`scripts/provision-user.sh`. Staff enrol an authenticator before receiving a
session. A password check also runs for an unknown username using a dummy hash.

The gateway encrypts TOTP secrets with an application key derived from the
runtime key, rejects consumed counters atomically and stores keyed hashes of
single-use recovery codes. Sessions store hashed, random access and refresh
tokens. Access lasts five minutes, idle expiry is 15 minutes and absolute expiry
is eight hours. Rotation invalidates the previous access token and detects
refresh reuse within the session family. The browser uses HttpOnly,
SameSite=Strict cookies, Secure beyond local HTTP, and a CSRF token bound to the
session for authenticated mutations. The configured frontend origin is allowed
for credentialed CORS.

The gateway maps signed-in accounts to the existing Fabric role identities.
Workers never receive ledger credentials. Simulated UPI and oracle clients
retain separate bearer credentials issued by `/v1/service-token`. The old
human sign-in endpoint has been removed. The live integration scripts exercise
staff MFA and cookie sessions against temporary account databases.

## Current limitations

Sign-in rate limits by IP in memory. Account lockouts are stored in SQLite and
survive gateway restarts. Known and unknown usernames share the same limits
and credential errors. Registration stores its idempotency key atomically with
the account. A retry with the same details confirms the existing registration. Workers and staff can change a password with the current password under Account
security. Administrators can issue a single-use reset code for another account.
Codes expire after 15 minutes and the database stores only a keyed digest.
Changing or resetting a password revokes all sessions. Staff MFA remains
enrolled after a reset. SMTP reset, worker MFA management and the auth audit
log remain pending.
Workers and platforms must prove ownership of the payout before reading its
indexed ledger proof. Regulators have event, audit and reconciliation access.
Individual policies, claims, and payouts are excluded from their API access.
The ownership review for the remaining routes is in progress. The gateway currently targets one node. Host the
frontend and API on the same site when deploying with Strict cookies, use TLS
outside loopback, protect the database and runtime key, and back them up together.

The account security page lists active sessions and their expiry times, and
allows individual revocation and sign out everywhere. It displays authenticator
enrolment status without exposing setup keys or recovery codes.

Worker onboarding drafts are encrypted in SQLite and scoped to the
authenticated account. Successful enrollment clears the draft and stores the
gateway-confirmed transaction and block. Profile fields go to the existing
ledger private collection. Keep the runtime key with the database backup.
