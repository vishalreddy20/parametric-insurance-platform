import { seedDemoData, Users, Policies, Payouts, Claims, dbGet, dbSet } from '../services/mock-db';
import { DataError, zones } from './provider';
import type { DataProvider, Policy, Session, Zone } from './provider';

const demoWorker = 'demo_user_1';
const localKey = (id?: string) => 'parashield_demo_policy_' + id;
const seconds = (iso: string | null) => iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined;

async function policy(session: Session): Promise<Policy | null> {
  const local = dbGet<Policy>(localKey(session.policyId));
  if (local) return local;
  const id = session.workerId ?? demoWorker;
  const worker = Users.get(id);
  const record = Policies.getByUser(id)[0];
  const city = worker?.city.toLowerCase() as Zone;
  if (!worker || !record || !zones.includes(city)) return null;
  return {
    id: record.policyId, terms: {
      workerId: id, zone: city, platform: worker.platform, tier: record.tier,
      weeklyIncomePaise: Math.round(worker.weeklyIncome * 100), weeklyMinutes: Math.round(worker.weeklyHours * 60),
      premiumPaise: Math.round(record.weeklyPremium * 100),
    },
    status: record.status === 'active' ? 'ACTIVE' : record.status === 'expired' ? 'EXPIRED' : 'CANCELLED',
    term: 1, startsAt: seconds(record.startDate), endsAt: seconds(record.renewalDate),
  };
}

export const demoProvider: DataProvider = {
  mode: 'demo',
  async signIn() {
    seedDemoData();
    return { role: 'worker', token: '', policyId: demoWorker, workerId: demoWorker, platformId: 'zomato' };
  },
  policy,
  async enroll(session, input) {
    const existing = await policy(session);
    if (existing) return existing;
    const { worker: _worker, ...terms } = input;
    const record: Policy = { id: session.policyId!, term: 1, status: 'PENDING_PREMIUM',
      terms: { ...terms, workerId: session.workerId!, platform: session.platformId! } };
    dbSet(localKey(session.policyId), record);
    return record;
  },
  async payPremium(session) {
    const record = await policy(session);
    if (!record) throw new DataError('ERR_NOT_FOUND', 'Enroll in a policy first.');
    if (record.status === 'PENDING_PREMIUM') {
      const startsAt = Math.floor(Date.now() / 1000);
      dbSet(localKey(session.policyId), { ...record, startsAt, endsAt: startsAt + 604800, status: 'ACTIVE' });
    }
    return { status: 'PAID', callbackStatus: 'DELIVERED' };
  },
  async payouts(session) {
    return Payouts.getByUser(session.workerId ?? demoWorker).map((item) => {
      const claim = Claims.get(item.claimId);
      return { id: item.payoutId, eventKey: claim?.disruptionType ?? 'local demo fixture', amountPaise: Math.round(item.amount * 100),
        status: item.status === 'completed' ? 'SETTLED' : item.status === 'failed' ? 'FAILED' : 'RESERVED',
        reservedAt: seconds(item.createdAt) ?? 0, finalizedAt: seconds(item.completedAt), reference: item.razorpayId };
    });
  },
  async events() { return []; },
  async event() { return null; },
  async proof() { return null; },
  async policies() { return []; },
  async benchmark() { return null; },
  async reconciliation() { return null; },
  async simulate() { throw new DataError('ERR_DEMO', 'Use ledger mode to submit oracle readings.'); },
};
