import dotenv from 'dotenv';
import { getDb, COLLECTIONS } from '../config/mongo.js';
import { connectToMongo, closeConnection } from '../config/mongo.js';

dotenv.config();

/**
 * Verifica el estado de los embeddings de imágenes
 */
async function checkImageEmbeddings() {
  try {
    await connectToMongo();
    const db = await getDb();
    const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
    const imageEmbeddingsCollection = db.collection(COLLECTIONS.IMAGE_EMBEDDINGS);

    console.log('Verificando embeddings de imágenes...\n');

    // Contar noticias con imágenes (array existe y tiene al menos 1 elemento)
    const allNews = await newsCollection.find({
      imagenes: { $exists: true, $type: 'array' }
    }).toArray();
    const newsWithImages = allNews.filter(n => Array.isArray(n.imagenes) && n.imagenes.length > 0).length;

    // Contar embeddings de imágenes
    const totalImageEmbeddings = await imageEmbeddingsCollection.countDocuments();

    // Verificar dimensiones
    const allEmbeddings = await imageEmbeddingsCollection.find({}).toArray();
    const validEmbeddings = allEmbeddings.filter(doc => {
      const emb = doc.embedding;
      return Array.isArray(emb) && emb.length === 512;
    });

    console.log(`📊 Estadísticas:`);
    console.log(`   Noticias con imágenes: ${newsWithImages}`);
    console.log(`   Embeddings de imágenes: ${totalImageEmbeddings}`);
    console.log(`   Embeddings válidos (512 dim): ${validEmbeddings.length}`);
    console.log(`   Embeddings inválidos: ${totalImageEmbeddings - validEmbeddings.length}`);
    console.log(`   Cobertura: ${newsWithImages > 0 ? ((totalImageEmbeddings / newsWithImages) * 100).toFixed(1) + '%' : '0%'}`);

    // Mostrar algunos ejemplos
    if (validEmbeddings.length > 0) {
      console.log(`\n✅ Ejemplos de embeddings válidos:`);
      validEmbeddings.slice(0, 3).forEach((doc, idx) => {
        console.log(`   ${idx + 1}. Doc ID: ${doc.id_doc}, Dimensión: ${doc.embedding.length}, URL: ${doc.image_url?.substring(0, 50)}...`);
      });
    }

    if (totalImageEmbeddings - validEmbeddings.length > 0) {
      console.log(`\n⚠️ Embeddings inválidos encontrados. Ejecuta:`);
      console.log(`   node src/scripts/generateEmbeddings.js image`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

checkImageEmbeddings();

