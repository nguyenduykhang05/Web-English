import mongoose, { type ClientSession } from 'mongoose';

let warnedStandalone = false;

export async function connectMongo(uri: string) {
  await mongoose.connect(uri);
  if (mongoose.connection.readyState === 1) {
    console.log('MongoDB connected');
  }
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}

function isStandaloneTxError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const meta = err as { code?: number; message?: string };
  return (
    meta.code === 20 ||
    (typeof meta.message === 'string' &&
      meta.message.includes('Transaction numbers are only allowed on a replica set'))
  );
}

function isTransientTxError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const meta = err as {
    code?: number;
    errorLabels?: string[];
    hasErrorLabel?: (label: string) => boolean;
  };
  if (meta.code === 112) return true;
  if (Array.isArray(meta.errorLabels) && meta.errorLabels.includes('TransientTransactionError')) {
    return true;
  }
  if (typeof meta.hasErrorLabel === 'function' && meta.hasErrorLabel('TransientTransactionError')) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes work inside a MongoDB multi-document ACID transaction when running on a replica set.
 * Retries transient WriteConflict / TransientTransactionError aborts with bounded backoff.
 * Falls back cleanly only when connected to a standalone local mongod without replSet enabled.
 */
export async function withTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const session = await mongoose.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } catch (err) {
      if (isStandaloneTxError(err)) {
        if (!warnedStandalone) {
          warnedStandalone = true;
          console.warn(
            'MongoDB is running standalone without replica set; executing fallback without multi-doc transaction.',
          );
        }
        return work(null);
      }
      if (isTransientTxError(err) && attempt < maxAttempts) {
        await sleep(15 + Math.floor(Math.random() * 35) * attempt);
        continue;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  throw new Error('Transaction failed after maximum transient conflict retries');
}
