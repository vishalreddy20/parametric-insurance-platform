# ParaShield Google Stitch master prompt

Copy the prompt below into one Stitch project. It contains the entire product
brief and a generation order. The first response should contain one screen.

---

## Project and first output

Design **ParaShield**, an authenticated web application for parametric income
protection for delivery partners in India. Design the public pages, worker
journey and staff workspaces as one product with one visual system.

**Generate only the Sign in screen at 1440 px in light mode first.** Show the
default state. Use the rest of this brief to inform the design, then pause for
review. After approval, generate the remaining screens in the same Stitch
project, one group at a time. Preserve the approved typography, spacing,
components and visual hierarchy. Provide desktop and 360 px mobile layouts,
light and dark themes, and the relevant interaction states for each group.

## Product facts and copy

Use this home-page summary or an equally precise line:

> ParaShield helps delivery partners receive payouts when signed observations
> confirm a disruption and their policy and work activity qualify. Payout
> decisions can be traced on a shared ledger.

Coverage starts when the policy terms take effect after premium confirmation.
A disruption is declared from signed observations that meet a threshold and
quorum. A declared event alone does not make every worker eligible. The ledger
records the payout decision and settlement state. The payment rail is simulated
and oracle inputs are synthetic. Place **Payment rail: simulated** and
**Oracle inputs: synthetic** beside the relevant controls or records.

Use plain verbs and neutral status copy. Exclude guarantees, invented
statistics, logos, endorsements, KYC claims, assertions of platform
verification, and claims of real banking. Design empty or loading states and
clearly named data slots wherever figures depend on the API. Use published
measurements for benchmark screens. Keep sensitive personal and financial
details out of design exports.

## Visual system

Create a restrained, polished fintech workspace. Give public pages editorial
clarity through strong typography, generous whitespace and an asymmetric
desktop grid. Set the desktop sign-in form in a dedicated column. Pair it with
a quiet branded information panel, a fine divider and at most two useful
sentences. Keep the form first on mobile. Make authenticated pages denser
with consistent page headers, purposeful tables and clear primary actions.

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | #F3F4F6 | #111827 |
| Surface | #FFFFFF | #1F2937 |
| Text | #111827 | #F9FAFB |
| Muted text | #4B5563 | #D1D5DB |
| Border | #6B7280 | #9CA3AF |
| Divider | #D1D5DB | #374151 |
| Accent | #1D4ED8 | #93C5FD |
| On accent | #FFFFFF | #111827 |
| Success | #166534 | #86EFAC |
| Warning | #92400E | #FCD34D |
| Danger | #991B1B | #FCA5A5 |
| Info | #1E40AF | #BFDBFE |

Apply **Border** to form controls. Apply **Divider** to card edges, rules and
table rows. Use one blue action accent and reserve semantic colors for status.
Combine status text with an icon. Use Inter with a system fallback and a
12/14/16/20/24/32 px type scale. Use an explicit IST date format, ₹ with Indian
digit grouping, tabular figures, and wrapping monospace for transaction IDs and
hashes. Keep integer paise in the application data.

Use a 12-column grid, 1200 px maximum content width, 4/8 px spacing, 4 px
corner radius and 1 px rules. Keep shadows minimal. Exclude gradients, glass
effects, neon, decorative blobs, emoji icons, hero artwork and oversized pills.

Use accessible form labels, keyboard focus rings, WCAG AA contrast, a logical
reading order, focus-managed dialogs and clear status announcements. At 360 px
use a drawer for workspace navigation and stacked table records. Long
identifiers must wrap without horizontal page scrolling. Keep loading
placeholders the same size as the content they replace.

## Public and authentication screens

1. **Home** `/`. Show the one-sentence product explanation, **Sign in** and
   **Create account**, a three-step **How it works** section covering policy,
   event and payout proof, and the simulation disclosures.
2. **Sign in** `/sign-in`. Use **Username**, **Password**, a show/hide control,
   **Sign in**, **Create account**, and **Forgot password?**. Include the
   note **Staff accounts are issued by an administrator.** Show pending, wrong
   credentials, temporary lockout, rate limit, gateway unreachable and
   session-expired states. Keep sign-in errors generic and focusable. Show
   **Too many attempts. Try again in 5 minutes.** as the reference lockout
   and rate-limit copy for any username. The implementation substitutes the
   gateway-provided retry time when available.
3. **Staff authenticator setup and challenge**. Show setup key and code entry
   on first enrolment. For returning staff show **Enter authenticator code**
   and **Use a recovery code**. Design the recovery-code entry, invalid code,
   pending and success states. Show the one-time recovery code list and a
   clear **Continue** action after successful setup.
4. **Forgot password**. Present **Password resets are handled by an
   administrator.** and a **Back to sign in** action. Do not show an email
   form, fake confirmation or working self-service reset while the gateway
   lacks that capability.
5. **Create worker account** `/sign-up`. Include **Username**, **Platform**
   (Zomato or Swiggy), **Password** with the 12-character minimum and strength
   feedback, and a required checkbox with the text **I agree to the Terms
   and Privacy Notice.** Design linked Terms and Privacy Notice document
   views with editable content slots for approved copy. Show validation
   and an error summary, pending, retry and account-created confirmation.
   Collect phone, income, hours and payment details later in onboarding.
   Repeated submission of the same signup should retain its idempotency key.
6. **My account** `/account`. Show the authenticated username, role, and the
   correct workspace link. Include **Account security**, theme and **Sign out**
   in the account navigation.
7. **Account security**. Show password change, authenticator management,
   recovery-code management, active sessions with individual revoke, and
   **Sign out everywhere**. Design confirmation dialogs, reauthentication,
   revoked-session and no-other-sessions states. Management screens are
   target designs and should only be enabled once the gateway supports them.

