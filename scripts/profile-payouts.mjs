import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const [logFile, eventKey] = process.argv.slice(2);
if (!logFile) {
  console.error('Usage: node scripts/profile-payouts.mjs LOG_FILE [EVENT_KEY]');
  process.exit(1);
}
const attempts = [];
const delays = [];
const upiCalls = [];
for await (const line of createInterface({ input: createReadStream(logFile), crlfDelay: Infinity })) {
  let row;
  try { row = JSON.parse(line); } catch { continue; }
  if (row.action === 'payout_timing' && (!eventKey || row.eventKey === eventKey)) attempts.push(row);
  if (row.action === 'upi_delay') delays.push(row);
  if (row.action === 'upi_http') upiCalls.push(row);
}

function distribution(rows, key) {
  const values = rows.map((row) => row[key]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return { samples: 0 };
  const quantile = (q) => Math.round(values[Math.ceil(q * values.length) - 1] * 100) / 100;
  return { samples: values.length, p50Ms: quantile(0.5), p95Ms: quantile(0.95) };
}

const summary = {};
const ids = new Set(attempts.map(({ payoutId }) => payoutId));
for (const [label, operation] of [
  ['reservation', 'TriggerContract:ProcessEventForPolicy'],
  ['settlement', 'PayoutContract:RecordSettlement'],
]) {
  const rows = attempts.filter((row) => row.operation === operation);
  const valid = rows.filter((row) => row.valid);
  summary[label] = { invalidCommitAttempts: rows.length - valid.length,
    endorsement: distribution(valid, 'endorsementMs'),
    ordererSubmitRpc: distribution(valid, 'submitMs'),
    commitWait: distribution(valid, 'commitMs') };
}
summary.simulatedUPIDelay = distribution(delays.filter(({ payoutId }) => !eventKey || ids.has(payoutId)), 'durationMs');
summary.mockUPIHttpIncludingCallback = distribution(upiCalls.filter(({ payoutId }) => !eventKey || ids.has(payoutId)), 'durationMs');
console.log(JSON.stringify(summary, null, 2));
