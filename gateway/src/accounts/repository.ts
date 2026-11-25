import Database from 'better-sqlite3';
import { ApiError } from '../errors.js';

export const accountRoles = ['worker', 'platform', 'insurer', 'regulator', 'admin'] as const;
export type AccountRole = typeof accountRoles[number];

export interface Account {
  id: string;
  username: string;
  role: AccountRole;
  passwordHash: string;
  platformId: 'zomato' | 'swiggy' | null;
  createdAt: number;
}

export type AccountSummary = Pick<Account, 'id' | 'username' | 'role' | 'platformId'>;

export type AuditAction = 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGIN_LOCKED' | 'MFA_ENROLLED' | 'MFA_FAILURE' |
  'MFA_VERIFIED' | 'MFA_DISABLED' | 'STAFF_PROVISIONED' | 'STAFF_ROLE_CHANGED' | 'SESSIONS_REVOKED' | 'PASSWORD_CHANGED' | 'RESET_ISSUED' | 'PASSWORD_RESET';
export interface AuthAuditEntry {
  id: number;
  at: number;
  action: AuditAction;
  role: AccountRole | null;
  requestId: string;
}

export interface AccountRepository {
  changeStaffRole(accountId: string, role: Exclude<AccountRole, 'worker'>, platformId: Account['platformId'], now: number): Promise<boolean>;
  appendAudit(entry: Omit<AuthAuditEntry, 'id'>): Promise<void>;
  auditPage(before?: number): Promise<AuthAuditEntry[]>;
  issuePasswordReset(accountId: string, hash: string, expiry: number): Promise<boolean>;
  redeemPasswordReset(hash: string, passwordHash: string, now: number): Promise<boolean>;
  listAccounts(after: string, platformId?: NonNullable<Account['platformId']>): Promise<AccountSummary[]>;
  insert(account: Account): Promise<boolean>;
  updatePassword(accountId: string, previous: string, next: string, now: number): Promise<boolean>;
  registration(key: string): Promise<{ fingerprint: string; passwordHash: string } | undefined>;
  register(account: Account, key: string, fingerprint: string): Promise<'created' | 'replay' | 'conflict'>;
  reserveLoginAttempt(key: string, now: number, maximum: number, windowMs: number): Promise<number>;
  clearLoginAttempts(key: string): Promise<void>;
  onboarding(accountId: string): Promise<{ draft: string | null; txId: string | null; blockNumber: string | null } | undefined>;
  saveOnboarding(accountId: string, draft: string): Promise<boolean>;
  recordEnrollment(accountId: string, txId: string, blockNumber: string): Promise<void>;
  findByUsername(username: string): Promise<Account | undefined>;
  findById(id: string): Promise<Account | undefined>;
}

const migrations = [
  `CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('worker', 'platform', 'insurer', 'regulator', 'admin')),
    passwordHash TEXT NOT NULL,
    platformId TEXT CHECK (platformId IN ('zomato', 'swiggy')),
    createdAt INTEGER NOT NULL,
    CHECK ((role IN ('worker', 'platform')) = (platformId IS NOT NULL))
  ) STRICT;`,
  `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL REFERENCES accounts(id),
    accessHash TEXT NOT NULL UNIQUE,
    refreshHash TEXT NOT NULL UNIQUE,
    csrfHash TEXT NOT NULL,
    accessExpiresAt INTEGER NOT NULL,
    idleExpiresAt INTEGER NOT NULL,
    absoluteExpiresAt INTEGER NOT NULL,
    revokedAt INTEGER
  ) STRICT;
  CREATE INDEX sessions_account_id ON sessions(accountId);
  CREATE TABLE used_refresh_tokens (
    hash TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL REFERENCES sessions(id)
  ) STRICT;`,
  `CREATE TABLE account_mfa (
    accountId TEXT PRIMARY KEY REFERENCES accounts(id),
    secret TEXT NOT NULL,
    lastCounter INTEGER NOT NULL DEFAULT -1
  ) STRICT;
  CREATE TABLE recovery_codes (
    accountId TEXT NOT NULL REFERENCES accounts(id),
    hash TEXT NOT NULL,
    PRIMARY KEY (accountId, hash)
  ) STRICT;`,
  `CREATE TABLE registration_requests (
    key TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    accountId TEXT NOT NULL REFERENCES accounts(id)
  ) STRICT;
  CREATE TABLE login_attempts (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX login_attempts_expiry ON login_attempts(expiresAt);`,
  `CREATE TABLE worker_onboarding (
    accountId TEXT PRIMARY KEY REFERENCES accounts(id),
    draft TEXT,
    txId TEXT,
    blockNumber TEXT
  ) STRICT;`,
  `CREATE TABLE password_resets (
    accountId TEXT PRIMARY KEY REFERENCES accounts(id),
    hash TEXT UNIQUE NOT NULL,
    expiresAt INTEGER NOT NULL
  ) STRICT;`,
  `CREATE TABLE auth_audit (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    action TEXT NOT NULL,
    role TEXT,
    requestId TEXT NOT NULL
  ) STRICT;`,
];

