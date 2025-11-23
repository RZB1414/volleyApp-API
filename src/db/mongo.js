import { MongoClient } from 'mongodb';

let client;
let database;
let downloadTokensCollection;
let usersCollection;

export async function connectMongo() {
  if (database) {
    return database;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI must be provided');
  }

  client = new MongoClient(uri, {
    maxPoolSize: Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE ?? '10', 10)
  });

  await client.connect();

  const dbName = process.env.MONGODB_DB_NAME;
  if (!dbName) {
    throw new Error('MONGODB_DB_NAME must be provided');
  }

  database = client.db(dbName);
  downloadTokensCollection = database.collection('downloadTokens');
  usersCollection = database.collection('users');

  await Promise.all([
    downloadTokensCollection.createIndex({ token: 1 }, { unique: true }),
    downloadTokensCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    usersCollection.createIndex({ email: 1 }, { unique: true })
  ]);

  console.log('MONGO CONNECTED');

  return database;
}

export function getDownloadTokensCollection() {
  if (!downloadTokensCollection) {
    throw new Error('Database connection has not been initialised');
  }

  return downloadTokensCollection;
}

export function getUsersCollection() {
  if (!usersCollection) {
    throw new Error('Database connection has not been initialised');
  }

  return usersCollection;
}

export async function disconnectMongo() {
  if (client) {
    await client.close();
    client = undefined;
    database = undefined;
    downloadTokensCollection = undefined;
    usersCollection = undefined;
  }
}
