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

Sign-in throttles by IP and account in memory, so limits reset on a gateway
restart. SMTP reset, administrator reset codes, password change, worker MFA
management, account security screens, and the auth audit log remain pending.
The role and ownership review is still in progress, including indexed ledger
proof and regulator data. The gateway currently targets one node. Host the
frontend and API on the same site when deploying with Strict cookies, use TLS
outside loopback, protect the database and runtime key, and back them up together.
