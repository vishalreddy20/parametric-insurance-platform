import { createHash, createHmac, randomUUID } from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { DemoAuth, requireRole } from './auth.js';
import type { Principal } from './auth.js';
import { ApiError } from './errors.js';
import type { Ledger } from './ledger.js';
import * as schema from './schema.js';

type Context = {
  ledger: Ledger;
  auth: DemoAuth;
  saltKey: Uint8Array;
  readinessActor: string;
  settlementEnabled: boolean;
  simulatePremium?: (payment: { reference: string; policyId: string; term: number; amountPaise: number }) => Promise<unknown>;
  corsOrigin?: string;
  findProof?: (txId: string) => Promise<unknown>;
  loadBenchmark?: () => Promise<unknown>;
  runSimulation?: (authorization: string, body: unknown) => Promise<unknown>;
  log?: (fields: Record<string, unknown>) => void;
};
type PolicyOwner = { terms?: { workerId: string; premiumPaise: number }; term?: number; status?: string };

function parse<T>(validator: ZodType<T>, value: unknown): T {
  const result = validator.safeParse(value);
  if (!result.success) throw new ApiError('ERR_VALIDATION', 400, 'The request did not match the expected schema.');
  return result.data;
}

function protect(auth: DemoAuth, roles: schema.Role[],
  handler: (request: Request, response: Response, user: Principal) => Promise<unknown>): RequestHandler {
  return async (request, response) => {
    const principal = await auth.authenticate(request.get('authorization'));
    requireRole(principal, roles);
    await handler(request, response, principal);
  };
}

function enforceWorker(user: Principal, policyId: string, workerId?: string) {
  if (user.role === 'worker' && (policyId !== user.policyId || (workerId && workerId !== user.workerId))) {
    throw new ApiError('ERR_UNAUTHORIZED', 403, 'This identity cannot access the policy.');
  }
}

