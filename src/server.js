import './config/env.js';

import app from './app.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

const server = app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}. Gracefully shutting down.`);

  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection', error);
});
