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
  private retries = 0;

  private constructor(private readonly channel: string, readonly chaincode: string) {}

  static async open(identities: Record<string, LedgerIdentity>, channel: string, chaincode: string) {
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
            evaluateOptions: deadline(6000),
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
        const submitted = await this.network(actor).getContract(this.chaincode).submitAsync(name, options);
        const commit = await submitted.getStatus();
        if (!commit.successful) throw new CommitError(commit);
        return {
          result: JSON.parse(decoder.decode(submitted.getResult())) as T,
          txId: commit.transactionId,
          blockNumber: String(commit.blockNumber),
        };
      }, retryableLedgerError, () => { this.retries++; });
    } catch (error) {
      throw ledgerFailure(error);
    }
  }

  retryCount() { return this.retries; }

  close() {
    for (const { gateway, client } of this.peers.values()) {
      gateway.close();
      client.close();
    }
    this.peers.clear();
  }
}
