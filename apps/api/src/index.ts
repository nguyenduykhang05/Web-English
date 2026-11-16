import { createServer } from 'http';
import { env } from './config/env.js';
import { connectMongo, disconnectMongo } from './config/db.js';
import { createApp } from './app.js';
import { startBackgroundJobs } from './jobs/sessionJobs.js';
import { attachSocketServer } from './realtime/socket.js';

async function main() {
  await connectMongo(env.MONGODB_URI);

  const app = createApp();
  const httpServer = createServer(app);
  attachSocketServer(httpServer);
  const cronTask = startBackgroundJobs();

  httpServer.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    cronTask.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
