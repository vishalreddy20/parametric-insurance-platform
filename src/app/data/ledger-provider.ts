import { DataError } from './provider';
import type { Benchmark, DataProvider, DisruptionEvent, LedgerProof, Payout, Policy, Reconciliation, Session } from './provider';

export function ledgerProvider(base: string): DataProvider {
  async function request<T>(path: string, session?: Session, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(base.replace(/\/$/, '') + '/v1' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(session && { Authorization: 'Bearer ' + session.token }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(path === '/simulations' ? 95_000 : 45_000),
      });
    } catch {
      throw new DataError('ERR_OFFLINE', 'The gateway is unreachable or taking longer than expected. Try again.');
    }
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && session) throw new DataError('ERR_SESSION_EXPIRED', 'Your session expired. Sign in again.');
      throw new DataError(value?.code ?? 'ERR_GATEWAY', value?.message ?? 'The gateway could not complete the request.');
    }
    if (value === null) throw new DataError('ERR_GATEWAY', 'The gateway returned an invalid response.');
    return value as T;
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
    mode: 'ledger',
    signIn: (username, accessCode) => request('/login', undefined, { username, accessCode }),
    policy: (session) => optional(request<Policy>(byPolicy(session.policyId), session)),
    enroll: async (session, terms) => (await request<{ result: Policy }>('/policies', session,
      { ...terms, policyId: session.policyId, workerId: session.workerId })).result,
    payPremium: (session) => request(byPolicy(session.policyId) + '/premium-simulation', session, {}),
    events: (session, zone) => all<DisruptionEvent>('/events/' + zone, session, 'records'),
    payouts: (session) => all<Payout>(byPolicy(session.policyId) + '/payouts', session, 'records'),
    event: (session, key) => optional(request<DisruptionEvent>('/events/detail?key=' + encodeURIComponent(key), session)),
    proof: (session, txId) => optional(request<LedgerProof>('/ledger-proof/' + encodeURIComponent(txId), session)),
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
