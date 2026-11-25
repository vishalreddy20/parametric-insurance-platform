# ParaShield evaluator walkthrough

Start the application and provision staff using the [README](../README.md).
Keep the worker, insurer, and regulator accounts open in separate browser profiles.

1. Create a worker account and select Zomato. Sign in, open **Set up coverage**, review the premium and finish activation. Show the policy receipt and the payment simulation disclosure.
2. Sign in as an insurer, complete MFA and open **Insurer console**. Select a zone without an event in the current hour. Use **One oracle offline**, submit, and inspect the two signed readings and the declaration. The **Surge results** page shows three recorded workloads.
3. Sign in as a regulator, complete MFA and open **Ledger audit**. Select the same zone and IST week. Open an event to compare its oracle readings. Confirm that visiting `/insurer` shows **Access denied**.
4. Show the worker's settled payout using the prepared account described below. Open **Ledger proof** and compare the observed event and committed block. On the regulator profile, show the weekly aggregate and compare the settled amount. The regulator workspace displays no worker identity, phone number or UPI ID.

## Prepare a settled evaluation record

On a dedicated sample, register a second Zomato worker. Leave this worker's
onboarding untouched. Provision a matching platform account and sign in to
complete MFA enrolment for the platform, insurer and regulator. Follow the
[runbook](RUNBOOK.md) to prepare the private credentials file.

Use the external paths printed by the launcher for `DRUNIX_RUNTIME` and
`PARASHIELD_DEMO_STATE`. Use your registered worker's username in the command.

```bash
report_dir=$(mktemp -d)
PARASHIELD_PREPARE_WORKER=your-registered-worker \
PARASHIELD_SURGE_ACCOUNTS=/path/to/private-accounts.json \
PARASHIELD_BENCHMARK_REPORT="$report_dir/evaluation.json" \
PARASHIELD_BENCHMARK_TABLE="$report_dir/evaluation.md" \
scripts/surge-test 1
```

The runner activates a synthetic policy, records platform activity, signs a
storm and the reading-window closure, waits for settlement, reconciles the
simulated receipt, and restores the configuration. Wait for its PASS result
before showing the recorded settlement. Sign in as the prepared worker and
open the worker workspace. Oracle inputs and payment are simulated. The
policy, settlement and proof queries use the live sample ledger.