export function createApp({ ledger, auth, saltKey, readinessActor, settlementEnabled, simulatePremium, corsOrigin, findProof, loadBenchmark, runSimulation, log = () => {} }: Context) {
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.set({ 'X-Request-Id': requestId, 'Cache-Control': 'no-store' });
    const start = process.hrtime.bigint();
    response.once('finish', () => log({
      requestId, method: request.method, status: response.statusCode,
      durationMs: Number(process.hrtime.bigint() - start) / 1e6,
    }));
    if (corsOrigin && request.get('origin') === corsOrigin) {
      response.set({
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Expose-Headers': 'X-Request-Id',
        'Vary': 'Origin',
      });
      if (request.method === 'OPTIONS') { response.sendStatus(204); return; }
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_request, response) => { response.json({ status: 'ok' }); });
  app.get('/ready', async (_request, response) => {
    await ledger.evaluate(readinessActor, 'ConfigContract:GetConfig');
    response.json({ status: 'ready', settlementEnabled });
  });
  app.post('/v1/login', async (request, response) => {
    const body = parse(schema.login, request.body);
    response.json(await auth.login(body.username, body.accessCode));
  });

  app.get('/v1/session', protect(auth, [...schema.roles], async (_request, response, user) => {
    response.json({ role: user.role, policyId: user.policyId, workerId: user.workerId, simulated: true });
  }));

  app.post('/v1/policies', protect(auth, ['worker', 'platform'], async (request, response, user) => {
    const { worker, policyId, ...terms } = parse(schema.enroll, request.body);
    enforceWorker(user, policyId, terms.workerId);
    const salt = createHmac('sha256', saltKey).update('workerPII\0').update(policyId).digest('hex');
    response.status(201).json(await ledger.submit(user.actor, 'PolicyContract:CreatePolicy', {
      arguments: [policyId],
      transientData: {
        workerPII: Buffer.from(JSON.stringify({ ...worker, salt })),
        policyTerms: Buffer.from(JSON.stringify({ ...terms, platform: user.platformId })),
      },
    }));
  }));
  app.post('/v1/policies/:id/premium-simulation', protect(auth, ['worker', 'platform'], async (request, response, user) => {
    if (!simulatePremium) throw new ApiError('ERR_MOCK_UPI', 503, 'Simulated premium processing is unavailable.');
    const id = parse(schema.id, request.params.id);
    enforceWorker(user, id);
    const policy = await ledger.evaluate<PolicyOwner>(user.actor, 'PolicyContract:GetPolicy', [id]);
    enforceWorker(user, id, policy.terms?.workerId);
    if (!policy.terms || !policy.term || !['PENDING_PREMIUM', 'ACTIVE'].includes(policy.status ?? '')) {
      throw new ApiError('ERR_STATE', 409, 'The policy term cannot accept a simulated payment.');
    }
    const reference = 'pre-' + createHash('sha256').update(id + ':' + policy.term).digest('hex').slice(0, 60);
    response.json(await simulatePremium({ reference, policyId: id, term: policy.term, amountPaise: policy.terms.premiumPaise }));
  }));
  app.post('/v1/callbacks/premium', protect(auth, ['bank'], async (request, response, user) => {
    const body = parse(schema.premium, request.body);
    response.json(await ledger.submit(user.actor, 'PolicyContract:RecordPremiumPaid', {
      arguments: [body.policyId, String(body.term), String(body.amountPaise), body.reference, body.requestId],
    }));
  }));
  app.post('/v1/callbacks/settlement', protect(auth, ['bank'], async (request, response, user) => {
    const body = parse(schema.settlement, request.body);
    response.json(await ledger.submit(user.actor, 'PayoutContract:RecordSettlement', {
      arguments: [body.payoutId, body.status, body.reference, body.requestId],
    }));
  }));
  app.post('/v1/activity', protect(auth, ['platform'], async (request, response, user) => {
    const { requestId, ...activity } = parse(schema.activity, request.body);
    if (activity.platformId !== user.platformId) throw new ApiError('ERR_UNAUTHORIZED', 403, 'Platform identity mismatch.');
    response.json(await ledger.submit(user.actor, 'ActivityContract:RecordActivityAttestation', {
      arguments: [JSON.stringify(activity), requestId],
    }));
  }));
  app.post('/v1/readings', protect(auth, ['oracle'], async (request, response, user) => {
    const body = parse(schema.observation, request.body);
    response.json(await ledger.submit(user.actor, 'OracleQuorumContract:SubmitReading', {
      arguments: [JSON.stringify(body)],
    }));
  }));

  const policyReaders: schema.Role[] = ['worker', 'platform', 'insurer', 'bank', 'regulator'];
  app.get('/v1/policies/:id', protect(auth, policyReaders, async (request, response, user) => {
    const id = parse(schema.id, request.params.id);
    enforceWorker(user, id);
    const policy = await ledger.evaluate<PolicyOwner>(user.actor, 'PolicyContract:GetPolicy', [id]);
    enforceWorker(user, id, policy.terms?.workerId);
    response.json(policy);
  }));
  const policyPayouts = protect(auth, policyReaders, async (request, response, user) => {
    const id = parse(schema.id, request.params.id);
    enforceWorker(user, id);
    if (user.role === 'worker') {
      const policy = await ledger.evaluate<PolicyOwner>(user.actor, 'PolicyContract:GetPolicy', [id]);
      enforceWorker(user, id, policy.terms?.workerId);
    }
    const page = parse(schema.page, request.query);
    response.json(await ledger.evaluate(user.actor, 'PayoutContract:ListPayouts', [id, String(page.size), page.bookmark]));
  });
  app.get('/v1/policies/:id/payouts', policyPayouts);
  app.get('/v1/policies/:id/claims', policyPayouts);
  app.get('/v1/events/detail', protect(auth, [...policyReaders, 'oracle'], async (request, response, user) => {
    const key = parse(schema.eventKey, request.query.key);
    response.json(await ledger.evaluate(user.actor, 'OracleQuorumContract:GetEvent', [key]));
  }));
  app.get('/v1/ledger-proof/:id', protect(auth, policyReaders, async (request, response) => {
    const txId = parse(schema.payoutID, request.params.id);
    const proof = await findProof?.(txId);
    if (!proof) throw new ApiError('ERR_NOT_FOUND', 404, 'Ledger proof has not reached the event index.');
    response.json(proof);
  }));
  app.get('/v1/benchmarks/latest', protect(auth, ['insurer', 'regulator'], async (_request, response) => {
    response.json({ run: await loadBenchmark?.() ?? null });
  }));
  app.post('/v1/simulations', protect(auth, ['insurer'], async (request, response) => {
    if (!runSimulation) throw new ApiError('ERR_ORACLE_UNAVAILABLE', 503, 'The simulated oracle service is unavailable.');
    const input = parse(schema.simulation, request.body);
    response.json(await runSimulation(request.get('authorization')!, input));
  }));
  app.get('/v1/events/:zone', protect(auth, [...policyReaders, 'oracle'], async (request, response, user) => {
    const zone = parse(schema.zone, request.params.zone);
    const page = parse(schema.page, request.query);
    response.json(await ledger.evaluate(user.actor, 'OracleQuorumContract:ListEvents', [zone, String(page.size), page.bookmark]));
  }));
  app.get('/v1/summary/:zone', protect(auth, ['insurer', 'regulator'], async (request, response, user) => {
    const zone = parse(schema.zone, request.params.zone);
    const page = parse(schema.policyList, request.query);
    response.json(await ledger.evaluate(user.actor, 'PolicyContract:ListPoliciesByZone', [zone, page.status, String(page.size), page.bookmark]));
  }));
  app.get('/v1/reconciliation/:zone', protect(auth, ['regulator'], async (request, response, user) => {
    const zone = parse(schema.zone, request.params.zone);
    const page = parse(schema.reconciliation, request.query);
    response.json(await ledger.evaluate(user.actor, 'AuditContract:Reconcile', [page.week, zone, String(page.size), page.bookmark]));
  }));
  app.get('/v1/config', protect(auth, ['insurer', 'regulator'], async (_request, response, user) => {
    response.json(await ledger.evaluate(user.actor, 'ConfigContract:GetConfig'));
  }));
  app.put('/v1/config', protect(auth, ['insurer'], async (request, response, user) => {
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
