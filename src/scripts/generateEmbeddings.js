import dotenv from 'dotenv';
import { 
  generateEmbeddingsForAllNews, 
  generateImageEmbeddingsForNews 
} from '../services/embeddings.service.js';
import { connectToMongo, closeConnection } from '../config/mongo.js';

dotenv.config();

async function main() {
  try {
    await connectToMongo();

    const type = process.argv[2] || 'all'; // 'text', 'image', o 'all'

    if (type === 'text' || type === 'all') {
      console.log('📝 Generando embeddings de texto...');
      const textResult = await generateEmbeddingsForAllNews();
      console.log(`✅ Texto: ${textResult.processed} procesados, ${textResult.errors} errores\n`);
    }

    if (type === 'image' || type === 'all') {
      console.log('🖼️ Generando embeddings de imágenes...');
      const imageResult = await generateImageEmbeddingsForNews();
      console.log(`✅ Imágenes: ${imageResult.processed} procesadas, ${imageResult.errors} errores\n`);
    }

    console.log('✅ Proceso de embeddings completado');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();