## Authenticated shell

Use a collapsible sidebar, top bar with role and organization when available,
theme control, account menu, breadcrumbs and consistent page headers.
Use a drawer for mobile navigation. Page headers include an actionable title,
brief description and primary action when appropriate. Show only the navigation
appropriate to the authenticated role. Include desktop expanded and collapsed,
mobile drawer, loading and signed-out transition states.

## Worker journey

1. **Onboarding, Profile**. Show name, phone, platform, city and zone, weekly
   income and hours, and UPI ID. Provide field-level feedback, personal-data
   context and the simulated payment disclosure. Include saved draft and
   failed save states.
2. **Onboarding, Plan**. Show the available plans and a premium breakdown
   with base rate, each multiplier and the calculated premium. Bind these to
   the existing engine and use named slots when data is missing.
3. **Onboarding, Review**. Show the complete profile and selected policy
   with **Edit** links to each step. Make the premium, eligibility and
   payment disclosure readable. Preserve **Back**, **Next**, and the
   accessible four-step indicator throughout the wizard.
4. **Onboarding, Activation**. Show submission and ledger confirmation
   states, a recoverable error, and confirmed policy ID, status and ledger
   transaction ID. Use the gateway response for identifiers and status.
5. **Worker workspace** `/worker`. Show a policy summary with status,
   coverage window, cap used and cap remaining. Include no-policy,
   pending-premium, active and expired variants. Provide a deliberate next
   action where the worker can take one.
6. **Claims and payouts**. Show a filterable table and timeline with
   **RESERVED**, **SETTLED** and **FAILED**, using an icon and text. Include
   loading, empty and error states. On mobile show each row as a readable
   record with a clearly labelled proof action.
7. **Ledger proof drawer**. Show transaction ID, block number, event and
   quorum, per-oracle readings, payout reference and **Payment rail:
   simulated**. Show a pending indexing state and a safe copy control
   for public identifiers. Use real proof fields from the gateway.

## Staff workspaces

1. **Insurer** `/insurer`. Design navigation and views for policies by zone,
   event quorum, oracle readings, payouts and reconciliation. Reconciliation
   shows ledger versus simulated payment-rail totals. Provide a labelled
   **Storm simulation** panel with **One oracle disagrees** and **Oracle
   offline** variants, pending, success and error. Put **Oracle inputs:
   synthetic** next to the panel.
2. **Surge results**. Show the benchmark date, environment, sample size,
   success/failure and measured throughput or latency. Provide run
   comparison and empty states. Populate figures exclusively from the
   repository's published benchmark reports. Never invent missing values.
3. **Platform** `/platform`. Show only workers associated with the assigned
   platform and the platform's activity attestations. Include a scoped
   worker table, an attestation form, its confirmation and error states,
   and an empty result.
4. **Regulator** `/regulator`. Design read-only reconciliation, event and
   payout aggregates, ledger audit and auth audit. Use date, zone and status
   filters, with loading and empty states. Exclude identity fields, phone,
   UPI, and individual worker policies, claims and payouts.
5. **Admin** `/admin`. Design user provisioning, role management,
   administrator-issued one-time password reset codes, session revocation
   and auth audit. Show pending, confirmation, validation and failure
   states. Keep user identity data proportionate to the operation and
   keep passwords and reset codes out of tables and audit entries.

## Shared errors and design states

- **403**. Show **Access denied**, the required role when appropriate, and
  **Back to my account**. Do not display the protected page behind the error.
- **404**. Explain that the page could not be found and offer **Go back**
  or **Go to my account** for a signed-in user.
- **500**. Explain that the request could not be completed, show a support
  request ID when the gateway supplies one, and offer **Try again**.
- **Offline**. State that the gateway is unreachable, preserve available
  inputs and offer **Retry**. Distinguish this from an empty success.
- Include labelled inputs, primary and secondary buttons, disabled and
  pending states, status badges, toasts, tabs, pagination, sort and filter
  controls, a sticky desktop table header, dialogs, drawers and skeletons.

## Generation order and output

First deliver **Sign in, desktop, light, default state only**. After review
generate, in order, public and account views, staff authentication and security,
worker onboarding, worker workspace and proof, insurer and surge results,
platform/regulator/admin workspaces, and shared error views. Use the same Stitch
project and approved visual system throughout. For each approved group,
provide editable frames, component variants, CSS variables, spacing and
responsive rules, and HTML/CSS or Figma exports. Keep source and assets
organized by page for saving under `docs/design/stitch/`.

Additions: (a) Sign-in also needs an "Enter authenticator code" step with a "Use a recovery code" link, and a note "Staff accounts are issued by an administrator", plus a "Forgot password?" link that shows "Password resets are handled by an administrator." (b) Lockout and rate-limit messages are generic and identical for any username: "Too many attempts. Try again in 5 minutes." (c) Sign-up includes a required checkbox: "I agree to the Terms and Privacy Notice." (d) Add 404, 500 and offline pages in the same system. (e) Add a Divider token (#D1D5DB light, #374151 dark) for card edges, rules and table rows; keep Border for form controls only.

---

## Codex handoff after approval

Paste this into Codex once the approved exports are in the repository:

> Design handoff: approved Stitch exports are in docs/design/stitch/. Treat them as the visual reference. Re-implement them as React components using the existing shadcn/Radix primitives and the tokens as CSS variables (light and dark). Do not paste exported HTML into the app. Keep the live gateway auth, CSRF, server-confirmed roles and route guards exactly as built. Use the label "Password" (not "access code") everywhere in the UI. Match spacing, type scale and states from the screens, and report any place where you had to deviate and why.
