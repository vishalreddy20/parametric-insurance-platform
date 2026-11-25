import { DataError } from './provider';
import type { Benchmark, DataProvider, DisruptionEvent, LedgerProof, Payout, Policy, Reconciliation, Session, SignInResult } from './provider';

export function ledgerProvider(base: string): DataProvider {
  let csrfToken: string | undefined;
  let refresh: Promise<void> | undefined;
  let generation = 0;

  async function request<T>(path: string, session?: Session, body?: unknown, retry = true, idempotencyKey?: string): Promise<T> {
    const sentGeneration = generation;
    let response: Response;
    try {
      response = await fetch(base.replace(/\/$/, '') + '/v1' + path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrf(), ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(path === '/simulations' ? 95_000 : 45_000),
      });
    } catch (error) {
      if (error instanceof DataError) throw error;
      throw new DataError('ERR_OFFLINE', 'The gateway is unreachable or taking longer than expected. Try again.');
    }
    const value = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.status === 401 && retry && (session || (path === '/auth/session' && value?.code === 'ERR_SESSION_EXPIRED'))) {
      if (sentGeneration === generation) {
        refresh ??= request<void>('/auth/refresh', undefined, {}, false)
          .then(() => { generation++; }).finally(() => { refresh = undefined; });
        try { await refresh; }
        catch (error) {
          if (error instanceof DataError && error.code === 'ERR_AUTHENTICATION') {
            throw new DataError('ERR_SESSION_EXPIRED', 'Your session expired. Sign in again.');
          }
          throw error;
        }
      }
      return request<T>(path, session, body, false, idempotencyKey);
    }
    if (response.ok && (response.status === 201 || response.status === 204) && path.startsWith('/auth/')) return undefined as T;
    if (!response.ok) {
      if (response.status === 401 && session) throw new DataError('ERR_SESSION_EXPIRED', 'Your session expired. Sign in again.');
      throw new DataError(value?.code ?? 'ERR_GATEWAY', value?.message ?? 'The gateway could not complete the request.');
    }
    if (value === null) throw new DataError('ERR_GATEWAY', 'The gateway returned an invalid response.');
    return value as T;
  }

  async function csrf(): Promise<string> {
    csrfToken ??= (await request<{ csrfToken: string }>('/auth/csrf')).csrfToken;
    return csrfToken;
  }
  const optional = async <T,>(work: Promise<T>): Promise<T | null> => {
    try { return await work; }
    catch (error) { if (error instanceof DataError && error.code === 'ERR_NOT_FOUND') return null; throw error; }
  };
  const byPolicy = (id?: string) => '/policies/' + encodeURIComponent(id ?? '');
  async function all<T>(path: string, session: Session, field: 'records' | 'policies'): Promise<T[]> {
    const records: T[] = [];
    const seen = new Set<string>();
    let bookmark = '';
    do {
      const page = await request<Record<string, unknown> & { bookmark: string }>(
        path + (path.includes('?') ? '&' : '?') + 'size=100&bookmark=' + encodeURIComponent(bookmark), session,
      );
      records.push(...page[field] as T[]);
      bookmark = page.bookmark;
      if (seen.has(bookmark)) throw new DataError('ERR_GATEWAY', 'The ledger returned a repeated page.');
      seen.add(bookmark);
    } while (bookmark);
    return records;
  }

  return {
    async signIn(username, password, mfa): Promise<SignInResult> {
      const result = await request<Exclude<SignInResult, { status: 'signed-in' }> |
        (Session & { csrfToken: string; recoveryCodes: string[] })>('/auth/login', undefined, { username, password, mfa });
      if ('status' in result) return result;
      const { csrfToken: nextCsrf, recoveryCodes, ...session } = result;
      csrfToken = nextCsrf;
      return { status: 'signed-in', session, recoveryCodes };
    },
    currentSession: () => request('/auth/session'),
    async signOut(session) {
      try { await request('/auth/logout', session, {}); }
      finally { csrfToken = undefined; }
    },
    register: (username, password, platformId, key) => request('/auth/register', undefined, { username, password, platformId }, true, key),
    policy: (session) => optional(request<Policy>(byPolicy(session.policyId), session)),
    enroll: async (session, terms) => (await request<{ result: Policy }>('/policies', session,
      { ...terms, policyId: session.policyId, workerId: session.workerId })).result,
    payPremium: (session) => request(byPolicy(session.policyId) + '/premium-simulation', session, {}),
    events: (session, zone) => all<DisruptionEvent>('/events/' + zone, session, 'records'),
    payouts: (session) => all<Payout>(byPolicy(session.policyId) + '/payouts', session, 'records'),
    event: (session, key) => optional(request<DisruptionEvent>('/events/detail?key=' + encodeURIComponent(key), session)),
    proof: (session, txId, payoutId) => optional(request<LedgerProof>('/ledger-proof/' + encodeURIComponent(txId) + '?payoutId=' + encodeURIComponent(payoutId), session)),
    policies: (session, zone, status) => all<Policy>('/summary/' + zone + '?status=' + status, session, 'policies'),
    benchmark: async (session) => (await request<{ run: Benchmark | null }>('/benchmarks/latest', session)).run,
    reconciliation: async (session, zone, week) => {
      let bookmark = '';
      const seen = new Set<string>();
      const totals: Reconciliation = { reservedCount: 0, settledCount: 0, failedCount: 0, reservedPaise: 0, settledPaise: 0, failedPaise: 0 };
      do {
        const page = await request<Reconciliation & { bookmark: string }>(
          '/reconciliation/' + zone + '?size=100&week=' + week + '&bookmark=' + encodeURIComponent(bookmark), session,
        );
        for (const key of Object.keys(totals) as (keyof Reconciliation)[]) totals[key] += page[key];
        bookmark = page.bookmark;
        if (seen.has(bookmark)) throw new DataError('ERR_GATEWAY', 'The ledger returned a repeated page.');
        seen.add(bookmark);
      } while (bookmark);
      return totals;
    },
    simulate: (session, zone, mode) => request('/simulations', session, { zone, scenario: 'storm', mode }),
  };
}
