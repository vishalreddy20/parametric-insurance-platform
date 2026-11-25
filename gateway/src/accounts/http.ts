import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth.js';
import { zone } from '../schema.js';
import { ApiError } from '../errors.js';
import { Mfa } from './mfa.js';
import { PasswordHasher, passwordError } from './password.js';
import { type AccountRepository, type Account } from './repository.js';
import { Sessions } from './sessions.js';

const username = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/);
const loginBody = z.strictObject({
  username, password: z.string().min(1).max(256),
  mfa: z.strictObject({ code: z.string().regex(/^(\d{6}|[A-Za-z0-9_-]{20})$/), recovery: z.boolean() }).optional(),
});
const registration = z.strictObject({
  username, password: z.string().min(1).max(256),
  platformId: z.enum(['zomato', 'swiggy']),
});
const onboardingDraft = z.strictObject({
  step: z.number().int().min(0).max(2),
  name: z.string().max(120), phone: z.string().max(32), upi: z.string().max(120),
  zone: zone.or(z.literal('')), income: z.string().max(12), hours: z.string().max(8),
  tier: z.enum(['basic', 'standard', 'premium']),
});
const idempotencyKey = z.uuid();
const empty = z.strictObject({});
const invalid = () => new ApiError('ERR_AUTHENTICATION', 401, 'Sign-in could not be completed.');
const validCsrf = /^[A-Za-z0-9_-]{43}$/;

function cookies(request: Request): Map<string, string> {
  const entries = new Map<string, string>();
  for (const item of (request.get('cookie') ?? '').split(';')) {
    const index = item.indexOf('=');
    if (index < 1) continue;
    const name = item.slice(0, index).trim();
    if (!['ps_access', 'ps_refresh', 'ps_csrf'].includes(name)) continue;
    if (entries.has(name)) throw invalid();
    entries.set(name, item.slice(index + 1).trim());
  }
  return entries;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError('ERR_VALIDATION', 400, 'The request did not match the expected schema.');
  return result.data;
}

type Options = {
  store: AccountRepository;
  requestKey: Uint8Array;
  hasher: PasswordHasher;
  mfa: Mfa;
  sessions: Sessions;
  origin: string;
};

class Attempts {
  private readonly windows = new Map<string, { count: number; expiry: number }>();

  hit(key: string, max: number, windowMs: number, response: Response) {
    const now = Date.now();
    if (this.windows.size >= 10_000) {
      for (const [entry, window] of this.windows) if (window.expiry <= now) this.windows.delete(entry);
      if (this.windows.size >= 10_000 && !this.windows.has(key)) this.reject(windowMs, response);
    }
    const existing = this.windows.get(key);
    const window = existing && existing.expiry > now ? existing : { count: 0, expiry: now + windowMs };
    if (window.count >= max) this.reject(window.expiry - now, response);
    window.count++;
    this.windows.set(key, window);
  }

  private reject(wait: number, response: Response): never {
    const seconds = Math.ceil(wait / 1000);
    response.set('Retry-After', String(seconds));
    throw new ApiError('ERR_RATE_LIMIT', 429, 'Too many requests. Try again in ' + seconds + ' seconds.');
  }
}

export class AccountHttp {
  private readonly attempts = new Attempts();
  private readonly secure: boolean;
  private readonly draftKey: Buffer;

  constructor(private readonly options: Options) {
    this.draftKey = createHmac('sha256', options.requestKey).update('onboarding-draft-v1').digest();
    const url = new URL(options.origin);
    this.secure = url.protocol === 'https:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  }

  private origin(request: Request): void {
    if (request.get('origin') !== this.options.origin) this.rejectCsrf();
  }

  private rejectCsrf(): never {
    throw new ApiError('ERR_CSRF', 403, 'The request could not be verified.');
  }

  private csrf(request: Request): string {
    this.origin(request);
    const header = request.get('x-csrf-token') ?? '';
    const stored = cookies(request).get('ps_csrf') ?? '';
    if (!validCsrf.test(header) || !validCsrf.test(stored) ||
      !timingSafeEqual(Buffer.from(header), Buffer.from(stored))) this.rejectCsrf();
    return header;
  }

  private setCookie(response: Response, name: string, value: string, maxAge: number): void {
    response.cookie(name, value, { httpOnly: true, sameSite: 'strict', secure: this.secure, path: '/', maxAge });
  }

  private setTokens(response: Response, access: string, refresh: string): void {
    this.setCookie(response, 'ps_access', access, 5 * 60_000);
    this.setCookie(response, 'ps_refresh', refresh, 8 * 60 * 60_000);
  }

  private async current(request: Request) {
    const access = cookies(request).get('ps_access');
    const session = access && await this.options.sessions.authenticate(access);
    if (!session) throw invalid();
    const account = await this.options.store.findById(session.accountId);
    if (!account) throw invalid();
    return { session, account };
  }

  private publicAccount(account: Account) {
    return { role: account.role, username: account.username, platformId: account.platformId,
      ...(account.role === 'worker' && { workerId: account.id, policyId: account.id }) };
  }

  async principal(request: Request): Promise<Principal | undefined> {
    if (!cookies(request).has('ps_access')) return undefined;
    const { session, account } = await this.current(request);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !this.options.sessions.checkCsrf(session, this.csrf(request))) this.rejectCsrf();
    if (account.role === 'admin') throw new ApiError('ERR_UNAUTHORIZED', 403, 'This role cannot perform the ledger operation.');
    const platformId = account.platformId ?? undefined;
    return { username: account.username, role: account.role, actor: platformId ?? account.role,
      platformId, ...(account.role === 'worker' && { policyId: account.id, workerId: account.id }) };
  }

