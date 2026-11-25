import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { ChaincodeEvent, Checkpoint, CloseableAsyncIterable } from '@hyperledger/fabric-gateway';
import { ApiError } from './errors.js';
import type { FabricLedger, Ledger } from './ledger.js';
import { eventKey, payoutID, zone } from './schema.js';

const eventPayload = z.object({ eventKey, zone, windowEnd: z.number().int().positive() });
const payoutPayload = z.object({ id: payoutID, amountPaise: z.number().int().positive() });
const decoder = new TextDecoder();
const fsCode = (error: unknown) => (error as NodeJS.ErrnoException).code;

type FanoutJob = { kind: 'fanout'; key: string; zone: string; notBefore: number; bookmark: string };
type SettlementJob = { kind: 'settlement'; key: string; amountPaise: number };
type Job = FanoutJob | SettlementJob;
type Cursor = { blockNumber: string; transactionId: string };

export class Checkpoints {
  private constructor(private readonly directory: string) {}

  static async open(directory: string): Promise<Checkpoints> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return new Checkpoints(directory);
  }

  private async save(name: string, record: unknown) {
    const destination = join(this.directory, name);
    const scratch = destination + '.' + randomUUID() + '.tmp';
    try {
      const file = await open(scratch, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(record));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(scratch, destination);
      const directory = await open(this.directory, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } finally {
      await unlink(scratch).catch((error) => { if (fsCode(error) !== 'ENOENT') throw error; });
    }
  }

  private async load<T>(name: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(join(this.directory, name), 'utf8')) as T;
    } catch (error) {
      if (fsCode(error) !== 'ENOENT') throw error;
    }
  }

  private name(job: Job) {
    return 'job-' + createHash('sha256').update(job.kind + '|' + job.key).digest('hex') + '.json';
  }

  async enqueue(job: Job) {
    const name = this.name(job);
    if (await this.load(name) === undefined) await this.save(name, { job, done: false });
  }

  async *pending() {
    const entries = (await readdir(this.directory)).filter((name) => /^job-[a-f0-9]{64}\.json$/.test(name)).sort();
    for (const name of entries) {
      const record = await this.load<{ job: Job; done: boolean }>(name);
      if (record && !record.done) yield record.job;
    }
  }

  async progress(job: Job, done: boolean) {
    await this.save(this.name(job), { job, done });
  }

  findProof(txId: string) { return this.load<Cursor>('proof-' + txId + '.json'); }

  loadCursor() { return this.load<Cursor>('cursor.json'); }

  async recordEvent(event: ChaincodeEvent) {
    const parse = () => JSON.parse(decoder.decode(event.payload)) as unknown;
    if (event.eventName === 'EventDeclared') {
      const value = eventPayload.parse(parse());
      await this.enqueue({ kind: 'fanout', key: value.eventKey, zone: value.zone,
        notBefore: value.windowEnd + 3600, bookmark: '' });
    } else if (event.eventName === 'PayoutReserved') {
      const value = payoutPayload.parse(parse());
      await this.enqueue({ kind: 'settlement', key: value.id, amountPaise: value.amountPaise });
    }
    const proof = { blockNumber: String(event.blockNumber), transactionId: event.transactionId };
    if (/^[a-f0-9]{64}$/.test(event.transactionId)) await this.save('proof-' + event.transactionId + '.json', proof);
    await this.save('cursor.json', proof);
  }
}

type Settlement = (job: SettlementJob) => Promise<void>;
type Logger = (entry: Record<string, unknown>) => void;

export class Fanout {
  constructor(private readonly ledger: Ledger, private readonly insurer: string,
    private readonly state: Checkpoints, private readonly settle: Settlement | undefined, private readonly log: Logger) {}

  async process(job: Job, now = Math.floor(Date.now() / 1000)) {
    if (job.kind === 'settlement') {
      if (!this.settle) return;
      await this.settle(job);
      await this.state.progress(job, true);
      return;
    }
    if (now < job.notBefore) return;
    const page = await this.ledger.evaluate<{ policies: { id: string }[]; bookmark: string }>(
      this.insurer, 'PolicyContract:ListPoliciesByZone', [job.zone, 'ACTIVE', '25', job.bookmark],
    );
    if (page.bookmark && page.bookmark === job.bookmark) throw new Error('Non-progressing policy bookmark.');
    const skips = new Map<string, number>();
    for (let offset = 0; offset < page.policies.length; offset += 5) {
      const outcomes = await Promise.allSettled(page.policies.slice(offset, offset + 5).map(async ({ id }) => {
        try {
          await this.ledger.submit(this.insurer, 'TriggerContract:ProcessEventForPolicy', { arguments: [job.key, id] });
        } catch (error) {
          if (!(error instanceof ApiError) || !['ERR_CAP_EXCEEDED', 'ERR_CONFLICT', 'ERR_NOT_FOUND'].includes(error.code)
              && !error.businessRejection) throw error;
          skips.set(error.code, (skips.get(error.code) ?? 0) + 1);
        }
      }));
      const failure = outcomes.find((outcome) => outcome.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    }
    await this.state.progress({ ...job, bookmark: page.bookmark }, !page.bookmark);
    this.log({ action: 'fanout_page', rows: page.policies.length, skipped: Object.fromEntries(skips) });
  }

  async run(signal: AbortSignal) {
    while (!signal.aborted) {
      try {
        for await (const job of this.state.pending()) {
          if (signal.aborted) break;
          try {
            await this.process(job);
          } catch (error) {
            this.log({ action: 'job_retry', kind: job.kind, code: error instanceof ApiError ? error.code : 'ERR_JOB' });
          }
        }
      } catch {
        this.log({ action: 'checkpoint_retry', code: 'ERR_CHECKPOINT' });
      }
      await delay(1000, undefined, { signal }).catch(() => {});
    }
  }
}

export async function consumeEvents(ledger: FabricLedger, actor: string, state: Checkpoints, signal: AbortSignal, log: Logger) {
  while (!signal.aborted) {
    let stream: CloseableAsyncIterable<ChaincodeEvent> | undefined;
    const close = () => stream?.close();
    signal.addEventListener('abort', close, { once: true });
    try {
      const cursor = await state.loadCursor();
      const checkpoint: Checkpoint | undefined = cursor ? {
        getBlockNumber: () => BigInt(cursor.blockNumber),
        getTransactionId: () => cursor.transactionId,
      } : undefined;
      stream = await ledger.network(actor).getChaincodeEvents(ledger.chaincode, { startBlock: 0n, checkpoint });
      if (signal.aborted) break;
      for await (const event of stream) {
        if (signal.aborted) break;
        await state.recordEvent(event);
      }
    } catch {
      if (!signal.aborted) log({ action: 'ledger_event_retry', code: 'ERR_EVENT_STREAM' });
    } finally {
      signal.removeEventListener('abort', close);
      close();
    }
    await delay(1500, undefined, { signal }).catch(() => {});
  }
}

export async function callMockUPI(url: string, authorization: string, path: string, input: unknown): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(38_000),
    });
    if (response.ok) return await response.json();
    await response.body?.cancel();
  } catch {
    // The request may have completed; callers reuse the deterministic reference.
  }
  throw new ApiError('ERR_MOCK_UPI', 503, 'Simulated payment processing is unavailable.');
}

export function mockSettlement(url: string, authorization: string): Settlement {
  return async (job) => {
    await callMockUPI(url, authorization, '/v1/payouts', {
      payoutId: job.key, reference: 'pay-' + job.key.slice(0, 60), amountPaise: job.amountPaise,
    });
  };
}
