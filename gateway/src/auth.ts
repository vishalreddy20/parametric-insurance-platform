import { createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { ApiError } from './errors.js';
import { id, type Role } from './schema.js';

export const serviceCredentialSchema = z.strictObject({
  username: id,
  role: z.enum(['bank', 'oracle']),
  actor: id,
  accessCode: z.string().min(16).max(256),
});
type Credential = z.infer<typeof serviceCredentialSchema>;

export type Principal = {
  username: string;
  role: Role;
  actor: string;
  platformId?: 'zomato' | 'swiggy';
  workerId?: string;
  policyId?: string;
};

export interface ServiceAuthentication {
  login(username: string, code: string): Promise<{ token: string; role: Role }>;
  authenticate(authorization: string | undefined): Promise<Principal>;
}

const issuer = 'parashield-services';
const audience = 'parashield-gateway';
const invalidSession = () => new ApiError('ERR_AUTHENTICATION', 401, 'A valid service credential is required.');
const hash = (value: string) => createHash('sha256').update(value).digest();

export class ServiceAuth implements ServiceAuthentication {
  private readonly accounts: Map<string, Credential>;

  constructor(services: Credential[], private readonly key: Uint8Array) {
    this.accounts = new Map(services.map((service) => [service.username, service]));
    if (this.accounts.size !== services.length) throw new Error('Duplicate service identity.');
  }

  async login(username: string, code: string) {
    const service = this.accounts.get(username);
    const match = timingSafeEqual(hash(code), hash(service?.accessCode ?? 'invalid-credential'));
    if (!match || !service) throw invalidSession();
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuer).setAudience(audience).setSubject(username).setIssuedAt().setExpirationTime('1h').sign(this.key);
    return { token, role: service.role };
  }

  async authenticate(authorization: string | undefined): Promise<Principal> {
    if (!authorization?.startsWith('Bearer ') || authorization.length > 4096) throw invalidSession();
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.key, { issuer, audience, algorithms: ['HS256'] });
      const service = payload.sub && this.accounts.get(payload.sub);
      if (service) return { username: service.username, role: service.role, actor: service.actor };
    } catch {
      throw invalidSession();
    }
    throw invalidSession();
  }
}

export function requireRole(user: Principal, allowed: Role[]): void {
  if (!allowed.includes(user.role)) throw new ApiError('ERR_UNAUTHORIZED', 403, 'This role cannot perform the operation.');
}
