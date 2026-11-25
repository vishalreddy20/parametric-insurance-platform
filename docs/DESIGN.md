# ParaShield interface design

## Foundations

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | #F3F4F6 | #111827 |
| Surface | #FFFFFF | #1F2937 |
| Ink | #111827 | #F9FAFB |
| Muted ink | #4B5563 | #D1D5DB |
| Border | #6B7280 | #9CA3AF |
| Accent and focus | #1D4ED8 | #93C5FD |
| On accent | #FFFFFF | #111827 |
| Success | #166534 | #86EFAC |
| Warning | #92400E | #FCD34D |
| Danger | #991B1B | #FCA5A5 |
| Info | #1E40AF | #BFDBFE |

Expose the palette as semantic CSS variables. Use Inter with a system fallback and
a 12/14/16/20/24/32 px type scale. Use tabular numerals for money and identifiers,
and monospace for hashes and transaction IDs. Format dates in IST as
`DD MMM YYYY, HH:mm IST`. Format integer paise as rupees with Indian grouping.

Use spacing tokens of 4, 8, 12, 16, 24, 32 and 48 px with a 12-column content grid
and 1200 px maximum width. Use 4 px radii, 1 px borders and a minimal overlay
shadow. At 360 px use a single-column content layout, drawer navigation and
stacked table rows. Allow long identifiers to wrap.

## Components

Reuse Radix and shadcn primitives for primary, secondary, ghost and destructive
buttons, labelled inputs, selects, dialogs, drawers, tabs, toasts and tooltips.
Pair status icons with text. Use page headers, breadcrumbs, stat blocks,
timelines, skeletons and tables with sticky headers, sorting, filtering,
pagination and row actions. The sidebar collapses. The top bar shows organisation,
role, theme and an account menu with security settings and sign out.

## Pages and navigation

| Audience | Landing destination | Navigation |
| --- | --- | --- |
| Public | Product overview | How it works, sign in, create account, reset |
| Worker | Policy | Onboarding, policy, claims and payouts, ledger proof |
| Platform | Workers | Own workers, activity attestations |
| Insurer | Policies | Policies by zone, events and quorum, payouts, reconciliation, storm simulation, surge results |
| Regulator | Reconciliation | Reconciliation, event and payout aggregates, ledger audit, auth audit |
| Admin | Users | User provisioning and roles, reset codes, sessions, auth audit |

Every signed-in role has an account security page. Sign-in includes MFA
enrolment or challenge when required and supports recovery codes.
Onboarding saves a server-side draft across Profile, Plan, Review and
Activation. The plan shows the engine's inputs and result. Activation shows
the policy identifier, status and transaction identifier after commit.

## Loading, empty and error states

Wait for server-confirmed identity before rendering protected routes. Resume the
requested route after session renewal if authorised. Provide 403, 404, 500 and
offline pages. Show a request ID for support when available. Preserve form inputs
on recoverable errors, focus the error summary on failed submission, and keep
a stable idempotency key when retrying a submission. Reserve space with skeletons
and announce async results through live regions. Distinguish a successful empty
result from an unavailable result and offer retry for recoverable reads.

Target WCAG AA contrast, visible keyboard focus, trapped dialog focus with
restoration, and reduced-motion support. Use gateway or ledger values for live
figures and published benchmark reports for surge results. Apply plain labels
where simulated payment or synthetic oracle inputs appear.


## Evaluation build

The public entry screens render while session verification runs. Protected
workspaces show a session check until the gateway confirms the role. Sign-in
returns to the requested protected route or opens the user's role workspace.

The platform directory reads registered worker accounts for that platform. An
activity dialog records an elapsed IST work interval and returns its committed
transaction and block. The admin directory exposes staff provisioning, staff
role changes, session revocation and expiring password reset codes. The
regulator and admin audit panels display request references and role without
account identifiers.

The Stitch exports remain the visual reference. The implementation omits
insurer solvency and credit statistics because the gateway cannot substantiate
them. The staff workspaces use the shared shell and live account or ledger
data. They use simpler lists and panels than the reference when an exported
control has no supported operation.
