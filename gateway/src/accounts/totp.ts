import { createHmac, timingSafeEqual } from 'node:crypto';

const periodMs = 30_000;

function codeAt(secret: Uint8Array, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}

// Persist the accepted counter with a compare-and-set before granting access.
export function matchTotp(secret: Uint8Array, code: string, now: number, lastAccepted: number): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  const supplied = Buffer.from(code);
  const current = Math.floor(now / periodMs);
  let matched: number | undefined;
  for (const counter of [current - 1, current, current + 1]) {
    if (counter < 0) continue;
    const matches = timingSafeEqual(supplied, Buffer.from(codeAt(secret, counter)));
    if (matches && counter > lastAccepted) matched = counter;
  }
  return matched;
}
