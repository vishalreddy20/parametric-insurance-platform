import { createHash, createHmac, randomUUID } from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { requireRole, type Principal, type ServiceAuthentication } from './auth.js';
import type { AccountHttp } from './accounts/http.js';
import { ApiError } from './errors.js';
import type { Ledger } from './ledger.js';
import { checkPolicyOwner, checkWorkerPolicy, type PolicyOwner } from './policy.js';
import * as schema from './schema.js';

type Context = {
  ledger: Ledger;
  auth: ServiceAuthentication;
  accounts?: AccountHttp;
  saltKey: Uint8Array;
  readinessActor: string;
  checkCommitPeer?: () => Promise<void>;
  settlementEnabled: boolean;
  simulatePremium?: (payment: { reference: string; policyId: string; term: number; amountPaise: number }) => Promise<unknown>;
  corsOrigin?: string;
  findProof?: (txId: string) => Promise<unknown>;
  loadBenchmark?: () => Promise<unknown>;
  deploymentMetrics?: () => { mvccRetries: number };
  runSimulation?: (credentials: Record<string, string>, body: unknown) => Promise<unknown>;
  log?: (fields: Record<string, unknown>) => void;
};

function parse<T>(validator: ZodType<T>, value: unknown): T {
  const result = validator.safeParse(value);
  if (!result.success) throw new ApiError('ERR_VALIDATION', 400, 'The request did not match the expected schema.');
  return result.data;
}

function protect(auth: ServiceAuthentication, accounts: AccountHttp | undefined, roles: schema.Role[],
  handler: (request: Request, response: Response, user: Principal) => Promise<unknown>): RequestHandler {
  return async (request, response) => {
    const principal = await accounts?.principal(request) ?? await auth.authenticate(request.get('authorization'));
    requireRole(principal, roles);
    await handler(request, response, principal);
  };
}

