import './config/env.js';

import app from './app.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

let server;

async function bootstrap() {
  try {
    await connectMongo();
    server = app.listen(PORT, () => {
      console.log(`API listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

bootstrap();

async function shutdown(signal) {
  console.log(`Received ${signal}. Gracefully shutting down.`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await disconnectMongo();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection', error);
});
