import { pipeline } from '@xenova/transformers';
import { getDb, COLLECTIONS } from '../config/mongo.js';
import axios from 'axios';

// Importación condicional de sharp (solo cuando se necesite)
let sharp = null;
async function getSharp() {
  if (!sharp) {
    try {
      sharp = (await import('sharp')).default;
    } catch (error) {
      console.warn('⚠️ Sharp no está disponible. Las funciones de imagen pueden no funcionar.');
      console.warn('   Para instalar: npm install --include=optional sharp');
      throw new Error('Sharp no está instalado correctamente. Ejecuta: npm install --include=optional sharp');
    }
  }
  return sharp;
}

// Modelos de embeddings
let textModel = null;
let imageModel = null;

/**
 * Inicializa el modelo de embeddings de texto
 */
async function getTextModel() {
  if (!textModel) {
    console.log('📥 Cargando modelo de embeddings de texto...');
    console.log('   Esto puede tardar varios minutos la primera vez (descarga del modelo)...');
    
    try {
      // Usar modelo Xenova que está pre-convertido a ONNX
      // all-MiniLM-L6-v2 es un modelo multilingüe ligero y eficiente (384 dimensiones)
      textModel = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
      console.log('✅ Modelo de texto cargado correctamente');
    } catch (error) {
      console.error('❌ Error cargando modelo:', error.message);
      console.error('   Verifica tu conexión a internet');
      throw new Error(`No se pudo cargar el modelo: ${error.message}`);
    }
  }
  return textModel;
}

/**
 * Inicializa el modelo CLIP para imágenes
 */
async function getImageModel() {
  if (!imageModel) {
    console.log('📥 Cargando modelo CLIP para imágenes...');
    imageModel = await pipeline(
      'feature-extraction',
      'Xenova/clip-vit-base-patch32'
    );
    console.log('✅ Modelo CLIP cargado');
  }
  return imageModel;
}

/**
 * Genera embedding de texto
 */
export async function generateTextEmbedding(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Texto inválido para generar embedding');
  }

  const model = await getTextModel();
  
  try {
    // @xenova/transformers devuelve un tensor
    const output = await model(text);

    // El output es un tensor con propiedad .data
    // Necesitamos extraer los datos y hacer pooling manualmente
    let embedding;
    
    if (output && output.data) {
      // Si es un tensor con .data
      const data = Array.from(output.data);
      
      // El output puede ser [batch_size, seq_len, hidden_size]
      // Necesitamos hacer mean pooling sobre la dimensión de secuencia
      if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
        // Formato: [batch][seq][hidden]
        const batch = data[0]; // Tomar primer batch
        const hiddenSize = batch[0].length;
        embedding = new Array(hiddenSize).fill(0);
        
        // Mean pooling
        for (let i = 0; i < batch.length; i++) {
          for (let j = 0; j < hiddenSize; j++) {
            embedding[j] += batch[i][j];
          }
        }
        for (let j = 0; j < hiddenSize; j++) {
          embedding[j] /= batch.length;
        }
      } else if (Array.isArray(data[0])) {
        // Formato: [seq][hidden] - hacer mean pooling
        const seq = data;
        const hiddenSize = seq[0].length;
        embedding = new Array(hiddenSize).fill(0);
        
        for (let i = 0; i < seq.length; i++) {
          for (let j = 0; j < hiddenSize; j++) {
            embedding[j] += seq[i][j];
          }
        }
        for (let j = 0; j < hiddenSize; j++) {
          embedding[j] /= seq.length;
        }
      } else {
        // Ya es un array plano
        embedding = data;
      }
    } else if (Array.isArray(output)) {
      // Si ya es un array
      embedding = output;
      // Aplanar si es multidimensional
      while (Array.isArray(embedding[0])) {
        embedding = embedding[0];
      }
    } else {
      throw new Error(`Formato de output no reconocido: ${typeof output}`);
    }

    // Normalizar el vector (L2 normalization)
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      embedding = embedding.map(val => val / norm);
    }

    // Validar dimensiones (384 para all-MiniLM-L6-v2)
    if (embedding.length === 0) {
      throw new Error('El embedding está vacío');
    }

    return embedding;
  } catch (error) {
    console.error(`Error generando embedding:`, error.message);
    throw error;
  }
}

/**
 * Descarga y procesa una imagen desde URL
 */
async function downloadAndProcessImage(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    // Procesar imagen con sharp (importación dinámica)
    const sharpLib = await getSharp();
    const imageBuffer = await sharpLib(response.data)
      .resize(224, 224, { fit: 'cover' })
      .toBuffer();

    return imageBuffer;
  } catch (error) {
    console.error(`⚠️ Error descargando/procesando imagen ${imageUrl}:`, error.message);
    return null;
  }
}

/**
 * Genera embedding de imagen desde URL
 */
export async function generateImageEmbedding(imageUrl) {
  if (!imageUrl) {
    throw new Error('URL de imagen inválida');
  }

  const model = await getImageModel();
  const imageBuffer = await downloadAndProcessImage(imageUrl);

  if (!imageBuffer) {
    throw new Error('No se pudo descargar la imagen');
  }

  const output = await model(imageBuffer, {
    pooling: 'mean',
    normalize: true
  });

  return Array.from(output.data);
}

