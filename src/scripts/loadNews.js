import dotenv from 'dotenv';
import { loadNewsFromAPI } from '../services/news.service.js';
import { connectToMongo, closeConnection } from '../config/mongo.js';

dotenv.config();

async function main() {
  try {
    await connectToMongo();
    
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) {
      throw new Error('NEWS_API_KEY no está configurada en .env');
    }

    const maxPages = parseInt(process.argv[2]) || 10;
    console.log(`📥 Cargando noticias (máximo ${maxPages} páginas)...`);

    const total = await loadNewsFromAPI(maxPages, apiKey);
    
    console.log(`\n✅ Proceso completado: ${total} noticias cargadas`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();

