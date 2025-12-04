import express from 'express';
import { getNews, getNewsById, updateNews } from '../services/news.service.js';
import { generateTextEmbedding, vectorSearch } from '../services/embeddings.service.js';
import { generateRAGResponse } from '../services/groq.service.js';
import { getDb, COLLECTIONS } from '../config/mongo.js';
import * as comentariosService from '../services/comentarios.service.js';
import * as categoriasService from '../services/categorias.service.js';

const router = express.Router();

/**
 * POST /api/search
 * Búsqueda vectorial pura usando embeddings generados en Python/Colab
 */
router.post('/search', async (req, res, next) => {
  try {
    const { query, limit = 5, incluir_comentarios = false } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'El parámetro "query" es requerido' });
    }

    const startTime = Date.now();

    // Generar embedding de la consulta del usuario
    const queryEmbedding = await generateTextEmbedding(query);

    // Búsqueda vectorial pura (sin filtros tradicionales)
    const vectorResults = await vectorSearch(queryEmbedding, limit);

    // Obtener documentos completos
    const db = await getDb();
    const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
    
    const results = await Promise.all(
      vectorResults.map(async (result) => {
        const article = await newsCollection.findOne({ _id: result.id_doc });
        if (!article) {
          console.warn(`⚠️ No se encontró artículo con ID: ${result.id_doc}`);
          return null;
        }
        
        // Convertir _id a string para que sea serializable en JSON
        const resultData = {
          ...article,
          _id: article._id.toString(),
          similarity: result.similarity
        };
        
        // Si se solicitan comentarios, agregarlos
        if (incluir_comentarios) {
          const comentarios = await comentariosService.obtenerComentariosPorNoticia(
            article._id.toString(),
            5, // Solo los 5 más recientes
            0
          );
          resultData.comentarios = comentarios.comentarios;
          resultData.total_comentarios = comentarios.total;
        }
        
        return resultData;
      })
    );

    const responseTime = Date.now() - startTime;

    res.json({
      query,
      results: results.filter(r => r !== null),
      count: results.filter(r => r !== null).length,
      response_time_ms: responseTime,
      search_type: 'vectorial'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rag
 * Pipeline RAG completo: búsqueda vectorial + generación de respuesta con LLM
 * Usa embeddings generados en Python/Colab
 */
router.post('/rag', async (req, res, next) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'El parámetro "query" es requerido' });
    }

    const startTime = Date.now();

    // Paso 1: Generar embedding de la consulta del usuario
    const queryEmbedding = await generateTextEmbedding(query);

    // Paso 2: Búsqueda vectorial pura (retrieval)
    const vectorResults = await vectorSearch(queryEmbedding, limit);

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
 * PUT /api/news/:id
 * Actualiza una noticia específica por ID
 */
router.put('/news/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};

    const updated = await updateNews(id, updates);
    res.json(updated);
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

/**
 * ============================================
 * COMENTARIOS
 * ============================================
 */

/**
 * POST /api/comentarios
 * Crea un nuevo comentario
 */
router.post('/comentarios', async (req, res, next) => {
  try {
    const { id_noticia, autor, contenido } = req.body;
    
    if (!id_noticia || !contenido) {
      return res.status(400).json({ 
        error: 'Se requieren id_noticia y contenido' 
      });
    }
    
    const comentario = await comentariosService.crearComentario({
      id_noticia,
      autor,
      contenido
    });
    
    res.status(201).json(comentario);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/comentarios/noticia/:id
 * Obtiene comentarios de una noticia específica
 */
router.get('/comentarios/noticia/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50, skip = 0 } = req.query;
    
    const result = await comentariosService.obtenerComentariosPorNoticia(
      id,
      parseInt(limit),
      parseInt(skip)
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/comentarios
 * Obtiene todos los comentarios (con paginación)
 */
router.get('/comentarios', async (req, res, next) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    
    const result = await comentariosService.obtenerTodosComentarios(
      parseInt(limit),
      parseInt(skip)
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/comentarios/populares
 * Obtiene comentarios más populares
 */
router.get('/comentarios/populares', async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const comentarios = await comentariosService.obtenerComentariosPopulares(
      parseInt(limit)
    );
    
    res.json({ comentarios });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/comentarios/:id/reaccion
 * Actualiza likes/dislikes de un comentario
 */
router.put('/comentarios/:id/reaccion', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body; // 'like' o 'dislike'
    
    if (!tipo || !['like', 'dislike'].includes(tipo)) {
      return res.status(400).json({ 
        error: 'Tipo debe ser "like" o "dislike"' 
      });
    }
    
    const comentario = await comentariosService.actualizarReaccionComentario(id, tipo);
    res.json(comentario);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/comentarios/stats
 * Estadísticas de comentarios
 */
router.get('/comentarios/stats', async (req, res, next) => {
  try {
    const stats = await comentariosService.obtenerEstadisticasComentarios();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * ============================================
 * CATEGORÍAS
 * ============================================
 */

/**
 * GET /api/categorias
 * Obtiene todas las categorías
 */
router.get('/categorias', async (req, res, next) => {
  try {
    const categorias = await categoriasService.obtenerCategorias();
    res.json({ categorias, total: categorias.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/categorias/poblar
 * Pobla la colección de categorías desde las noticias existentes
 */
router.post('/categorias/poblar', async (req, res, next) => {
  try {
    const result = await categoriasService.poblarCategorias();
    res.json({
      message: 'Categorías pobladas correctamente',
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/categorias/:nombre
 * Obtiene estadísticas y noticias de una categoría específica
 */
router.get('/categorias/:nombre', async (req, res, next) => {
  try {
    const { nombre } = req.params;
    const { limit = 10, skip = 0 } = req.query;
    
    const [stats, noticias] = await Promise.all([
      categoriasService.obtenerEstadisticasCategoria(nombre),
      categoriasService.obtenerNoticiasPorCategoria(nombre, parseInt(limit), parseInt(skip))
    ]);
    
    res.json({
      categoria: nombre,
      estadisticas: stats,
      noticias: noticias.noticias,
      total_noticias: noticias.total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/categorias/:nombre/noticias
 * Obtiene noticias de una categoría específica
 */
router.get('/categorias/:nombre/noticias', async (req, res, next) => {
  try {
    const { nombre } = req.params;
    const { limit = 10, skip = 0 } = req.query;
    
    const result = await categoriasService.obtenerNoticiasPorCategoria(
      nombre,
      parseInt(limit),
      parseInt(skip)
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * ============================================
 * BÚSQUEDA MEJORADA (con categorías y comentarios)
 * ============================================
 */

/**
 * GET /api/news/:id/completo
 * Obtiene una noticia con sus comentarios y categoría
 */
router.get('/news/:id/completo', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit_comentarios = 10 } = req.query;
    
    // Primero obtener la noticia
    const noticia = await getNewsById(id);
    
    if (!noticia) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }
    
    // Luego obtener comentarios y categoría en paralelo
    const [comentarios, categoriaStats] = await Promise.all([
      comentariosService.obtenerComentariosPorNoticia(id, parseInt(limit_comentarios), 0),
      noticia.categoria ? categoriasService.obtenerEstadisticasCategoria(noticia.categoria) : Promise.resolve(null)
    ]);
    
    res.json({
      ...noticia,
      comentarios: comentarios.comentarios,
      total_comentarios: comentarios.total,
      categoria_info: categoriaStats
    });
  } catch (error) {
    next(error);
  }
});

export default router;

