import dotenv from 'dotenv';
import { getDb, COLLECTIONS } from '../config/mongo.js';
import { connectToMongo, closeConnection } from '../config/mongo.js';

dotenv.config();

/**
 * Valida y limpia embeddings con dimensiones incorrectas
 */
async function validateEmbeddings() {
  try {
    await connectToMongo();
    const db = await getDb();
    const embeddingsCollection = db.collection(COLLECTIONS.EMBEDDINGS);

    console.log('🔍 Validando embeddings...\n');

    const allEmbeddings = await embeddingsCollection.find({}).toArray();
    console.log(`📊 Total de embeddings: ${allEmbeddings.length}`);

    const expectedDim = 384;
    let valid = 0;
    let invalid = 0;
    const invalidIds = [];

    for (const doc of allEmbeddings) {
      const embedding = doc.embedding;
      
      if (!Array.isArray(embedding)) {
        console.log(`❌ Doc ${doc._id}: embedding no es un array`);
        invalid++;
        invalidIds.push(doc._id);
        continue;
      }

      if (embedding.length !== expectedDim) {
        console.log(`❌ Doc ${doc._id}: dimensión ${embedding.length}, esperado ${expectedDim}`);
        invalid++;
        invalidIds.push(doc._id);
        continue;
      }

      valid++;
    }

    console.log(`\n✅ Embeddings válidos: ${valid}`);
    console.log(`❌ Embeddings inválidos: ${invalid}`);

    if (invalid > 0) {
      console.log(`\n⚠️ Se encontraron ${invalid} embeddings inválidos.`);
      console.log('   Opciones:');
      console.log('   1. Eliminar embeddings inválidos (recomendado)');
      console.log('   2. Regenerar embeddings inválidos');
      
      // Opción: eliminar inválidos
      if (invalidIds.length > 0) {
        const result = await embeddingsCollection.deleteMany({
          _id: { $in: invalidIds }
        });
        console.log(`\n🗑️ Eliminados ${result.deletedCount} embeddings inválidos`);
        console.log('   Ejecuta "npm run generate-embeddings" para regenerarlos');
      }
    } else {
      console.log('\n✅ Todos los embeddings son válidos');
    }

  } catch (error) {
    console.error('❌ Error validando embeddings:', error.message);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

validateEmbeddings();