export function createApp({ ledger, auth, accounts, saltKey, readinessActor, checkCommitPeer, settlementEnabled, simulatePremium, corsOrigin, findProof, loadBenchmark, deploymentMetrics, runSimulation, log = () => {} }: Context) {
  const app = express();
  const allow = (roles: schema.Role[], handler: Parameters<typeof protect>[3]) =>
    protect(auth, accounts, roles, handler);
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.set({
      'X-Request-Id': requestId, 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    });
    if (request.secure) response.set('Strict-Transport-Security', 'max-age=31536000');
    const start = process.hrtime.bigint();
    response.once('finish', () => log({
      requestId, method: request.method, status: response.statusCode,
      durationMs: Number(process.hrtime.bigint() - start) / 1e6,
    }));
    if (corsOrigin && request.get('origin') === corsOrigin) {
      response.set({
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token, Idempotency-Key',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Expose-Headers': 'X-Request-Id, Retry-After',
        'Vary': 'Origin',
      });
      if (request.method === 'OPTIONS') { response.sendStatus(204); return; }
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  accounts?.mount(app);
  app.get('/health', (_request, response) => { response.json({ status: 'ok' }); });
  app.get('/ready', async (_request, response) => {
    try {
      await Promise.all([ledger.evaluate(readinessActor, 'ConfigContract:GetConfig'), checkCommitPeer?.()]);
    } catch {
      throw new ApiError('ERR_LEDGER_NOT_READY', 503, 'The ledger read or commit path is unavailable.');
    }
    response.json({ status: 'ready', settlementEnabled });
  });
  app.post('/v1/service-token', async (request, response) => {
    const body = parse(schema.login, request.body);
    response.json(await auth.login(body.username, body.accessCode));
  });

  app.get('/v1/session', allow([...schema.roles], async (_request, response, user) => {
    response.json({ role: user.role, policyId: user.policyId, workerId: user.workerId });
  }));

  app.post('/v1/policies', allow(['worker', 'platform'], async (request, response, user) => {
    const { worker, policyId, ...terms } = parse(schema.enroll, request.body);
    checkWorkerPolicy(user, policyId, terms.workerId);
    const salt = createHmac('sha256', saltKey).update('workerPII\0').update(policyId).digest('hex');
    const committed = await ledger.submit(user.actor, 'PolicyContract:CreatePolicy', {
      arguments: [policyId],
      transientData: {
        workerPII: Buffer.from(JSON.stringify({ ...worker, salt })),
        policyTerms: Buffer.from(JSON.stringify({ ...terms, platform: user.platformId })),
      },
    });
    if (user.role === 'worker' && user.workerId) {
      await accounts?.recordEnrollment(user.workerId, committed.txId, committed.blockNumber);
    }
    response.status(201).json(committed);
  }));
  app.post('/v1/policies/:id/premium-simulation', allow(['worker', 'platform'], async (request, response, user) => {
    if (!simulatePremium) throw new ApiError('ERR_MOCK_UPI', 503, 'Simulated premium processing is unavailable.');
    const id = parse(schema.id, request.params.id);
    checkWorkerPolicy(user, id);
    const policy = await ledger.evaluate<PolicyOwner>(user.actor, 'PolicyContract:GetPolicy', [id]);
    checkPolicyOwner(user, id, policy);
    if (!policy.terms || !policy.term || !['PENDING_PREMIUM', 'ACTIVE'].includes(policy.status ?? '')) {
      throw new ApiError('ERR_STATE', 409, 'The policy term cannot accept a simulated payment.');
    }
    const reference = 'pre-' + createHash('sha256').update(id + ':' + policy.term).digest('hex').slice(0, 60);
    response.json(await simulatePremium({ reference, policyId: id, term: policy.term, amountPaise: policy.terms.premiumPaise }));
  }));
  app.post('/v1/callbacks/premium', allow(['bank'], async (request, response, user) => {
    const body = parse(schema.premium, request.body);
    response.json(await ledger.submit(user.actor, 'PolicyContract:RecordPremiumPaid', {
      arguments: [body.policyId, String(body.term), String(body.amountPaise), body.reference, body.requestId],
    }));
  }));
  app.post('/v1/callbacks/settlement', allow(['bank'], async (request, response, user) => {
    const body = parse(schema.settlement, request.body);
    response.json(await ledger.submit(user.actor, 'PayoutContract:RecordSettlement', {
      arguments: [body.payoutId, body.status, body.reference, body.requestId],
    }));
  }));
  app.post('/v1/activity', allow(['platform'], async (request, response, user) => {
    const { requestId, ...activity } = parse(schema.activity, request.body);
    if (activity.platformId !== user.platformId) throw new ApiError('ERR_UNAUTHORIZED', 403, 'Platform identity mismatch.');
    const policy = await ledger.evaluate<PolicyOwner>(user.actor, 'PolicyContract:GetPolicy', [activity.workerId]);
    checkPolicyOwner(user, activity.workerId, policy);
    if (policy.terms?.workerId !== activity.workerId) throw new ApiError('ERR_UNAUTHORIZED', 403, 'Worker identity mismatch.');
    response.json(await ledger.submit(user.actor, 'ActivityContract:RecordActivityAttestation', {
      arguments: [JSON.stringify(activity), requestId],
    }));
  }));
  app.post('/v1/readings', allow(['oracle'], async (request, response, user) => {
    const body = parse(schema.observation, request.body);
    response.json(await ledger.submit(user.actor, 'OracleQuorumContract:SubmitReading', {
      arguments: [JSON.stringify(body)],
    }));
  }));

  app.post('/v1/reading-window-close', allow(['oracle'], async (request, response, user) => {
    const { zone, windowStart } = parse(schema.demoWindow, request.body);
    response.json(await ledger.submit(user.actor, 'OracleQuorumContract:CloseDemoWindow', {
      arguments: [zone, String(windowStart)],
    }));
  }));

  const policyReaders: schema.Role[] = ['worker', 'platform', 'insurer', 'bank'];
  const eventReaders: schema.Role[] = [...policyReaders, 'regulator', 'oracle'];
  app.get('/v1/policies/:id', allow(policyReaders, async (request, response, user) => {
    const id = parse(schema.id, request.params.id);
    checkWorkerPolicy(user, id);
    const policy = await ledger.evaluate<PolicyOwner>(user.actor, 'PolicyContract:GetPolicy', [id]);
    checkPolicyOwner(user, id, policy);
    response.json(policy);
  }));
  app.get('/v1/policies/:id/coverage', allow(['worker'], async (request, response, user) => {
    const id = parse(schema.id, request.params.id);
    checkWorkerPolicy(user, id);
    const policy = await ledger.evaluate<PolicyOwner & {
      configVersion?: number; terms?: PolicyOwner['terms'] & { tier: 'basic' | 'standard' | 'premium' };
    }>(user.actor, 'PolicyContract:GetPolicy', [id]);
    checkPolicyOwner(user, id, policy);
    const config = await ledger.evaluate<{ version: number; basic: { cap: number }; standard: { cap: number }; premium: { cap: number } }>(
      user.actor, 'ConfigContract:GetConfig',
    );
    // The public contract exposes the current configuration. Older terms must not show its cap.
    const tier = policy.terms?.tier;
    response.json({ weeklyCapPaise: tier && (policy.configVersion ?? 0) === config.version ? config[tier].cap : null });
  }));
  const policyPayouts = allow(policyReaders, async (request, response, user) => {
    const id = parse(schema.id, request.params.id);
    checkWorkerPolicy(user, id);
    if (user.role === 'worker' || user.role === 'platform') {
      const policy = await ledger.evaluate<PolicyOwner>(user.actor, 'PolicyContract:GetPolicy', [id]);
      checkPolicyOwner(user, id, policy);
    }
    const page = parse(schema.page, request.query);
    response.json(await ledger.evaluate(user.actor, 'PayoutContract:ListPayouts', [id, String(page.size), page.bookmark]));
  });
  app.get('/v1/policies/:id/payouts', policyPayouts);
  app.get('/v1/policies/:id/claims', policyPayouts);
  app.get('/v1/payouts/:id', allow(['insurer'], async (request, response, user) => {
    const id = parse(schema.payoutID, request.params.id);
    response.json(await ledger.evaluate(user.actor, 'PayoutContract:GetPayout', [id]));
  }));
  app.get('/v1/events/detail', allow(eventReaders, async (request, response, user) => {
    const key = parse(schema.eventKey, request.query.key);
    response.json(await ledger.evaluate(user.actor, 'OracleQuorumContract:GetEvent', [key]));
  }));
  app.get('/v1/ledger-proof/:id', allow([...policyReaders, 'regulator'], async (request, response, user) => {
    const txId = parse(schema.payoutID, request.params.id);
    const { payoutId } = parse(schema.proofQuery, request.query);
    if (user.role === 'worker' || user.role === 'platform') {
      if (!payoutId) throw new ApiError('ERR_UNAUTHORIZED', 403, 'A payout is required to access this proof.');
      const payout = await ledger.evaluate<{ policyId: string; txId: string }>(user.actor, 'PayoutContract:GetPayout', [payoutId]);
      checkWorkerPolicy(user, payout.policyId);
      const policy = await ledger.evaluate<PolicyOwner>(user.actor, 'PolicyContract:GetPolicy', [payout.policyId]);
      checkPolicyOwner(user, payout.policyId, policy);
      if (payout.txId !== txId) throw new ApiError('ERR_UNAUTHORIZED', 403, 'This proof does not belong to the payout.');
    }
    const proof = await findProof?.(txId);
    if (!proof) throw new ApiError('ERR_NOT_FOUND', 404, 'Ledger proof has not reached the event index.');
    response.json(proof);
  }));
  app.get('/v1/metrics', allow(['insurer', 'regulator'], async (_request, response) => {
    response.json(deploymentMetrics?.() ?? { mvccRetries: 0 });
  }));
  app.get('/v1/benchmarks/latest', allow(['insurer', 'regulator'], async (_request, response) => {
    response.json({ run: await loadBenchmark?.() ?? null });
  }));
  app.post('/v1/simulations', allow(['insurer'], async (request, response) => {
    if (!runSimulation) throw new ApiError('ERR_ORACLE_UNAVAILABLE', 503, 'The simulated oracle service is unavailable.');
    const input = parse(schema.simulation, request.body);
    const accessCookie = request.get('cookie')?.match(/(?:^|;\s*)ps_access=[A-Za-z0-9_-]{43}(?=;|$)/)?.[0].replace(/^;\s*/, '');
    const credentials: Record<string, string> = accessCookie
      ? { Cookie: accessCookie }
      : { Authorization: request.get('authorization')! };
    response.json(await runSimulation(credentials, input));
  }));
  app.get('/v1/events/:zone', allow(eventReaders, async (request, response, user) => {
    const zone = parse(schema.zone, request.params.zone);
    const page = parse(schema.page, request.query);
    response.json(await ledger.evaluate(user.actor, 'OracleQuorumContract:ListEvents', [zone, String(page.size), page.bookmark]));
  }));
  app.get('/v1/summary/:zone', allow(['insurer'], async (request, response, user) => {
    const zone = parse(schema.zone, request.params.zone);
    const page = parse(schema.policyList, request.query);
    response.json(await ledger.evaluate(user.actor, 'PolicyContract:ListPoliciesByZone', [zone, page.status, String(page.size), page.bookmark]));
  }));
  app.get('/v1/reconciliation/:zone', allow(['regulator'], async (request, response, user) => {
    const zone = parse(schema.zone, request.params.zone);
    const page = parse(schema.reconciliation, request.query);
    response.json(await ledger.evaluate(user.actor, 'AuditContract:Reconcile', [page.week, zone, String(page.size), page.bookmark]));
  }));
  app.get('/v1/config', allow(['insurer', 'regulator'], async (_request, response, user) => {
    response.json(await ledger.evaluate(user.actor, 'ConfigContract:GetConfig'));
  }));
  app.put('/v1/config', allow(['insurer'], async (request, response, user) => {
    const { config, requestId } = parse(schema.configUpdate, request.body);
    response.json(await ledger.submit(user.actor, 'ConfigContract:SetConfig', { arguments: [JSON.stringify(config), requestId] }));
  }));
  app.use((_request, _response, next) => next(new ApiError('ERR_NOT_FOUND', 404, 'The endpoint does not exist.')));

  const handleError: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    const apiError = error instanceof ApiError ? error : ['entity.parse.failed', 'entity.too.large'].includes(error?.type)
      ? new ApiError('ERR_VALIDATION', error.type === 'entity.too.large' ? 413 : 400, 'Invalid request body.')
      : new ApiError('ERR_INTERNAL', 500, 'The operation could not be completed.');
    response.status(apiError.status).json({ code: apiError.code, message: apiError.message, requestId: response.locals.requestId });
  };
  app.use(handleError);
  return app;
}
