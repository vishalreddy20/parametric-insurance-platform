import { status as grpcStatus, credentials, Client } from '@grpc/grpc-js';
import { CommitError, EndorseError, StatusCode, connect, signers } from '@hyperledger/fabric-gateway';
import type { Gateway, Network } from '@hyperledger/fabric-gateway';
import { createPrivateKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ledgerFailure, retry } from './errors.js';

export type LedgerIdentity = {
  mspId: string;
  certificate: string;
  privateKey: string;
  tlsCertificate: string;
  endpoint: string;
  tlsHost: string;
};

export type Options = { arguments?: string[]; transientData?: Record<string, Uint8Array> };
export type TxResult<T = unknown> = { result: T; txId: string; blockNumber: string };
export type Query = <T = unknown>(actor: string, name: string, args?: string[]) => Promise<T>;
export interface Ledger {
  evaluate: Query;
  submit<T = unknown>(actor: string, name: string, options?: Options): Promise<TxResult<T>>;
}

const decoder = new TextDecoder();
const deadline = (ms: number) => () => ({ deadline: Date.now() + ms });

export function retryableLedgerError(error: unknown): boolean {
  if (!['ERR_LEDGER_UNAVAILABLE', 'ERR_COMMIT_UNKNOWN'].includes(ledgerFailure(error).code)) return false;
  return (error instanceof CommitError && error.code === StatusCode.MVCC_READ_CONFLICT) ||
    (error instanceof EndorseError && error.code === grpcStatus.DEADLINE_EXCEEDED);
}

export class FabricLedger implements Ledger {
  private readonly peers = new Map<string, { gateway: Gateway; client: Client }>();
  private mvccRetries = 0;

  private constructor(private readonly channel: string, readonly chaincode: string) {}

  static async open(identities: Record<string, LedgerIdentity>, channel: string, chaincode: string, evaluateTimeoutMs = 6000) {
    const ledger = new FabricLedger(channel, chaincode);
    try {
      for (const [name, identity] of Object.entries(identities)) {
        const [cert, key, ca] = await Promise.all([
          readFile(identity.certificate), readFile(identity.privateKey), readFile(identity.tlsCertificate),
        ]);
        const client = new Client(identity.endpoint, credentials.createSsl(ca), {
          'grpc.ssl_target_name_override': identity.tlsHost,
          'grpc.default_authority': identity.tlsHost,
        });
        try {
          const gateway = connect({
            client,
            identity: { mspId: identity.mspId, credentials: cert },
            signer: signers.newPrivateKeySigner(createPrivateKey(key)),
            evaluateOptions: deadline(evaluateTimeoutMs),
            endorseOptions: deadline(12000),
            submitOptions: deadline(8000),
            commitStatusOptions: deadline(15000),
          });
          ledger.peers.set(name, { gateway, client });
        } catch (error) {
          client.close();
          throw error;
        }
      }
      return ledger;
    } catch (error) {
      ledger.close();
      throw error;
    }
  }

  network(actor: string): Network {
    const peer = this.peers.get(actor);
    if (!peer) throw new Error('Ledger identity is missing.');
    return peer.gateway.getNetwork(this.channel);
  }

  async evaluate<T>(actor: string, name: string, args?: string[]): Promise<T> {
    try {
      const result = await this.network(actor).getContract(this.chaincode).evaluate(name, { arguments: args });
      return JSON.parse(decoder.decode(result)) as T;
    } catch (error) {
      throw ledgerFailure(error);
    }
  }

  async submit<T>(actor: string, name: string, options?: Options): Promise<TxResult<T>> {
    try {
      return await retry(async () => {
        const proposal = this.network(actor).getContract(this.chaincode).newProposal(name, options);
        const started = performance.now();
        const endorsed = await proposal.endorse();
        const endorsementMs = performance.now() - started;
        const submitted = await endorsed.submit();
        const submitMs = performance.now() - started - endorsementMs;
        const commitStarted = performance.now();
        const commit = await submitted.getStatus();
        const commitMs = performance.now() - commitStarted;
        if (process.env.PARASHIELD_PROFILE === '1' && /^(TriggerContract:ProcessEventForPolicy|PayoutContract:RecordSettlement)$/.test(name)) {
          let identifiers: { eventKey?: string; payoutId?: string } = {};
          try {
            const { eventKey, id: payoutId } = JSON.parse(decoder.decode(submitted.getResult()));
            identifiers = { eventKey, payoutId };
          } catch {
            // Profiling must not hide a failed validation status or change its retry behavior.
          }
          console.log(JSON.stringify({ action: 'payout_timing', operation: name, ...identifiers,
            endorsementMs, submitMs, commitMs, valid: commit.successful }));

        }
        if (!commit.successful) throw new CommitError(commit);
        return {
          result: JSON.parse(decoder.decode(submitted.getResult())) as T,
          txId: commit.transactionId,
          blockNumber: String(commit.blockNumber),
        };
      }, retryableLedgerError, (error) => {
        if (error instanceof CommitError && error.code === StatusCode.MVCC_READ_CONFLICT) this.mvccRetries++;
      });
    } catch (error) {
      throw ledgerFailure(error);
    }
  }

  metrics() { return { mvccRetries: this.mvccRetries }; }

  close() {
    for (const { gateway, client } of this.peers.values()) {
      gateway.close();
      client.close();
    }
    this.peers.clear();
  }
}
