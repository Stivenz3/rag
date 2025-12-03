import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'rag_noticias';

if (!uri) {
  throw new Error('MONGODB_URI no está definida en las variables de entorno');
}

let client = null;
let db = null;

export async function connectToMongo() {
  try {
    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
      db = client.db(dbName);
      console.log('✅ Conectado a MongoDB Atlas correctamente');
    }
    return { client, db };
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    throw error;
  }
}

export async function getDb() {
  if (!db) {
    await connectToMongo();
  }
  return db;
}

export async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('🔌 Conexión a MongoDB cerrada');
  }
}

// Colecciones
export const COLLECTIONS = {
  NOTICIAS: 'noticias',
  EMBEDDINGS: 'embeddings',
  IMAGE_EMBEDDINGS: 'image_embeddings'
};