  async recordEnrollment(accountId: string, txId: string, blockNumber: string): Promise<void> {
    if (!await this.options.store.findById(accountId)) return;
    await this.options.store.recordEnrollment(accountId, txId, blockNumber);
  }

  private sealDraft(accountId: string, draft: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.draftKey, nonce);
    cipher.setAAD(Buffer.from(accountId));
    const encrypted = Buffer.concat([cipher.update(draft, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  private openDraft(accountId: string, sealed: string) {
    const bytes = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.draftKey, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(accountId));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return onboardingDraft.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')));
  }

  mount(app: Express): void {
    const page = z.strictObject({ after: z.uuid().optional() });
    const forbidden = () => new ApiError('ERR_UNAUTHORIZED', 403, 'This account cannot perform the operation.');
    app.get('/v1/auth/directory', async (request, response) => {
      const { account } = await this.current(request);
      if (account.role !== 'admin' && account.role !== 'platform') throw forbidden();
      if (account.role === 'platform' && !account.platformId) throw forbidden();
      const { after } = parse(page, request.query);
      const records = await this.options.store.listAccounts(after ?? '', account.platformId ?? undefined);
      response.json({ records: records.slice(0, 50), next: records.length > 50 ? records[49].id : null });
    });
    app.post('/v1/auth/admin/provision', async (request, response) => {
      const csrf = this.csrf(request);
      const { account, session } = await this.current(request);
      if (!this.options.sessions.checkCsrf(session, csrf)) this.rejectCsrf();
      if (account.role !== 'admin') throw forbidden();
      this.attempts.hit('provision:' + account.id, 10, 60_000, response);
      const body = parse(z.strictObject({
        username, password: z.string().min(1).max(256),
        role: z.enum(['platform', 'insurer', 'regulator', 'admin']),
        platformId: z.enum(['zomato', 'swiggy']).nullable(),
      }).refine(({ role, platformId }) => (role === 'platform') === (platformId !== null)), request.body);
      const problem = passwordError(body.password, [body.username]);
      if (problem) throw new ApiError('ERR_PASSWORD_POLICY', 400, problem);
      const passwordHash = await this.options.hasher.hash(body.password);
      const { role, platformId, username: name } = body;
      if (!await this.options.store.insert({ id: randomUUID(), username: name, role, platformId, passwordHash, createdAt: Date.now() })) {
        throw new ApiError('ERR_REGISTRATION', 409, 'Could not provision the account. Check that the username is available.');
      }
      response.sendStatus(201);
    });
    app.post('/v1/auth/admin/revoke', async (request, response) => {
      const csrf = this.csrf(request);
      const { account, session } = await this.current(request);
      if (!this.options.sessions.checkCsrf(session, csrf)) this.rejectCsrf();
      if (account.role !== 'admin') throw forbidden();
      const { accountId } = parse(z.strictObject({ accountId: z.uuid() }), request.body);
      if (accountId === account.id) throw new ApiError('ERR_VALIDATION', 400, 'Use Account security to end your own sessions.');
      await this.options.sessions.revoke(accountId);
      response.sendStatus(204);
    });
    const resetHash = (code: string) => createHmac('sha256', this.options.requestKey).update('password-reset:' + code).digest('hex');
    app.post('/v1/auth/admin/reset-code', async (request, response) => {
      const csrf = this.csrf(request);
      const { account, session } = await this.current(request);
      if (!this.options.sessions.checkCsrf(session, csrf)) this.rejectCsrf();
      if (account.role !== 'admin') throw forbidden();
      this.attempts.hit('reset-issue:' + account.id, 10, 60_000, response);
      const { accountId } = parse(z.strictObject({ accountId: z.uuid() }), request.body);
      if (accountId === account.id) throw forbidden();
      const code = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + 15 * 60_000;
      if (!await this.options.store.issuePasswordReset(accountId, resetHash(code), expiresAt)) {
        throw new ApiError('ERR_NOT_FOUND', 404, 'Account unavailable.');
      }
      response.json({ code, expiresAt });
    });
    app.post('/v1/auth/reset-password', async (request, response) => {
      this.csrf(request);
      this.attempts.hit('reset-use:' + request.ip, 5, 15 * 60_000, response);
      const { code, newPassword } = parse(z.strictObject({
        code: z.string().regex(validCsrf), newPassword: z.string().min(1).max(256),
      }), request.body);
      const problem = passwordError(newPassword);
      if (problem) throw new ApiError('ERR_PASSWORD_POLICY', 400, problem);
      const hash = await this.options.hasher.hash(newPassword);
      if (!await this.options.store.redeemPasswordReset(resetHash(code), hash, Date.now())) {
        throw new ApiError('ERR_RESET_CODE', 400, 'The reset code is invalid or has expired.');
      }
      for (const cookie of ['ps_access', 'ps_refresh', 'ps_csrf']) this.setCookie(response, cookie, '', 0);
      response.sendStatus(204);
    });
    app.get('/v1/auth/csrf', (request, response) => {
      if (!(request.get('origin') === undefined && request.get('sec-fetch-site') === 'same-origin')) this.origin(request);
      const existing = cookies(request).get('ps_csrf');
      const token = existing && validCsrf.test(existing) ? existing : randomBytes(32).toString('base64url');
      this.setCookie(response, 'ps_csrf', token, 8 * 60 * 60_000);
      response.json({ csrfToken: token });
    });
    app.post('/v1/auth/register', async (request, response) => {
      this.csrf(request);
      const key = parse(idempotencyKey, request.get('idempotency-key'));
      const body = parse(registration, request.body);
      const fingerprint = createHmac('sha256', this.options.requestKey)
        .update(JSON.stringify(['registration', key, body.username.toLowerCase(), body.platformId]))
        .digest('hex');
      const conflict = () => new ApiError('ERR_REGISTRATION', 409, 'Registration could not be completed.');
      const replay = async (existing: NonNullable<Awaited<ReturnType<AccountRepository['registration']>>>) => {
        const matches = await this.options.hasher.verify(body.password, existing.passwordHash);
        if (!matches || !timingSafeEqual(Buffer.from(existing.fingerprint), Buffer.from(fingerprint))) throw conflict();
      };
      const existing = await this.options.store.registration(key);
      if (existing) {
        this.attempts.hit('register-retry:' + request.ip, 30, 60_000, response);
        await replay(existing);
        response.sendStatus(201);
        return;
      }
      this.attempts.hit('register:' + request.ip, 5, 15 * 60_000, response);
      const problem = passwordError(body.password, [body.username]);
      if (problem) throw new ApiError('ERR_PASSWORD_POLICY', 400, problem);
      const passwordHash = await this.options.hasher.hash(body.password);
      const inserted = await this.options.store.register({
        id: randomUUID(), username: body.username, role: 'worker', platformId: body.platformId,
        passwordHash, createdAt: Date.now(),
      }, key, fingerprint);
      if (inserted === 'conflict') throw conflict();
      if (inserted === 'replay') {
        const committed = await this.options.store.registration(key);
        if (!committed) throw conflict();
        await replay(committed);
      }
      response.sendStatus(201);
    });
    app.post('/v1/auth/login', async (request, response) => {
      this.csrf(request);
      const body = parse(loginBody, request.body);
      this.attempts.hit('login:' + request.ip, 30, 60_000, response);
      const key = createHmac('sha256', this.options.requestKey).update('login:' + body.username.toLowerCase()).digest('hex');
      const wait = await this.options.store.reserveLoginAttempt(key, Date.now(), 8, 15 * 60_000);
      if (wait > 0) {
        const seconds = Math.ceil(wait / 1000);
        response.set('Retry-After', String(seconds));
        throw new ApiError('ERR_ACCOUNT_LOCKED', 423, 'Sign-in is temporarily locked. Try again in ' + seconds + ' seconds.');
      }
      const account = await this.options.store.findByUsername(body.username);
      const matches = await this.options.hasher.verify(body.password, account?.passwordHash);
      if (!matches || !account) throw invalid();
      const result = await this.options.mfa.verify(account, body.mfa);
      if (result.status === 'invalid') throw invalid();
      if (result.status === 'enrol' || result.status === 'challenge') {
        response.status(202).json(result);
        return;
      }
      await this.options.store.clearLoginAttempts(key);
      const session = await this.options.sessions.start(account.id, account.passwordHash);
      this.setTokens(response, session.access, session.refresh);
      this.setCookie(response, 'ps_csrf', session.csrf, 8 * 60 * 60_000);
      response.json({ ...this.publicAccount(account), csrfToken: session.csrf, recoveryCodes: result.recoveryCodes ?? [] });
    });
    app.get('/v1/auth/session', async (request, response) => {
      try {
        const { account } = await this.current(request);
        response.json(this.publicAccount(account));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && cookies(request).get('ps_refresh')) {
          throw new ApiError('ERR_SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
        }
        throw error;
      }
    });
    app.get('/v1/auth/onboarding', async (request, response) => {
      const { account } = await this.current(request);
      if (account.role !== 'worker') throw new ApiError('ERR_UNAUTHORIZED', 403, 'This operation requires a worker account.');
      const entry = await this.options.store.onboarding(account.id);
      response.json({ draft: entry?.draft ? this.openDraft(account.id, entry.draft) : null,
        confirmation: entry?.txId ? { txId: entry.txId, blockNumber: entry.blockNumber } : null });
    });
    app.post('/v1/auth/onboarding', async (request, response) => {
      const csrf = this.csrf(request);
      const { account, session } = await this.current(request);
      if (account.role !== 'worker') throw new ApiError('ERR_UNAUTHORIZED', 403, 'This operation requires a worker account.');
      if (!this.options.sessions.checkCsrf(session, csrf)) this.rejectCsrf();
      const draft = parse(onboardingDraft, request.body);
      if (!await this.options.store.saveOnboarding(account.id, this.sealDraft(account.id, JSON.stringify(draft)))) {
        throw new ApiError('ERR_STATE', 409, 'Your policy has already been created.');
      }
      response.sendStatus(204);
    });
    app.get('/v1/auth/security', async (request, response) => {
      const { account, session } = await this.current(request);
      const [sessions, authenticatorEnrolled] = await Promise.all([
        this.options.sessions.list(account.id, session.id), this.options.mfa.isEnrolled(account.id),
      ]);
      response.json({ sessions, authenticatorEnrolled });
    });
    app.post('/v1/auth/security/password', async (request, response) => {
      const csrf = this.csrf(request);
      const { account, session } = await this.current(request);
      if (!this.options.sessions.checkCsrf(session, csrf)) this.rejectCsrf();
      this.attempts.hit('password:' + account.id, 5, 15 * 60_000, response);
      const credential = z.string().min(1).max(256);
      const body = parse(z.strictObject({ currentPassword: credential, newPassword: credential }), request.body);
      if (!await this.options.hasher.verify(body.currentPassword, account.passwordHash)) {
        throw new ApiError('ERR_PASSWORD_MISMATCH', 400, 'The current password could not be verified.');
      }
      const problem = passwordError(body.newPassword, [account.username]);
      if (problem) throw new ApiError('ERR_PASSWORD_POLICY', 400, problem);
      if (body.newPassword === body.currentPassword) throw new ApiError('ERR_PASSWORD_POLICY', 400, 'Choose a different password.');
      const hash = await this.options.hasher.hash(body.newPassword);
      if (!await this.options.store.updatePassword(account.id, account.passwordHash, hash, Date.now())) throw invalid();
      for (const cookie of ['ps_access', 'ps_refresh', 'ps_csrf']) this.setCookie(response, cookie, '', 0);
      response.sendStatus(204);
    });
    app.post('/v1/auth/security/revoke', async (request, response) => {
      const csrf = this.csrf(request);
      const { sessionId } = parse(z.strictObject({ sessionId: z.uuid() }), request.body);
      const { account, session } = await this.current(request);
      if (!this.options.sessions.checkCsrf(session, csrf)) this.rejectCsrf();
      if (sessionId === session.id) throw new ApiError('ERR_VALIDATION', 400, 'Use Sign out to end this session.');
      await this.options.sessions.revoke(account.id, sessionId);
      response.sendStatus(204);
    });
    app.post('/v1/auth/refresh', async (request, response) => {
      const csrf = this.csrf(request);
      parse(empty, request.body);
      const refresh = cookies(request).get('ps_refresh');
      if (!refresh) throw invalid();
      const rotated = await this.options.sessions.refresh(refresh, csrf);
      if (!rotated.access || !rotated.refresh) throw invalid();
      this.setTokens(response, rotated.access, rotated.refresh);
      response.sendStatus(204);
    });
    for (const [route, everywhere] of [['logout', false], ['logout-everywhere', true]] as const) {
      app.post('/v1/auth/' + route, async (request, response) => {
        const csrf = this.csrf(request);
        parse(empty, request.body);
        const { account, session } = await this.current(request);
        if (!this.options.sessions.checkCsrf(session, csrf)) this.rejectCsrf();
        await this.options.sessions.revoke(account.id, everywhere ? undefined : session.id);
        for (const cookie of ['ps_access', 'ps_refresh', 'ps_csrf']) this.setCookie(response, cookie, '', 0);
        response.sendStatus(204);
      });
    }
  }
}
