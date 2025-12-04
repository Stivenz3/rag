import axios from 'axios';
import { getDb, COLLECTIONS } from '../config/mongo.js';

const NEWS_API_BASE = 'https://newsdata.io/api/1/news';

/**
 * Carga noticias desde NewsData.io API
 */
export async function loadNewsFromAPI(maxPages = 10, apiKey) {
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.NOTICIAS);
  
  let totalDocs = 0;
  let nextPage = null;

  for (let i = 0; i < maxPages; i++) {
    try {
      const url = nextPage 
        ? `${NEWS_API_BASE}?apikey=${apiKey}&page=${nextPage}`
        : `${NEWS_API_BASE}?apikey=${apiKey}&q=technology&language=es,en,pt`;

      const response = await axios.get(url);
      const data = response.data;

      if (data.status !== 'success') {
        console.log(`⚠️ Página ${i + 1}: ${data.results?.message || 'Error desconocido'}`);
        break;
      }

      const results = data.results || [];
      if (!Array.isArray(results) || results.length === 0) {
        console.log(`⚠️ Página ${i + 1}: sin resultados`);
        break;
      }

      const docs = results
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          titulo: item.title || '',
          autor: Array.isArray(item.creator) ? item.creator : (item.creator ? [item.creator] : ['Desconocido']),
          fecha: item.pubDate || '',
          idioma: item.language || 'unknown',
          categoria: 'tecnología',
          contenido_texto: item.content || item.description || '',
          imagenes: item.image_url ? [item.image_url] : [],
          fuente: item.source_id || null,
          link_original: item.link || null,
          createdAt: new Date()
        }))
        .filter(doc => doc.titulo && doc.contenido_texto);

      if (docs.length > 0) {
        // Insertar uno por uno para manejar errores de validación
        let inserted = 0;
        for (const doc of docs) {
          try {
            await collection.insertOne(doc);
            inserted++;
          } catch (error) {
            if (error.code === 121) {
              console.error(`⚠️ Documento rechazado por validación: ${doc.titulo?.substring(0, 50)}...`);
            } else {
              console.error(`⚠️ Error insertando documento:`, error.message);
            }
          }
        }
        totalDocs += inserted;
        console.log(`📄 Página ${i + 1} procesada (${inserted}/${docs.length} artículos insertados). Total: ${totalDocs}`);
      }

      nextPage = data.nextPage;
      if (!nextPage) {
        console.log('🚫 No hay más páginas disponibles');
        break;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Error en página ${i + 1}:`, error.message);
      break;
    }
  }

  console.log(`✅ Carga completada: ${totalDocs} artículos insertados en total`);
  return totalDocs;
}

/**
 * Obtiene noticias con filtros opcionales
 */
export async function getNews(filters = {}, limit = 10, skip = 0) {
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.NOTICIAS);
  
  const query = {};
  
  if (filters.idioma) {
    query.idioma = filters.idioma;
  }
  
  if (filters.categoria) {
    query.categoria = filters.categoria;
  }
  
  if (filters.fechaDesde || filters.fechaHasta) {
    query.fecha = {};
    if (filters.fechaDesde) {
      query.fecha.$gte = filters.fechaDesde;
    }
    if (filters.fechaHasta) {
      query.fecha.$lte = filters.fechaHasta;
    }
  }

  const news = await collection
    .find(query)
    .sort({ fecha: -1 })
    .limit(limit)
    .skip(skip)
    .toArray();

  const total = await collection.countDocuments(query);

  return { news, total };
}

/**
 * Obtiene una noticia por ID
 */
export async function getNewsById(id) {
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.NOTICIAS);
  
  const { ObjectId } = await import('mongodb');
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  
  return await collection.findOne({ _id: objectId });
}

/**
 * Actualiza una noticia por ID (campos básicos)
 */
export async function updateNews(id, updates) {
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.NOTICIAS);

  const { ObjectId } = await import('mongodb');
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;

  // Solo permitir actualizar ciertos campos
  const allowedFields = [
    'titulo',
    'contenido_texto',
    'categoria',
    'idioma',
    'imagenes',
    'fecha'
  ];

  const set = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      set[field] = updates[field];
    }
  }

  if (Object.keys(set).length === 0) {
    throw new Error('No hay campos válidos para actualizar');
  }

  const result = await collection.findOneAndUpdate(
    { _id: objectId },
    { $set: set },
    { returnDocument: 'after' }
  );

  if (!result.value) {
    throw new Error('Noticia no encontrada');
  }

  return result.value;
}