export interface Session {
  id: string;
  accountId: string;
  accessHash: string;
  refreshHash: string;
  csrfHash: string;
  accessExpiresAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  revokedAt: number | null;
}

export type ActiveSession = Pick<Session, 'id' | 'idleExpiresAt' | 'absoluteExpiresAt'>;

export type SessionRotation = 'rotated' | 'reuse' | 'invalid';

export interface SessionRepository {
  insertSession(session: Session, expectedPasswordHash?: string): Promise<void>;
  useAccess(hash: string, now: number, idleUntil: number): Promise<Session | undefined>;
  rotateRefresh(oldHash: string, csrfHash: string, next: Pick<Session, 'accessHash' | 'refreshHash' | 'accessExpiresAt' | 'idleExpiresAt'>, now: number): Promise<SessionRotation>;
  listActiveSessions(accountId: string, now: number): Promise<ActiveSession[]>;
  revokeSessions(accountId: string, now: number, id?: string): Promise<void>;
}

export interface MfaRepository {
  getMfa(accountId: string): Promise<{ secret: string; lastCounter: number } | undefined>;
  prepareMfa(accountId: string, secret: string): Promise<void>;
  acceptTotp(accountId: string, secret: string, counter: number, recoveryHashes: string[]): Promise<boolean>;
  removeMfa(accountId: string): Promise<void>;
  consumeRecovery(accountId: string, hash: string): Promise<boolean>;
}

export class SqliteAccounts implements AccountRepository, SessionRepository, MfaRepository {
  private readonly database: Database.Database;

