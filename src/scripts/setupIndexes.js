import dotenv from 'dotenv';
import { getDb, COLLECTIONS } from '../config/mongo.js';
import { connectToMongo, closeConnection } from '../config/mongo.js';

dotenv.config();

async function setupIndexes() {
  try {
    await connectToMongo();
    const db = await getDb();

    console.log('🔧 Configurando índices...\n');

    // Índice compuesto en noticias: fecha + idioma
    const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
    await newsCollection.createIndex({ fecha: 1, idioma: 1 });
    console.log('✅ Índice compuesto creado: { fecha: 1, idioma: 1 }');

    // Índice de texto en contenido_texto
    await newsCollection.createIndex({ contenido_texto: 'text', titulo: 'text' });
    console.log('✅ Índice de texto creado en contenido_texto y titulo');

    // Índice en idioma
    await newsCollection.createIndex({ idioma: 1 });
    console.log('✅ Índice creado en idioma');

    // Índice en id_doc para embeddings (para búsquedas rápidas)
    const embeddingsCollection = db.collection(COLLECTIONS.EMBEDDINGS);
    await embeddingsCollection.createIndex({ id_doc: 1 });
    console.log('✅ Índice creado en id_doc (embeddings)');

    const imageEmbeddingsCollection = db.collection(COLLECTIONS.IMAGE_EMBEDDINGS);
    await imageEmbeddingsCollection.createIndex({ id_doc: 1 });
    console.log('✅ Índice creado en id_doc (image_embeddings)');

    console.log('\n📋 NOTA: Para usar Atlas Vector Search, debes configurar el índice vectorial desde MongoDB Atlas UI:');
    console.log('   1. Ve a tu cluster en Atlas');
    console.log('   2. Selecciona "Atlas Search" o "Vector Search"');
    console.log('   3. Crea un índice en la colección "embeddings" con:');
    console.log('      - Campo: embedding');
    console.log('      - Tipo: knnVector');
    console.log('      - Dimensiones: 384 (para all-MiniLM-L6-v2)');
    console.log('      - Similarity: cosine');

    console.log('\n✅ Configuración de índices completada');
  } catch (error) {
    console.error('❌ Error configurando índices:', error.message);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

setupIndexes();

