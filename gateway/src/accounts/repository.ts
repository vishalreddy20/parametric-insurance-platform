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
];

export class SqliteAccounts implements AccountRepository {
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

  close(): void {
    this.database.close();
  }
}
