import type { Principal } from './auth.js';
import { ApiError } from './errors.js';

export type PolicyOwner = {
  terms?: { workerId: string; platform?: string; premiumPaise: number };
  term?: number;
  status?: string;
};

function denyPolicy(): never {
  throw new ApiError('ERR_UNAUTHORIZED', 403, 'This identity cannot access the policy.');
}

export function checkWorkerPolicy(user: Principal, policyId: string, workerId?: string): void {
  if (user.role === 'worker' && (policyId !== user.policyId || (workerId !== undefined && workerId !== user.workerId))) {
    denyPolicy();
  }
}

export function checkPolicyOwner(user: Principal, policyId: string, policy: PolicyOwner): void {
  checkWorkerPolicy(user, policyId, policy.terms?.workerId);
  if (user.role === 'worker' && (!policy.terms?.workerId || policy.terms.platform !== user.platformId)) {
    denyPolicy();
  }
  if (user.role === 'platform' && (!user.platformId || policy.terms?.platform !== user.platformId)) {
    denyPolicy();
  }
}
