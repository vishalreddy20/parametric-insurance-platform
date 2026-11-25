import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Session, SessionRepository } from './repository.js';

const accessDuration = 5 * 60_000;
const idleDuration = 15 * 60_000;
const absoluteDuration = 8 * 60 * 60_000;
const token = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export class Sessions {
  constructor(private readonly store: SessionRepository, private readonly clock = Date.now) {}

  async start(accountId: string) {
    const now = this.clock();
    const id = randomUUID();
    const access = token();
    const refresh = token();
    const csrf = token();
    await this.store.insertSession({
      id, accountId, accessHash: hash(access), refreshHash: hash(refresh), csrfHash: hash(csrf),
      accessExpiresAt: now + accessDuration, idleExpiresAt: now + idleDuration,
      absoluteExpiresAt: now + absoluteDuration, revokedAt: null,
    });
    return { id, access, refresh, csrf };
  }

  async authenticate(access: string): Promise<Session | undefined> {
    if (!validToken(access)) return undefined;
    const now = this.clock();
    return this.store.useAccess(hash(access), now, now + idleDuration);
  }

  async refresh(previous: string, csrf: string) {
    if (!validToken(previous) || !validToken(csrf)) return { status: 'invalid' } as const;
    const now = this.clock();
    const access = token();
    const refresh = token();
    const status = await this.store.rotateRefresh(hash(previous), hash(csrf), {
      accessHash: hash(access), refreshHash: hash(refresh),
      accessExpiresAt: now + accessDuration, idleExpiresAt: now + idleDuration,
    }, now);
    if (status !== 'rotated') return { status };
    return { status, access, refresh };
  }

  checkCsrf(session: Session, csrf: string): boolean {
    return validToken(csrf) && timingSafeEqual(Buffer.from(session.csrfHash), Buffer.from(hash(csrf)));
  }

  async list(accountId: string, currentId: string) {
    const sessions = await this.store.listActiveSessions(accountId, this.clock());
    return sessions.map(({ id, idleExpiresAt, absoluteExpiresAt }) => ({
      id, current: id === currentId, idleExpiresAt, absoluteExpiresAt,
    }));
  }

  revoke(accountId: string, sessionId?: string): Promise<void> {
    return this.store.revokeSessions(accountId, this.clock(), sessionId);
  }
}
