import express from 'express';
import { getNews, getNewsById } from '../services/news.service.js';
import { generateTextEmbedding, generateImageEmbedding, vectorSearch } from '../services/embeddings.service.js';
import { generateRAGResponse } from '../services/groq.service.js';
import { getDb, COLLECTIONS } from '../config/mongo.js';

const router = express.Router();

/**
 * POST /api/search
 * Búsqueda híbrida: combina filtros tradicionales con búsqueda vectorial
 */
router.post('/search', async (req, res, next) => {
  try {
    const { query, filters = {}, limit = 5, searchType = 'text' } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'El parámetro "query" es requerido' });
    }

    const startTime = Date.now();

    // Generar embedding de la consulta
    const queryEmbedding = await generateTextEmbedding(query);

    // Búsqueda vectorial con filtros
    const vectorResults = await vectorSearch(queryEmbedding, filters, limit);

    // Obtener documentos completos
    const db = await getDb();
    const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
    
    const results = await Promise.all(
      vectorResults.map(async (result) => {
        const article = await newsCollection.findOne({ _id: result.id_doc });
        return {
          ...article,
          similarity: result.similarity
        };
      })
    );

    const responseTime = Date.now() - startTime;

    res.json({
      query,
      filters,
      results: results.filter(r => r !== null),
      count: results.length,
      response_time_ms: responseTime,
      search_type: searchType
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rag
 * Pipeline RAG completo: búsqueda + generación de respuesta con LLM
 */
router.post('/rag', async (req, res, next) => {
  try {
    const { query, filters = {}, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'El parámetro "query" es requerido' });
    }

    const startTime = Date.now();

    // Paso 1: Generar embedding de la consulta
    const queryEmbedding = await generateTextEmbedding(query);

    // Paso 2: Búsqueda vectorial con filtros (retrieval)
    const vectorResults = await vectorSearch(queryEmbedding, filters, limit);

    // Paso 3: Obtener documentos completos
    const db = await getDb();
    const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
    
    const contextDocuments = await Promise.all(
      vectorResults.map(async (result) => {
        const article = await newsCollection.findOne({ _id: result.id_doc });
        return article ? { ...article, similarity: result.similarity } : null;
      })
    );

    const validDocuments = contextDocuments.filter(doc => doc !== null);

    if (validDocuments.length === 0) {
      return res.status(404).json({
        error: 'No se encontraron documentos relevantes para la consulta',
        query
      });
    }

    // Paso 4: Generar respuesta con LLM (generation)
    const ragResponse = await generateRAGResponse(query, validDocuments);

    const totalTime = Date.now() - startTime;

    res.json({
      query,
      answer: ragResponse.answer,
      context_documents: validDocuments.map(doc => ({
        _id: doc._id,
        titulo: doc.titulo,
        idioma: doc.idioma,
        fecha: doc.fecha,
        similarity: doc.similarity,
        link_original: doc.link_original
      })),
      metadata: {
        model: ragResponse.model,
        tokens_used: ragResponse.tokens_used,
        documents_used: validDocuments.length,
        total_time_ms: totalTime
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/news
 * Lista noticias con filtros opcionales
 */
router.get('/news', async (req, res, next) => {
  try {
    const { 
      idioma, 
      categoria, 
      fechaDesde, 
      fechaHasta,
      limit = 10,
      skip = 0 
    } = req.query;

    const filters = {};
    if (idioma) filters.idioma = idioma;
    if (categoria) filters.categoria = categoria;
    if (fechaDesde) filters.fechaDesde = fechaDesde;
    if (fechaHasta) filters.fechaHasta = fechaHasta;

    const result = await getNews(filters, parseInt(limit), parseInt(skip));

    res.json({
      news: result.news,
      total: result.total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/news/:id
 * Obtiene una noticia específica por ID
 */
router.get('/news/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const news = await getNewsById(id);

    if (!news) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }

    res.json(news);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats
 * Estadísticas del sistema
 */
router.get('/stats', async (req, res, next) => {
  try {
    const db = await getDb();
    const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
    const embeddingsCollection = db.collection(COLLECTIONS.EMBEDDINGS);
    const imageEmbeddingsCollection = db.collection(COLLECTIONS.IMAGE_EMBEDDINGS);

    const [totalNews, totalTextEmbeddings, totalImageEmbeddings, newsByLanguage] = await Promise.all([
      newsCollection.countDocuments(),
      embeddingsCollection.countDocuments(),
      imageEmbeddingsCollection.countDocuments(),
      newsCollection.aggregate([
        { $group: { _id: '$idioma', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray()
    ]);

    res.json({
      total_news: totalNews,
      total_text_embeddings: totalTextEmbeddings,
      total_image_embeddings: totalImageEmbeddings,
      coverage_text: totalNews > 0 ? ((totalTextEmbeddings / totalNews) * 100).toFixed(2) + '%' : '0%',
      coverage_images: totalNews > 0 ? ((totalImageEmbeddings / totalNews) * 100).toFixed(2) + '%' : '0%',
      news_by_language: newsByLanguage
    });
  } catch (error) {
    next(error);
  }
});

export default router;

