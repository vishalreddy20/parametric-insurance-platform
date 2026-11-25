import { createHmac } from 'node:crypto';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as english from '@zxcvbn-ts/language-en';

const strength = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...english.dictionary },
  graphs: common.adjacencyGraphs,
});

const parameters = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
};

export function passwordError(password: string, personalTerms: string[] = []): string | undefined {
  const length = [...password].length;
  if (length < 12 || length > 128) return 'Use between 12 and 128 characters.';
  if (strength.check(password, personalTerms).score < 3) return 'Choose a less predictable access code.';
}

export class PasswordHasher {
  private constructor(
    private readonly dummyHash: string,
    private readonly pepper?: Uint8Array,
  ) {}

  static async create(pepper?: Uint8Array): Promise<PasswordHasher> {
    const hasher = new PasswordHasher('', pepper);
    const dummyHash = await hasher.hash('ParaShield account verification placeholder');
    return new PasswordHasher(dummyHash, pepper);
  }

  private input(password: string): string {
    return this.pepper
      ? createHmac('sha256', this.pepper).update(password).digest('hex')
      : password;
  }

  hash(password: string): Promise<string> {
    return hash(this.input(password), parameters);
  }

  async verify(password: string, storedHash?: string): Promise<boolean> {
    const valid = await verify(storedHash ?? this.dummyHash, this.input(password));
    return valid && storedHash !== undefined;
  }
}
