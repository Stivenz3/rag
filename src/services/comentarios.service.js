import { ObjectId } from 'mongodb';
import { getDb, COLLECTIONS } from '../config/mongo.js';

/**
 * Crea un nuevo comentario
 */
export async function crearComentario(comentarioData) {
  const db = await getDb();
  const comentariosCollection = db.collection(COLLECTIONS.COMENTARIOS);
  
  // Validar que la noticia existe
  const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
  const noticia = await newsCollection.findOne({ 
    _id: new ObjectId(comentarioData.id_noticia) 
  });
  
  if (!noticia) {
    throw new Error('Noticia no encontrada');
  }
  
  const comentario = {
    id_noticia: new ObjectId(comentarioData.id_noticia),
    autor: comentarioData.autor || 'Anónimo',
    contenido: comentarioData.contenido,
    fecha: new Date(),
    createdAt: new Date(),
    likes: 0,
    dislikes: 0,
    reportado: false
  };
  
  const result = await comentariosCollection.insertOne(comentario);
  return { ...comentario, _id: result.insertedId };
}

/**
 * Obtiene comentarios de una noticia específica
 */
export async function obtenerComentariosPorNoticia(idNoticia, limit = 50, skip = 0) {
  const db = await getDb();
  const comentariosCollection = db.collection(COLLECTIONS.COMENTARIOS);
  
  const comentarios = await comentariosCollection
    .find({ id_noticia: new ObjectId(idNoticia) })
    .sort({ fecha: -1 })
    .limit(limit)
    .skip(skip)
    .toArray();
  
  const total = await comentariosCollection.countDocuments({ 
    id_noticia: new ObjectId(idNoticia) 
  });
  
  return {
    comentarios,
    total,
    limit,
    skip
  };
}

/**
 * Obtiene todos los comentarios (con paginación)
 */
export async function obtenerTodosComentarios(limit = 50, skip = 0) {
  const db = await getDb();
  const comentariosCollection = db.collection(COLLECTIONS.COMENTARIOS);
  
  const comentarios = await comentariosCollection
    .find({})
    .sort({ fecha: -1 })
    .limit(limit)
    .skip(skip)
    .toArray();
  
  const total = await comentariosCollection.countDocuments({});
  
  return {
    comentarios,
    total,
    limit,
    skip
  };
}

/**
 * Actualiza likes/dislikes de un comentario
 */
export async function actualizarReaccionComentario(idComentario, tipo) {
  const db = await getDb();
  const comentariosCollection = db.collection(COLLECTIONS.COMENTARIOS);
  
  const updateField = tipo === 'like' ? 'likes' : 'dislikes';
  
  const result = await comentariosCollection.findOneAndUpdate(
    { _id: new ObjectId(idComentario) },
    { $inc: { [updateField]: 1 } },
    { returnDocument: 'after' }
  );
  
  if (!result.value) {
    throw new Error('Comentario no encontrado');
  }
  
  return result.value;
}

/**
 * Obtiene estadísticas de comentarios
 */
export async function obtenerEstadisticasComentarios() {
  const db = await getDb();
  const comentariosCollection = db.collection(COLLECTIONS.COMENTARIOS);
  
  const stats = await comentariosCollection.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        total_likes: { $sum: '$likes' },
        total_dislikes: { $sum: '$dislikes' },
        noticias_comentadas: { $addToSet: '$id_noticia' }
      }
    },
    {
      $project: {
        total: 1,
        total_likes: 1,
        total_dislikes: 1,
        noticias_comentadas: { $size: '$noticias_comentadas' }
      }
    }
  ]).toArray();
  
  return stats[0] || {
    total: 0,
    total_likes: 0,
    total_dislikes: 0,
    noticias_comentadas: 0
  };
}

/**
 * Obtiene comentarios más populares (por likes)
 */
export async function obtenerComentariosPopulares(limit = 10) {
  const db = await getDb();
  const comentariosCollection = db.collection(COLLECTIONS.COMENTARIOS);
  
  const comentarios = await comentariosCollection
    .find({})
    .sort({ likes: -1, fecha: -1 })
    .limit(limit)
    .toArray();
  
  return comentarios;
}

