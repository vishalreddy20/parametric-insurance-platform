import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { Account, MfaRepository } from './repository.js';
import { matchTotp } from './totp.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(bytes: Uint8Array): string {
  let result = '';
  let bits = 0;
  let buffer = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >> bits) & 31];
    }
  }
  return bits ? result + alphabet[(buffer << (5 - bits)) & 31] : result;
}

export class Mfa {
  constructor(private readonly store: MfaRepository, private readonly key: Uint8Array, private readonly clock = Date.now) {}

  private seal(accountId: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(accountId));
    const ciphertext = Buffer.concat([cipher.update(randomBytes(20)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  }

  private open(accountId: string, encrypted: string): Buffer {
    const value = Buffer.from(encrypted, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.key, value.subarray(0, 12));
    decipher.setAAD(Buffer.from(accountId));
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]);
  }

  private recoveryHash(accountId: string, code: string): string {
    return createHmac('sha256', this.key).update('recovery:' + accountId + ':' + code).digest('hex');
  }

  async isEnrolled(accountId: string): Promise<boolean> {
    const record = await this.store.getMfa(accountId);
    return record !== undefined && record.lastCounter >= 0;
  }

  async begin(accountId: string): Promise<string | undefined> {
    await this.store.prepareMfa(accountId, this.seal(accountId));
    const record = await this.store.getMfa(accountId);
    if (record && record.lastCounter < 0) return base32(this.open(accountId, record.secret));
  }

  disable(accountId: string): Promise<void> {
    return this.store.removeMfa(accountId);
  }

  async verify(account: Account, supplied?: { code: string; recovery: boolean }) {
    let record = await this.store.getMfa(account.id);
    if (account.role === 'worker' && (!record || (record.lastCounter < 0 && !supplied))) {
      return { status: 'verified' } as const;
    }
    if (!record) {
      await this.store.prepareMfa(account.id, this.seal(account.id));
      record = await this.store.getMfa(account.id);
      if (!record) throw new Error('MFA enrolment state could not be loaded.');
    }
    if (record.lastCounter < 0 && !supplied) {
      return { status: 'enrol', setupKey: base32(this.open(account.id, record.secret)) } as const;
    }
    if (!supplied) return { status: 'challenge' } as const;
    if (supplied.recovery) {
      const ok = record.lastCounter >= 0 && await this.store.consumeRecovery(account.id, this.recoveryHash(account.id, supplied.code));
      return { status: ok ? 'verified' : 'invalid' } as const;
    }
    const counter = matchTotp(this.open(account.id, record.secret), supplied.code, this.clock(), record.lastCounter);
    if (counter === undefined) return { status: 'invalid' } as const;
    const recoveryCodes = record.lastCounter < 0
      ? Array.from({ length: 10 }, () => randomBytes(15).toString('base64url'))
      : [];
    const accepted = await this.store.acceptTotp(account.id, record.secret, counter,
      recoveryCodes.map((code) => this.recoveryHash(account.id, code)));
    if (!accepted) return { status: 'invalid' } as const;
    return { status: 'verified', recoveryCodes } as const;
  }
}