  constructor(path: string) {
    this.database = new Database(path);
    try {
      this.database.pragma('busy_timeout = 5000');
      this.database.pragma('foreign_keys = ON');
      this.database.pragma('journal_mode = WAL');
      this.database.transaction(() => {
        const version = this.database.pragma('user_version', { simple: true }) as number;
        if (version > migrations.length) throw new Error('Unsupported account database schema.');
        for (const migration of migrations.slice(version)) this.database.exec(migration);
        this.database.pragma(`user_version = ${migrations.length}`);
      }).immediate();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  async insert(account: Account): Promise<boolean> {
    return this.insertAccount(account);
  }

  async updatePassword(accountId: string, previous: string, next: string, now: number): Promise<boolean> {
    return this.database.transaction(() => {
      const updated = this.database.prepare('UPDATE accounts SET passwordHash = ? WHERE id = ? AND passwordHash = ?')
        .run(next, accountId, previous);
      if (updated.changes === 0) return false;
      this.invalidateCredentials(accountId, now);
      return true;
    }).immediate();
  }

  private invalidateCredentials(accountId: string, now: number): void {
    this.database.prepare('UPDATE sessions SET revokedAt = ? WHERE accountId = ? AND revokedAt IS NULL').run(now, accountId);
    this.database.prepare('DELETE FROM password_resets WHERE accountId = ?').run(accountId);
  }

  async changeStaffRole(accountId: string, role: Exclude<AccountRole, 'worker'>, platformId: Account['platformId'], now: number): Promise<boolean> {
    return this.database.transaction(() => {
      const update = this.database.prepare("UPDATE accounts SET role = ?, platformId = ? WHERE id = ? AND role != 'worker'")
        .run(role, platformId, accountId);
      if (!update.changes) return false;
      this.invalidateCredentials(accountId, now);
      return true;
    }).immediate();
  }

  async appendAudit(entry: Omit<AuthAuditEntry, 'id'>): Promise<void> {
    this.database.prepare('INSERT INTO auth_audit (at, action, role, requestId) VALUES (@at, @action, @role, @requestId)').run(entry);
  }

  async auditPage(before = Number.MAX_SAFE_INTEGER): Promise<AuthAuditEntry[]> {
    return this.database.prepare('SELECT id, at, action, role, requestId FROM auth_audit WHERE id < ? ORDER BY id DESC LIMIT 51')
      .all(before) as AuthAuditEntry[];
  }

  async issuePasswordReset(accountId: string, hash: string, expiry: number): Promise<boolean> {
    return this.database.prepare(`INSERT INTO password_resets (accountId, hash, expiresAt)
      SELECT id, ?, ? FROM accounts WHERE id = ?
      ON CONFLICT(accountId) DO UPDATE SET hash = excluded.hash, expiresAt = excluded.expiresAt`)
      .run(hash, expiry, accountId).changes === 1;
  }

  async redeemPasswordReset(hash: string, passwordHash: string, now: number): Promise<boolean> {
    return this.database.transaction(() => {
      const reset = this.database.prepare('SELECT accountId FROM password_resets WHERE hash = ? AND expiresAt > ?')
        .get(hash, now) as { accountId: string } | undefined;
      if (!reset) return false;
      this.database.prepare('UPDATE accounts SET passwordHash = ? WHERE id = ?').run(passwordHash, reset.accountId);
      this.invalidateCredentials(reset.accountId, now);
      return true;
    }).immediate();
  }

  private insertAccount(account: Account): boolean {
    const result = this.database.prepare(`INSERT INTO accounts (id, username, role, passwordHash, platformId, createdAt)
      VALUES (@id, @username, @role, @passwordHash, @platformId, @createdAt)
      ON CONFLICT(username) DO NOTHING`).run(account);
    return result.changes === 1;
  }

  async registration(key: string): Promise<{ fingerprint: string; passwordHash: string } | undefined> {
    return this.database.prepare(`SELECT fingerprint, passwordHash FROM registration_requests
      JOIN accounts ON accounts.id = registration_requests.accountId WHERE key = ?`)
      .get(key) as { fingerprint: string; passwordHash: string } | undefined;
  }

  async register(account: Account, key: string, fingerprint: string): Promise<'created' | 'replay' | 'conflict'> {
    return this.database.transaction(() => {
      if (this.database.prepare('SELECT 1 FROM registration_requests WHERE key = ?').get(key)) return 'replay';
      if (!this.insertAccount(account)) return 'conflict';
      this.database.prepare('INSERT INTO registration_requests VALUES (?, ?, ?)').run(key, fingerprint, account.id);
      return 'created';
    }).immediate();
  }

  async reserveLoginAttempt(key: string, now: number, maximum: number, windowMs: number): Promise<number> {
    return this.database.transaction(() => {
      this.database.prepare('DELETE FROM login_attempts WHERE expiresAt <= ?').run(now);
      const current = this.database.prepare('SELECT count, expiresAt FROM login_attempts WHERE key = ?')
        .get(key) as { count: number; expiresAt: number } | undefined;
      if (current && current.count >= maximum) return current.expiresAt - now;
      this.database.prepare(`INSERT INTO login_attempts VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = count + 1`).run(key, now + windowMs);
      return 0;
    }).immediate();
  }

  async clearLoginAttempts(key: string): Promise<void> {
    this.database.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
  }

  async onboarding(accountId: string): Promise<{ draft: string | null; txId: string | null; blockNumber: string | null } | undefined> {
    return this.database.prepare('SELECT draft, txId, blockNumber FROM worker_onboarding WHERE accountId = ?')
      .get(accountId) as { draft: string | null; txId: string | null; blockNumber: string | null } | undefined;
  }

  async saveOnboarding(accountId: string, draft: string): Promise<boolean> {
    return this.database.prepare(`INSERT INTO worker_onboarding (accountId, draft) VALUES (?, ?)
      ON CONFLICT(accountId) DO UPDATE SET draft = excluded.draft WHERE worker_onboarding.txId IS NULL`)
      .run(accountId, draft).changes === 1;
  }

  async recordEnrollment(accountId: string, txId: string, blockNumber: string): Promise<void> {
    this.database.prepare(`INSERT INTO worker_onboarding (accountId, txId, blockNumber) VALUES (?, ?, ?)
      ON CONFLICT(accountId) DO UPDATE SET draft = NULL, txId = excluded.txId, blockNumber = excluded.blockNumber
      WHERE worker_onboarding.txId IS NULL`).run(accountId, txId, blockNumber);
  }

  async listAccounts(after: string, platformId?: NonNullable<Account['platformId']>): Promise<AccountSummary[]> {
    if (platformId) return this.database.prepare(`SELECT id, username, role, platformId FROM accounts
      WHERE id > ? AND role = 'worker' AND platformId = ? ORDER BY id LIMIT 51`).all(after, platformId) as AccountSummary[];
    return this.database.prepare(`SELECT id, username, role, platformId FROM accounts
      WHERE id > ? ORDER BY id LIMIT 51`).all(after) as AccountSummary[];
  }

  async findByUsername(username: string): Promise<Account | undefined> {
    return this.database.prepare(`SELECT id, username, role, passwordHash, platformId, createdAt
      FROM accounts WHERE username = ?`).get(username) as Account | undefined;
  }

  async findById(id: string): Promise<Account | undefined> {
    return this.database.prepare(`SELECT id, username, role, passwordHash, platformId, createdAt
      FROM accounts WHERE id = ?`).get(id) as Account | undefined;
  }

  async getMfa(accountId: string): Promise<{ secret: string; lastCounter: number } | undefined> {
    return this.database.prepare('SELECT secret, lastCounter FROM account_mfa WHERE accountId = ?')
      .get(accountId) as { secret: string; lastCounter: number } | undefined;
  }

  async prepareMfa(accountId: string, secret: string): Promise<void> {
    this.database.prepare('INSERT INTO account_mfa (accountId, secret) VALUES (?, ?) ON CONFLICT(accountId) DO NOTHING')
      .run(accountId, secret);
  }

  async acceptTotp(accountId: string, secret: string, counter: number, recoveryHashes: string[]): Promise<boolean> {
    return this.database.transaction(() => {
      const result = this.database.prepare(`UPDATE account_mfa SET lastCounter = ?
        WHERE accountId = ? AND secret = ? AND lastCounter < ?`).run(counter, accountId, secret, counter);
      if (result.changes !== 1) return false;
      const insert = this.database.prepare('INSERT INTO recovery_codes VALUES (?, ?)');
      for (const hash of recoveryHashes) insert.run(accountId, hash);
      return true;
    }).immediate();
  }

  async removeMfa(accountId: string): Promise<void> {
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM recovery_codes WHERE accountId = ?').run(accountId);
      this.database.prepare('DELETE FROM account_mfa WHERE accountId = ?').run(accountId);
    }).immediate();
  }

