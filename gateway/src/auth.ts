import { createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { ApiError } from './errors.js';
import { id, roles, type Role } from './schema.js';

export const principalSchema = z.strictObject({
  username: id,
  role: z.enum(roles),
  actor: id,
  accessCode: z.string().min(16).max(256),
  platformId: z.enum(['zomato', 'swiggy']).optional(),
  workerId: id.optional(),
  policyId: id.optional(),
}).superRefine((principal, ctx) => {
  if ((principal.role === 'worker' || principal.role === 'platform') && !principal.platformId) {
    ctx.addIssue({ code: 'custom', message: 'Platform context is required.' });
  }
  if (principal.role === 'worker' && (!principal.workerId || !principal.policyId)) {
    ctx.addIssue({ code: 'custom', message: 'Worker and policy IDs are required.' });
  }
});
type Credential = z.infer<typeof principalSchema>;
export type Principal = Omit<Credential, 'accessCode'>;

const issuer = 'parashield-demo';
const audience = 'parashield-gateway';
const invalidSession = () => new ApiError('ERR_AUTHENTICATION', 401, 'Sign in with a valid simulated identity.');
const hash = (value: string) => createHash('sha256').update(value).digest();

export class DemoAuth {
  private readonly accounts: Map<string, Credential>;

  constructor(principals: Credential[], private readonly key: Uint8Array) {
    this.accounts = new Map(principals.map((principal) => [principal.username, principal]));
    if (this.accounts.size !== principals.length) throw new Error('Duplicate demo identity.');
  }

  async login(username: string, code: string, serviceOnly = false) {
    const principal = this.accounts.get(username);
    const match = timingSafeEqual(hash(code), hash(principal?.accessCode ?? 'invalid-credential'));
    if (!match || !principal || (serviceOnly && principal.role !== 'bank' && principal.role !== 'oracle')) throw invalidSession();
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuer).setAudience(audience).setSubject(username).setIssuedAt().setExpirationTime('1h').sign(this.key);
    return { token, role: principal.role, policyId: principal.policyId, workerId: principal.workerId,
      platformId: principal.platformId, simulated: true };
  }

  async authenticate(authorization: string | undefined, serviceOnly = false): Promise<Principal> {
    if (!authorization?.startsWith('Bearer ') || authorization.length > 4096) throw invalidSession();
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.key, { issuer, audience, algorithms: ['HS256'] });
      const principal = payload.sub && this.accounts.get(payload.sub);
      if (principal && (!serviceOnly || principal.role === 'bank' || principal.role === 'oracle')) return principal;
    } catch {
      throw invalidSession();
    }
    throw invalidSession();
  }
}

export function requireRole(user: Principal, allowed: Role[]): void {
  if (!allowed.includes(user.role)) throw new ApiError('ERR_UNAUTHORIZED', 403, 'This role cannot perform the operation.');
}
