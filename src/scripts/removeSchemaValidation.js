import dotenv from 'dotenv';
import { getDb, COLLECTIONS } from '../config/mongo.js';
import { connectToMongo, closeConnection } from '../config/mongo.js';

dotenv.config();

/**
 * Remueve la validación de esquema de la colección de noticias
 * Esto permite insertar documentos sin restricciones estrictas
 */
async function removeSchemaValidation() {
  try {
    await connectToMongo();
    const db = await getDb();
    const collection = db.collection(COLLECTIONS.NOTICIAS);

    console.log('🔧 Removiendo validación de esquema...\n');

    // Remover el validador de esquema
    await db.command({
      collMod: COLLECTIONS.NOTICIAS,
      validator: {}
    });

    console.log('✅ Validación de esquema removida exitosamente');
    console.log('   Ahora puedes insertar documentos sin restricciones estrictas\n');
  } catch (error) {
    if (error.code === 26) {
      console.log('ℹ️ La colección no existe aún. Se creará automáticamente al insertar el primer documento.');
    } else {
      console.error('❌ Error removiendo validación de esquema:', error.message);
    }
  } finally {
    await closeConnection();
  }
}

removeSchemaValidation();