/**
 * Genera embeddings para todas las noticias sin embeddings
 */
export async function generateEmbeddingsForAllNews() {
  const db = await getDb();
  const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
  const embeddingsCollection = db.collection(COLLECTIONS.EMBEDDINGS);

  // Obtener noticias que no tienen embeddings
  const newsWithEmbeddings = await embeddingsCollection.distinct('id_doc');
  const news = await newsCollection.find({
    _id: { $nin: newsWithEmbeddings },
    contenido_texto: { $exists: true, $ne: null }
  }).toArray();

  console.log(`📊 Generando embeddings para ${news.length} noticias...`);

  let processed = 0;
  let errors = 0;

  for (const article of news) {
    try {
      const texto = `${article.titulo || ''} ${article.contenido_texto || ''}`.trim();
      
      if (!texto) {
        continue;
      }

      const embedding = await generateTextEmbedding(texto);

      await embeddingsCollection.insertOne({
        id_doc: article._id,
        embedding: embedding,
        tipo: 'texto',
        createdAt: new Date()
      });

      processed++;
      
      if (processed % 10 === 0) {
        console.log(`✅ Procesadas ${processed}/${news.length} noticias...`);
      }
    } catch (error) {
      console.error(`❌ Error procesando noticia ${article._id}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Embeddings generados: ${processed} exitosos, ${errors} errores`);
  return { processed, errors };
}

/**
 * Genera embeddings para imágenes de noticias
 */
export async function generateImageEmbeddingsForNews() {
  // Verificar que sharp está disponible
  try {
    await getSharp();
  } catch (error) {
    console.error('❌ Sharp no está disponible. No se pueden generar embeddings de imágenes.');
    console.error('   Ejecuta: npm run fix-sharp');
    console.error('   O genera solo embeddings de texto: node src/scripts/generateEmbeddings.js text');
    return { processed: 0, errors: 0 };
  }

  const db = await getDb();
  const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
  const imageEmbeddingsCollection = db.collection(COLLECTIONS.IMAGE_EMBEDDINGS);

  // Obtener noticias con imágenes que no tienen embeddings
  const newsWithImageEmbeddings = await imageEmbeddingsCollection.distinct('id_doc');
  const news = await newsCollection.find({
    _id: { $nin: newsWithImageEmbeddings },
    imagenes: { $exists: true, $ne: [], $size: { $gt: 0 } }
  }).toArray();

  console.log(`📊 Generando embeddings para ${news.length} imágenes...`);

  let processed = 0;
  let errors = 0;

  for (const article of news) {
    try {
      const imageUrl = article.imagenes?.[0];
      
      if (!imageUrl) {
        continue;
      }

      const embedding = await generateImageEmbedding(imageUrl);

      await imageEmbeddingsCollection.insertOne({
        id_doc: article._id,
        image_url: imageUrl,
        embedding: embedding,
        tipo: 'imagen',
        createdAt: new Date()
      });

      processed++;
      
      if (processed % 5 === 0) {
        console.log(`✅ Procesadas ${processed}/${news.length} imágenes...`);
      }

      // Rate limiting para no sobrecargar
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Error procesando imagen de noticia ${article._id}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Embeddings de imágenes generados: ${processed} exitosos, ${errors} errores`);
  return { processed, errors };
}

/**
 * Búsqueda vectorial usando cosine similarity (fallback si no hay Atlas Vector Search)
 */
export async function vectorSearch(embedding, filters = {}, limit = 5) {
  const db = await getDb();
  const embeddingsCollection = db.collection(COLLECTIONS.EMBEDDINGS);

  // Si hay filtros, primero obtenemos los IDs de documentos que cumplen
  let allowedDocIds = null;
  if (Object.keys(filters).length > 0) {
    const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
    const query = {};
    
    if (filters.idioma) query.idioma = filters.idioma;
    if (filters.categoria) query.categoria = filters.categoria;
    if (filters.fechaDesde || filters.fechaHasta) {
      query.fecha = {};
      if (filters.fechaDesde) query.fecha.$gte = filters.fechaDesde;
      if (filters.fechaHasta) query.fecha.$lte = filters.fechaHasta;
    }

    const matchingNews = await newsCollection.find(query, { projection: { _id: 1 } }).toArray();
    allowedDocIds = matchingNews.map(n => n._id);
  }

  // Obtener todos los embeddings
  const query = allowedDocIds ? { id_doc: { $in: allowedDocIds } } : {};
  const allEmbeddings = await embeddingsCollection.find(query).toArray();

  if (allEmbeddings.length === 0) {
    return [];
  }

  // Calcular similitud coseno
  const similarities = allEmbeddings.map(doc => {
    const docEmbedding = doc.embedding;
    const similarity = cosineSimilarity(embedding, docEmbedding);
    return { ...doc, similarity };
  });

  // Ordenar por similitud y tomar los top N
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, limit);
}

/**
 * Calcula similitud coseno entre dos vectores
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Los vectores deben tener la misma dimensión');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

