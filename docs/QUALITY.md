# Release verification

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`,
`npm --prefix gateway test` and `npm --prefix mock-upi test`.
With the local sample running, install the browser with
`npx playwright install chromium` and run `npm run test:e2e`.
The browser tests use a new worker account and axe on the public pages
and selected protected states. Use a local account database for evaluation.

The optional live settlement browser test uses the application stack and
temporarily configures signed accelerated closure. Use a dedicated sample
and point to its external account database. It checks policy activation,
platform activity, a signed disruption, a settled payout and its committed
proof, and regulator reconciliation and access denial.

```bash
PARASHIELD_TEST_SETTLEMENT=1 \
PARASHIELD_ACCOUNT_DB=/path/to/state/ledger-data/gateway/accounts.sqlite \
npm run test:e2e
```

The default URLs are `http://127.0.0.1:5173` and `http://127.0.0.1:8080`.
Use `PARASHIELD_TEST_URL`, `PARASHIELD_ORIGIN` and
`PARASHIELD_TEST_GATEWAY` when using different local ports.
Set `PARASHIELD_CHROMIUM_PATH` only when pointing to an existing Chromium
installation.

## Browser performance budget

Use the production build on a local preview, with Lighthouse mobile defaults.
Budget at least 95 accessibility, at most 0.10 cumulative layout shift,
at most 120 kB compressed entry JavaScript, and at most 30 kB compressed
CSS. The public delivery photo is budgeted at 85 kB. Vite reports the
asset transfers during `npm run build`.

Screenshot captures use 1440 px desktop and 360 px mobile viewports in
light and dark themes. See [screenshots](screenshots/).

## Recorded verification

Lighthouse 12.8.2 used a loopback Vite production preview and mobile
throttling. Results vary with the machine and network.

| Page | Performance | Accessibility | Cumulative layout shift |
| --- | ---: | ---: | ---: |
| Home | 97 | 100 | 0.000 |
| Sign in | 99 | 100 | 0.000 |
| Worker registration | 99 | 100 | 0.000 |

Vite reported 108.76 kB compressed entry JavaScript, 19.32 kB compressed
CSS and a 79.23 kB delivery photo. The auth HTTP module reached 95.57%
line and 82.30% branch coverage. The MFA, password, sessions and TOTP
modules reached 100% line coverage. The account repository reached 98.94%.

A fresh Git checkout installed dependencies, rebuilt the application,
started the application on alternate local ports against the existing
DRUNIX sample, passed readiness and startup smoke checks, and provisioned
a staff account through the interactive script.
