import { createServer } from 'http';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function startE2EServer() {
  const apiPort = Number(process.env.E2E_API_PORT ?? 4010);
  const webUrl = process.env.E2E_WEB_URL ?? 'http://localhost:5175';

  process.env.NODE_ENV = 'test';
  process.env.PORT = String(apiPort);
  process.env.CORS_ORIGIN = webUrl;
  process.env.WEB_URL = webUrl;
  process.env.BASE_URL = `http://127.0.0.1:${apiPort}`;
  process.env.MAIL_PROVIDER = 'mock';
  process.env.PAYMENT_PROVIDER = 'manual_bank_transfer';
  process.env.STORAGE_PROVIDER = 'mock';
  process.env.AI_PROVIDER = 'mock';

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const mongoUri = replSet.getUri();
  process.env.MONGODB_URI = mongoUri;

  const { runSeed } = await import('../apps/api/src/seed/run.js');
  await runSeed(mongoUri);

  const { connectMongo, disconnectMongo } = await import('../apps/api/src/config/db.js');
  await connectMongo(mongoUri);

  const { Session } = await import('../apps/api/src/modules/sessions/models/session.model.js');
  const { Notification } = await import(
    '../apps/api/src/modules/notifications/models/notification.model.js'
  );
  const { TeacherProfile } = await import(
    '../apps/api/src/modules/teachers/models/teacherProfile.model.js'
  );
  const { StudentProfile } = await import(
    '../apps/api/src/modules/students/models/studentProfile.model.js'
  );
  await Promise.all([
    Session.ensureIndexes(),
    Notification.ensureIndexes(),
    TeacherProfile.ensureIndexes(),
    StudentProfile.ensureIndexes(),
  ]);

  const { createApp } = await import('../apps/api/src/app.js');
  const { attachSocketServer } = await import('../apps/api/src/realtime/socket.js');

  const app = createApp();
  const httpServer = createServer(app);
  attachSocketServer(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(apiPort, '127.0.0.1', resolve));
  console.log(`E2E API + MongoMemoryReplSet ready on http://127.0.0.1:${apiPort}`);

  const shutdown = async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await disconnectMongo();
    await replSet.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startE2EServer().catch((err) => {
  console.error('E2E server startup failed:', err);
  process.exit(1);
});
