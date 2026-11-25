import Database from 'better-sqlite3';

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

export interface AccountRepository {
  insert(account: Account): Promise<boolean>;
  findByUsername(username: string): Promise<Account | undefined>;
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

export type SessionRotation = 'rotated' | 'reuse' | 'invalid';

export interface SessionRepository {
  insertSession(session: Session): Promise<void>;
  useAccess(hash: string, now: number, idleUntil: number): Promise<Session | undefined>;
  rotateRefresh(oldHash: string, csrfHash: string, next: Pick<Session, 'accessHash' | 'refreshHash' | 'accessExpiresAt' | 'idleExpiresAt'>, now: number): Promise<SessionRotation>;
  revokeSessions(accountId: string, now: number, id?: string): Promise<void>;
}

export class SqliteAccounts implements AccountRepository, SessionRepository {
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
    const result = this.database.prepare(`INSERT INTO accounts (id, username, role, passwordHash, platformId, createdAt)
      VALUES (@id, @username, @role, @passwordHash, @platformId, @createdAt)
      ON CONFLICT(username) DO NOTHING`).run(account);
    return result.changes === 1;
  }

  async findByUsername(username: string): Promise<Account | undefined> {
    return this.database.prepare(`SELECT id, username, role, passwordHash, platformId, createdAt
      FROM accounts WHERE username = ?`).get(username) as Account | undefined;
  }

  async insertSession(session: Session): Promise<void> {
    this.database.prepare(`INSERT INTO sessions
      VALUES (@id, @accountId, @accessHash, @refreshHash, @csrfHash, @accessExpiresAt,
        @idleExpiresAt, @absoluteExpiresAt, @revokedAt)`).run(session);
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

  async revokeSessions(accountId: string, now: number, id?: string): Promise<void> {
    this.database.prepare(`UPDATE sessions SET revokedAt = ? WHERE accountId = ? AND revokedAt IS NULL
      AND (? IS NULL OR id = ?)`).run(now, accountId, id ?? null, id ?? null);
  }

  close(): void {
    this.database.close();
  }
}
