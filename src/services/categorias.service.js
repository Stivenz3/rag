import { getDb, COLLECTIONS } from '../config/mongo.js';

/**
 * Obtiene todas las categorías únicas de las noticias
 */
export async function obtenerCategorias() {
  const db = await getDb();
  const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
  
  const categorias = await newsCollection.distinct('categoria');
  return categorias.filter(cat => cat && cat.trim() !== '');
}

/**
 * Pobla la colección de categorías desde las noticias existentes
 */
export async function poblarCategorias() {
  const db = await getDb();
  const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
  const categoriasCollection = db.collection(COLLECTIONS.CATEGORIAS);
  
  // Obtener todas las categorías únicas con conteo
  const categoriasStats = await newsCollection.aggregate([
    { $match: { categoria: { $exists: true, $ne: '', $ne: null } } },
    { $group: { 
        _id: '$categoria', 
        count: { $sum: 1 },
        idiomas: { $addToSet: '$idioma' }
      } 
    },
    { $sort: { count: -1 } }
  ]).toArray();
  
  // Limpiar colección de categorías
  await categoriasCollection.deleteMany({});
  
  // Insertar categorías con estadísticas
  const categoriasDocs = categoriasStats.map(cat => ({
    nombre: cat._id,
    total_noticias: cat.count,
    idiomas: cat.idiomas,
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  
  if (categoriasDocs.length > 0) {
    await categoriasCollection.insertMany(categoriasDocs);
  }
  
  return {
    total: categoriasDocs.length,
    categorias: categoriasDocs
  };
}

/**
 * Obtiene estadísticas de una categoría específica
 */
export async function obtenerEstadisticasCategoria(nombreCategoria) {
  const db = await getDb();
  const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
  
  const stats = await newsCollection.aggregate([
    { $match: { categoria: nombreCategoria } },
    { $group: {
        _id: null,
        total: { $sum: 1 },
        idiomas: { $addToSet: '$idioma' },
        con_imagenes: {
          $sum: {
            $cond: [
              { $and: [
                { $isArray: '$imagenes' },
                { $gt: [{ $size: '$imagenes' }, 0] }
              ]},
              1,
              0
            ]
          }
        }
      }
    }
  ]).toArray();
  
  return stats[0] || { total: 0, idiomas: [], con_imagenes: 0 };
}

/**
 * Obtiene noticias por categoría
 */
export async function obtenerNoticiasPorCategoria(nombreCategoria, limit = 10, skip = 0) {
  const db = await getDb();
  const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
  
  const noticias = await newsCollection
    .find({ categoria: nombreCategoria })
    .sort({ fecha: -1 })
    .limit(limit)
    .skip(skip)
    .toArray();
  
  const total = await newsCollection.countDocuments({ categoria: nombreCategoria });
  
  return {
    noticias,
    total,
    limit,
    skip
  };
}

