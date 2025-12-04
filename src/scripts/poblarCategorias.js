import dotenv from 'dotenv';
import { connectToMongo, closeConnection } from '../config/mongo.js';
import * as categoriasService from '../services/categorias.service.js';

dotenv.config();

/**
 * Script para poblar la colección de categorías desde las noticias existentes
 */
async function poblarCategorias() {
  try {
    await connectToMongo();
    
    console.log('📊 Poblando categorías desde noticias existentes...\n');
    
    const result = await categoriasService.poblarCategorias();
    
    console.log(`✅ Categorías pobladas correctamente:`);
    console.log(`   Total: ${result.total}`);
    console.log(`\n📋 Categorías encontradas:`);
    result.categorias.forEach((cat, idx) => {
      console.log(`   ${idx + 1}. ${cat.nombre} (${cat.total_noticias} noticias, ${cat.idiomas.length} idiomas)`);
    });
    
  } catch (error) {
    console.error('❌ Error poblando categorías:', error.message);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

poblarCategorias();