  async consumeRecovery(accountId: string, hash: string): Promise<boolean> {
    return this.database.prepare('DELETE FROM recovery_codes WHERE accountId = ? AND hash = ?')
      .run(accountId, hash).changes === 1;
  }

  async insertSession(session: Session, expectedPasswordHash?: string): Promise<void> {
    const row = this.database.prepare(`INSERT INTO sessions
      SELECT @id, @accountId, @accessHash, @refreshHash, @csrfHash, @accessExpiresAt,
        @idleExpiresAt, @absoluteExpiresAt, @revokedAt FROM accounts
      WHERE id = @accountId AND (@expectedPasswordHash IS NULL OR passwordHash = @expectedPasswordHash)`)
      .run({ ...session, expectedPasswordHash: expectedPasswordHash ?? null });
    if (!row.changes) throw new ApiError('ERR_AUTHENTICATION', 401, 'Sign-in could not be completed.');
  }

  async useAccess(hash: string, now: number, idleUntil: number): Promise<Session | undefined> {
    return this.database.prepare(`UPDATE sessions SET idleExpiresAt = MIN(absoluteExpiresAt, ?)
      WHERE accessHash = ? AND revokedAt IS NULL AND accessExpiresAt > ?
        AND idleExpiresAt > ? AND absoluteExpiresAt > ?
      RETURNING *`).get(idleUntil, hash, now, now, now) as Session | undefined;
  }

  async rotateRefresh(
    oldHash: string,
    csrfHash: string,
    next: Pick<Session, 'accessHash' | 'refreshHash' | 'accessExpiresAt' | 'idleExpiresAt'>,
    now: number,
  ): Promise<SessionRotation> {
    return this.database.transaction((): SessionRotation => {
      const reused = this.database.prepare(`UPDATE sessions SET revokedAt = ?
        WHERE id = (SELECT sessionId FROM used_refresh_tokens WHERE hash = ?)
          AND csrfHash = ? AND revokedAt IS NULL AND absoluteExpiresAt > ?`).run(now, oldHash, csrfHash, now);
      if (reused.changes) return 'reuse';
      const session = this.database.prepare(`UPDATE sessions SET accessHash = @accessHash, refreshHash = @refreshHash,
          accessExpiresAt = MIN(absoluteExpiresAt, @accessExpiresAt),
          idleExpiresAt = MIN(absoluteExpiresAt, @idleExpiresAt)
        WHERE refreshHash = @oldHash AND csrfHash = @csrfHash AND revokedAt IS NULL
          AND idleExpiresAt > @now AND absoluteExpiresAt > @now RETURNING id`)
        .get({ ...next, oldHash, csrfHash, now }) as Pick<Session, 'id'> | undefined;
      if (!session) return 'invalid';
      this.database.prepare('INSERT INTO used_refresh_tokens VALUES (?, ?)').run(oldHash, session.id);
      return 'rotated';
    }).immediate();
  }

  async listActiveSessions(accountId: string, now: number): Promise<ActiveSession[]> {
    return this.database.prepare(`SELECT id, idleExpiresAt, absoluteExpiresAt FROM sessions
      WHERE accountId = ? AND revokedAt IS NULL AND idleExpiresAt > ? AND absoluteExpiresAt > ?
      ORDER BY idleExpiresAt DESC, id`).all(accountId, now, now) as ActiveSession[];
  }

  async revokeSessions(accountId: string, now: number, id?: string): Promise<void> {
    this.database.prepare(`UPDATE sessions SET revokedAt = ? WHERE accountId = ? AND revokedAt IS NULL
      AND (? IS NULL OR id = ?)`).run(now, accountId, id ?? null, id ?? null);
  }

  close(): void {
    this.database.close();
  }
}
