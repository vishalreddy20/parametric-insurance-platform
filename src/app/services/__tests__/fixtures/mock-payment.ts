/**
 * ZyroSafe Mock Payment Gateway
 * Simulates Razorpay/RazorpayX payment flows
 * Blueprint: "Financial Orchestration, Payout Automation, and Payment Gateways"
 */

import { generateId } from './mock-db';
import type { Payout } from './mock-db';

// ============= Types =============

export interface SubscriptionResult {
  subscriptionId: string;
  planId: string;
  status: 'created' | 'authenticated' | 'active';
  amount: number;
  currency: string;
  method: string;
  startDate: string;
  nextBillingDate: string;
  razorpaySubId: string;
}

export interface PaymentCheckout {
  orderId: string;
  amount: number;
  currency: string;
  status: 'created' | 'paid' | 'failed';
  method: 'upi' | 'card' | 'netbanking';
  upiId?: string;
  transactionId: string;
  receipt: PaymentReceipt;
}

export interface PaymentReceipt {
  receiptId: string;
  orderId: string;
  amount: number;
  tax: number;
  total: number;
  date: string;
  description: string;
  from: string;
  to: string;
}

// ============= Mock Razorpay Subscriptions API =============

export function createSubscription(
  userId: string,
  tier: string,
  weeklyPremium: number,
  method: 'upi' | 'card' = 'upi',
  upiId: string = 'user@paytm'
): SubscriptionResult {
  const subscriptionId = generateId('sub');
  const nextBilling = new Date();
  nextBilling.setDate(nextBilling.getDate() + 7);

  return {
    subscriptionId,
    planId: `plan_zyrosafe_${tier}`,
    status: 'active',
    amount: weeklyPremium,
    currency: 'INR',
    method: method === 'upi' ? `UPI (${upiId})` : 'Card (****4242)',
    startDate: new Date().toISOString(),
    nextBillingDate: nextBilling.toISOString(),
    razorpaySubId: `sub_${generateId()}`,
  };
}

// ============= Mock RazorpayX Instant Payout =============

export function executeInstantPayout(
  userId: string,
  amount: number,
  claimId: string
): Payout {
  const payoutId = generateId('pay');
  const idempotencyKey = generateId('idem');

  return {
    payoutId,
    transactionId: `txn_${generateId()}`,
    claimId,
    userId,
    amount,
    method: 'upi',
    status: 'completed',
    razorpayId: `pout_${generateId()}`,
    idempotencyKey,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

// ============= Mock Payment Checkout Flow =============

export function createPaymentCheckout(
  amount: number,
  description: string,
  method: 'upi' | 'card' | 'netbanking' = 'upi',
  upiId: string = 'user@paytm'
): PaymentCheckout {
  const orderId = `order_${generateId()}`;
  const transactionId = `txn_${generateId()}`;
  const tax = Math.round(amount * 0.18); // GST 18%

  return {
    orderId,
    amount,
    currency: 'INR',
    status: 'paid',
    method,
    upiId: method === 'upi' ? upiId : undefined,
    transactionId,
    receipt: {
      receiptId: `rcpt_${generateId()}`,
      orderId,
      amount,
      tax,
      total: amount + tax,
      date: new Date().toISOString(),
      description,
      from: 'ZyroSafe Insurance Ltd.',
      to: 'Delivery Partner',
    },
  };
}

// ============= Webhook Event Simulation =============

export type WebhookEvent =
  | 'subscription.charged'
  | 'payment.captured'
  | 'payout.initiated'
  | 'payout.processed'
  | 'payout.downtime.started'
  | 'payout.downtime.resolved';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  payload: any;
}

export function simulateWebhookSequence(amount: number, userId: string): WebhookPayload[] {
  const now = Date.now();
  return [
    {
      event: 'payout.initiated',
      timestamp: new Date(now).toISOString(),
      payload: { amount, userId, status: 'processing', bankPartner: 'HDFC Bank' },
    },
    {
      event: 'payout.processed',
      timestamp: new Date(now + 2000).toISOString(),
      payload: { amount, userId, status: 'completed', utr: `UTR${generateId()}`, beneficiaryAccount: '****5678' },
    },
  ];
}

// ============= Transaction History =============

export function formatTransactionForDisplay(payout: Payout): {
  id: string;
  type: string;
  amount: string;
  status: string;
  statusColor: string;
  method: string;
  date: string;
  razorpayId: string;
} {
  return {
    id: payout.transactionId,
    type: 'Disruption Payout',
    amount: `₹${payout.amount.toLocaleString('en-IN')}`,
    status: payout.status === 'completed' ? 'Completed' : payout.status === 'processing' ? 'Processing' : 'Failed',
    statusColor: payout.status === 'completed' ? 'success' : payout.status === 'processing' ? 'warning' : 'danger',
    method: payout.method === 'upi' ? '🏦 UPI Instant' : '🏛️ Bank Transfer',
    date: new Date(payout.createdAt).toLocaleString('en-IN'),
    razorpayId: payout.razorpayId,
  };
}
