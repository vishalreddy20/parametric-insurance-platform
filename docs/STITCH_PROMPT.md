# ParaShield design brief for Google Stitch

Copy the prompt below into Stitch. Keep subsequent screens in the same project
so they reuse the approved visual system.

---

Design **ParaShield**, a web app for parametric income protection for delivery
partners in India. A worker chooses coverage and activates a policy after
premium confirmation. Signed oracle observations can declare a disruption.
When the policy and activity qualify, the worker can inspect the payout and
its transaction and block proof. Insurers, platforms, regulators and
administrators have separate workspaces.

## Generate first

Create a coherent first set of five screens at **1440 px desktop and 360 px
mobile**, with light and dark examples.

1. **Home `/`**. Explain the product in one sentence. Offer **Sign in** and
   **Create account**. Use a compact three-step explanation of coverage,
   signed observations and ledger proof. End with the actual disclosures
   **Payment rail: simulated** and **Oracle inputs: synthetic**.
2. **Sign in `/sign-in`**. Label the fields **Username** and **Password**,
   provide a show or hide password control, and show the create-account link.
   Produce variants for invalid credentials, temporary lockout with remaining
   time, rate limit, gateway unreachable, session expired and submission
   pending. Keep errors inline and preserve the form layout when they appear.
3. **Create worker account `/sign-up`**. Include **Username**, **Platform**
   (Zomato or Swiggy), and **Password** with the current requirement of at
   least 12 characters and inline feedback. Show validation, submission
   pending and account-created confirmation. Collect the worker profile in
   onboarding after registration.
4. **My account `/account`**. Show the authenticated username, role and
   workspace link. Use the same header across public and authenticated
   views, with theme and account actions appropriate to each state.
5. **Access denied**. Show a clear **403** heading, identify the role needed
   for the workspace, and offer **Back to my account**. The protected
   workspace should never appear behind this view.

Make the public pages feel editorial and purposeful. Use a generous desktop
layout with an asymmetric grid, a clear typographic hierarchy and a dedicated
form column. Pair the desktop sign-in form with a small branded information
panel, bounded by a rule and containing at most two useful sentences. At mobile
width put the form first and keep the workspace controls within reach.
Give the authenticated view a tighter rhythm and make each primary action
immediately obvious.

## Design system

Use Inter or system sans-serif, with type sizes 12, 14, 16, 20, 24 and 32 px.
Use a 12-column desktop grid, 1200 px content maximum, a 4/8 px spacing scale,
4 px corner radius, 1 px borders and restrained shadows. Use navy and neutral
surfaces with one blue action accent. Reserve semantic colors for states and
pair color with an icon and text. Apply visible keyboard focus and WCAG AA
contrast. Allow tables to become stacked records at 360 px. Format dates
explicitly in IST, money in ₹ with Indian digit grouping, and hashes and
transaction IDs in a wrapping monospace style.

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | #F3F4F6 | #111827 |
| Surface | #FFFFFF | #1F2937 |
| Text | #111827 | #F9FAFB |
| Muted text | #4B5563 | #D1D5DB |
| Border | #6B7280 | #9CA3AF |
| Accent | #1D4ED8 | #93C5FD |
| On accent | #FFFFFF | #111827 |
| Success | #166534 | #86EFAC |
| Warning | #92400E | #FCD34D |
| Danger | #991B1B | #FCA5A5 |
| Info | #1E40AF | #BFDBFE |

Favor structure, readable type and information hierarchy over decoration.
Exclude gradients, glass effects, oversized pill controls, emoji, stock hero
art, fake metrics, invented logos or partner endorsements. For any figure
that needs backend data, use a skeleton, an empty state, or a named data slot.
Avoid claims about identity verification, real banking, or guaranteed payouts.

## Follow-up screens after the first set is approved

- **Staff security**. Authenticator setup and challenge, one-time recovery
  codes, active sessions with revoke, password change and sign out everywhere.
- **Worker onboarding**. Profile, plan with premium inputs and breakdown,
  review, and ledger confirmation with policy ID and transaction ID. Include
  incomplete draft and failed activation states.
- **Worker workspace**. Coverage dates and cap, claims and payout timeline,
  and a proof drawer with transaction, block, oracle quorum and payment
  reference. Show **Payment rail: simulated** beside payment details.
- **Insurer workspace**. Policies by zone, event quorum, reconciliation,
  a **Storm simulation** panel with **One oracle disagrees** and **Oracle
  offline**, and a results page populated by the published benchmark data.
- **Platform, regulator and admin**. Platform workers and activity
  attestations, read-only regulator aggregates and audit without personal
  data, and admin user provisioning, roles, resets, sessions and audit.

## Handoff

Provide the editable screens, reusable component variants, responsive layout
rules, tokens as CSS variables, and source or assets for the approved screens.
Use semantic forms and accessible labels. Keep interaction states explicit in
the design. Represent loading, empty, error and success separately. Where a
screen requires data, identify the binding instead of embedding fixture values.

The application already runs on React and Vite. Its gateway owns authentication,
sessions, CSRF, authorization, and ledger state. Treat generated output as a
presentation layer. Keep form submission and protected routes connected to the
existing live app, with the normal **Password** field and server-confirmed roles.
