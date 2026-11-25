# ParaShield demo walkthrough

Use the running DRUNIX stack from the [README](../README.md). Open
http://127.0.0.1:5173. The launcher prints the path to the external demo
credentials manifest. Select the matching access code locally and keep it
out of screenshots, material shared with judges, and terminal logs.

## Five-minute walkthrough

1. Start on the landing page. Sign in as `demo-worker` with the simulated
   worker identity. On first use, choose a coverage zone and plan, then submit
   enrollment. The UI waits for ledger commit.
2. Pay the premium with **SIMULATED UPI**. Confirm the policy becomes
   `ACTIVE` and inspect its coverage dates and waiting period in **My policy**.
3. Sign out, then sign in as `insurer`. Choose a fresh zone and select
   **One offline** under **Simulate a storm**. Verify `DECLARED` and two
   threshold breaches. Demonstrate **One disagrees** in a different unused zone.
4. Sign in as `regulator`. Verify that the policy, event and weekly
   reconciliation are visible. The regulator view has no simulation or
   settlement controls.
5. For a prepared eligible, settled event, sign back in as the worker and open
   **Claims** and **Ledger proof**. Show the payout state, reservation
   transaction ID, committed block number, event key, and quorum readings.
   A fresh policy and event demonstrate the enrollment and quorum stages.
   Payout requires qualifying activity, an eligible covered event and a closed
   reading window. The default waiting period is 24 hours.

Use **Refresh** to force a read. With the gateway disconnected, verify that
the UI surfaces an error and **Retry** recovers when the gateway returns.
When the gateway rejects an expired session, the UI returns to sign-in.
The local fixture mode is labeled **SIMULATED · LOCAL DATA** and has no
ledger proof or administrative controls.

## Backup recording checklist

- Record the running service readiness and the DRUNIX smoke test without credentials.
- Capture the worker's simulated premium confirmation and insurer quorum result.
- Capture the read-only regulator view and a real settled proof if one is available.
- Identify any prerecorded ledger state, simulation inputs, and sample topology.
- Keep the credential manifest, access codes, browser developer tools, and private data out of frame.
