import { pipeline } from '@xenova/transformers';
import { getDb, COLLECTIONS } from '../config/mongo.js';
import axios from 'axios';

// Importación condicional de sharp (solo cuando se necesite)
let sharp = null;
async function getSharp() {
  if (!sharp) {
    try {
      const sharpModule = await import('sharp');
      sharp = sharpModule.default || sharpModule;
      
      if (!sharp) {
        throw new Error('Sharp module is null or undefined');
      }
    } catch (error) {
      console.error('❌ Error importando sharp:', error.message);
      console.error('   Código de error:', error.code);
      throw new Error(`Sharp no está disponible: ${error.message}. Ejecuta: npm run fix-sharp`);
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

    let embedding;
    
    // El output puede ser un tensor o un array
    // Necesitamos extraer los datos correctamente
    if (output && typeof output.data !== 'undefined') {
      // Es un tensor con .data
      const tensorData = output.data;
      
      // Convertir a array y verificar forma
      let data;
      if (tensorData && typeof tensorData.toArray === 'function') {
        data = await tensorData.toArray();
      } else if (Array.isArray(tensorData)) {
        data = tensorData;
      } else {
        data = Array.from(tensorData);
      }
      
      // Determinar la forma del tensor
      // Puede ser: [batch, seq, hidden] o [seq, hidden] o [hidden]
      if (Array.isArray(data) && data.length > 0) {
        if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
          // Formato: [batch][seq][hidden] - tomar primer batch y hacer mean pooling
          const batch = data[0];
          const hiddenSize = batch[0]?.length || 384;
          embedding = new Array(hiddenSize).fill(0);
          
          for (let i = 0; i < batch.length; i++) {
            for (let j = 0; j < hiddenSize && j < batch[i].length; j++) {
              embedding[j] += batch[i][j];
            }
          }
          for (let j = 0; j < hiddenSize; j++) {
            embedding[j] /= batch.length;
          }
        } else if (Array.isArray(data[0])) {
          // Formato: [seq][hidden] - hacer mean pooling
          const seq = data;
          const hiddenSize = seq[0]?.length || 384;
          embedding = new Array(hiddenSize).fill(0);
          
          for (let i = 0; i < seq.length; i++) {
            for (let j = 0; j < hiddenSize && j < seq[i].length; j++) {
              embedding[j] += seq[i][j];
            }
          }
          for (let j = 0; j < hiddenSize; j++) {
            embedding[j] /= seq.length;
          }
        } else {
          // Ya es un array plano [hidden]
          embedding = data;
        }
      } else {
        throw new Error('No se pudo extraer datos del tensor');
      }
    } else if (Array.isArray(output)) {
      // Si ya es un array directamente
      embedding = output;
      // Aplanar si es multidimensional
      while (Array.isArray(embedding) && embedding.length > 0 && Array.isArray(embedding[0])) {
        // Si es [seq][hidden], hacer mean pooling
        if (embedding[0].length === 384 || embedding[0].length > 100) {
          const seq = embedding;
          const hiddenSize = seq[0].length;
          const pooled = new Array(hiddenSize).fill(0);
          for (let i = 0; i < seq.length; i++) {
            for (let j = 0; j < hiddenSize; j++) {
              pooled[j] += seq[i][j];
            }
          }
          for (let j = 0; j < hiddenSize; j++) {
            pooled[j] /= seq.length;
          }
          embedding = pooled;
        } else {
          embedding = embedding[0];
        }
      }
    } else {
      // Intentar acceder a .data si existe
      const data = output?.data;
      if (data) {
        embedding = Array.isArray(data) ? data : Array.from(data);
      } else {
        throw new Error(`Formato de output no reconocido: ${typeof output}. Tipo: ${output?.constructor?.name || 'unknown'}`);
      }
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

    // Asegurar que el embedding tiene exactamente 384 dimensiones
    // Si tiene más, truncar; si tiene menos, rellenar con ceros (no debería pasar)
    const expectedDim = 384;
    if (embedding.length !== expectedDim) {
      console.warn(`⚠️ Embedding tiene ${embedding.length} dimensiones, esperado ${expectedDim}. Ajustando...`);
      if (embedding.length > expectedDim) {
        embedding = embedding.slice(0, expectedDim);
      } else {
        // Rellenar con ceros (no ideal, pero mejor que fallar)
        while (embedding.length < expectedDim) {
          embedding.push(0);
        }
      }
    }

    return embedding;
  } catch (error) {
    console.error(`Error generando embedding:`, error.message);
    throw error;
  }
}

/**
 * Descarga y procesa una imagen desde URL - PROCESA TODAS LAS IMÁGENES
 * Intenta múltiples métodos hasta que uno funcione
 */
async function downloadAndProcessImage(imageUrl) {
  let imageData = null;
  let contentType = '';
  
  // Descargar imagen
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    imageData = Buffer.from(response.data);
    contentType = response.headers['content-type'] || '';
  } catch (error) {
    // Reintentar una vez
    try {
      const retryResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      imageData = Buffer.from(retryResponse.data);
      contentType = retryResponse.headers['content-type'] || '';
    } catch (retryError) {
      throw new Error(`No se pudo descargar la imagen: ${retryError.message}`);
    }
  }

  if (!imageData) {
    throw new Error('No se recibieron datos de la imagen');
  }

  // MÉTODO PRINCIPAL: Canvas (soporta WebP, JPEG, PNG nativamente)
  // Canvas es la mejor opción porque funciona en Windows y soporta todos los formatos
  try {
    const canvasModule = await import('canvas');
    const { createCanvas, loadImage } = canvasModule;
    const img = await loadImage(imageData);
    const canvas = createCanvas(224, 224);
    const ctx = canvas.getContext('2d');
    
    // Calcular para cover (llenar 224x224 manteniendo aspecto)
    const scale = Math.max(224 / img.width, 224 / img.height);
    const x = (224 - img.width * scale) / 2;
    const y = (224 - img.height * scale) / 2;
    
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    return canvas.toBuffer('image/jpeg');
  } catch (canvasError) {
    // Si canvas falla, intentar sharp
    try {
      const sharpLib = await getSharp();
      return await sharpLib(imageData)
        .resize(224, 224, { fit: 'cover' })
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch (sharpError) {
      // Si sharp también falla, intentar jimp (solo para formatos no-WebP)
      const isWebP = contentType.includes('webp') || imageUrl.toLowerCase().includes('.webp');
      if (!isWebP) {
        try {
          const jimpModule = await import('jimp');
          const Jimp = jimpModule.Jimp || jimpModule.default || jimpModule;
          
          if (Jimp && typeof Jimp.read === 'function') {
            const image = await Jimp.read(imageData);
            const width = image.bitmap.width;
            const height = image.bitmap.height;
            const scale = Math.max(224 / width, 224 / height);
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);
            
            image.resize(newWidth, newHeight);
            const x = Math.round((newWidth - 224) / 2);
            const y = Math.round((newHeight - 224) / 2);
            image.crop(x, y, 224, 224);
            
            return await image.getBufferAsync('image/jpeg');
          }
        } catch (jimpError) {
          // Jimp falló
        }
      }
      
      // Si TODO falla, reintentar canvas con diferentes opciones
      try {
        const canvasModule = await import('canvas');
        const { createCanvas, loadImage } = canvasModule;
        // Intentar cargar desde URL directamente si el buffer falla
        const img = await loadImage(imageUrl);
        const canvas = createCanvas(224, 224);
        const ctx = canvas.getContext('2d');
        
        const scale = Math.max(224 / img.width, 224 / img.height);
        const x = (224 - img.width * scale) / 2;
        const y = (224 - img.height * scale) / 2;
        
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        return canvas.toBuffer('image/jpeg');
      } catch (finalCanvasError) {
        throw new Error(`No se pudo procesar la imagen después de intentar canvas, sharp y jimp. Canvas error: ${canvasError.message}. URL: ${imageUrl.substring(0, 50)}...`);
      }
    }
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

  try {
    // Asegurar que imageBuffer es un Buffer válido
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('El buffer de imagen no es válido');
    }

    // El modelo CLIP puede procesar imágenes directamente como Buffer
    // No necesita procesamiento adicional si ya es una imagen válida
    const output = await model(imageBuffer);

    let embedding;
    
    // Procesar output similar a texto
    if (output && typeof output.data !== 'undefined') {
      const tensorData = output.data;
      
      let data;
      if (tensorData && typeof tensorData.toArray === 'function') {
        data = await tensorData.toArray();
      } else if (Array.isArray(tensorData)) {
        data = tensorData;
      } else {
        data = Array.from(tensorData);
      }
      
      // CLIP devuelve [batch, hidden] o [hidden]
      if (Array.isArray(data) && data.length > 0) {
        if (Array.isArray(data[0])) {
          // Formato: [batch][hidden] - tomar primer batch
          embedding = data[0];
        } else {
          // Ya es un array plano [hidden]
          embedding = data;
        }
      } else {
        throw new Error('No se pudo extraer datos del tensor de imagen');
      }
    } else if (Array.isArray(output)) {
      embedding = output;
      // Aplanar si es multidimensional
      while (Array.isArray(embedding) && embedding.length > 0 && Array.isArray(embedding[0])) {
        embedding = embedding[0];
      }
    } else {
      const data = output?.data;
      if (data) {
        embedding = Array.isArray(data) ? data : Array.from(data);
      } else {
        throw new Error(`Formato de output de imagen no reconocido: ${typeof output}`);
      }
    }

    // Normalizar el vector (L2 normalization)
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      embedding = embedding.map(val => val / norm);
    }

    // Validar dimensiones (512 para CLIP vit-base-patch32)
    if (embedding.length === 0) {
      throw new Error('El embedding de imagen está vacío');
    }

    // Asegurar que tiene exactamente 512 dimensiones
    const expectedDim = 512;
    if (embedding.length !== expectedDim) {
      console.warn(`⚠️ Embedding de imagen tiene ${embedding.length} dimensiones, esperado ${expectedDim}. Ajustando...`);
      if (embedding.length > expectedDim) {
        embedding = embedding.slice(0, expectedDim);
      } else {
        while (embedding.length < expectedDim) {
          embedding.push(0);
        }
      }
    }

    return embedding;
  } catch (error) {
    console.error(`Error generando embedding de imagen:`, error.message);
    throw error;
  }
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

      // Validar que el embedding tiene la dimensión correcta antes de guardar
      if (!Array.isArray(embedding) || embedding.length !== 384) {
        console.error(`❌ Embedding inválido para noticia ${article._id}: dimensión ${embedding?.length || 0}, esperado 384`);
        errors++;
        continue;
      }

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
  // Verificar que tenemos alguna forma de procesar imágenes (sharp o jimp)
  let canProcessImages = false;
  try {
    await getSharp();
    canProcessImages = true;
    console.log('✅ Usando sharp para procesar imágenes');
  } catch (sharpError) {
    try {
      await import('jimp');
      canProcessImages = true;
      console.log('✅ Usando jimp como alternativa para procesar imágenes (sharp no disponible)');
    } catch (jimpError) {
      console.error('❌ Ni sharp ni jimp están disponibles. No se pueden generar embeddings de imágenes.');
      console.error('   Instala jimp: npm install jimp');
      console.error('   O intenta arreglar sharp: npm run fix-sharp');
      return { processed: 0, errors: 0 };
    }
  }

  const db = await getDb();
  const newsCollection = db.collection(COLLECTIONS.NOTICIAS);
  const imageEmbeddingsCollection = db.collection(COLLECTIONS.IMAGE_EMBEDDINGS);

  // Obtener noticias con imágenes que no tienen embeddings
  const newsWithImageEmbeddings = await imageEmbeddingsCollection.distinct('id_doc');
  // Obtener noticias con imágenes (filtrar después porque $size no acepta $gt)
  const allNews = await newsCollection.find({
    _id: { $nin: newsWithImageEmbeddings },
    imagenes: { $exists: true, $type: 'array' }
  }).toArray();
  
  const news = allNews.filter(n => Array.isArray(n.imagenes) && n.imagenes.length > 0);

  console.log(`📊 Generando embeddings para ${news.length} imágenes...`);

  let processed = 0;
  let errors = 0;

  for (const article of news) {
    try {
      const imageUrl = article.imagenes?.[0];
      
      if (!imageUrl) {
        continue;
      }

      let embedding;
      try {
        embedding = await generateImageEmbedding(imageUrl);
      } catch (embedError) {
        console.error(`❌ Error generando embedding para imagen ${imageUrl?.substring(0, 50)}...:`, embedError.message);
        errors++;
        continue; // Saltar esta imagen y continuar
      }

      // Validar que el embedding tiene la dimensión correcta antes de guardar
      if (!Array.isArray(embedding) || embedding.length !== 512) {
        console.error(`❌ Embedding de imagen inválido para noticia ${article._id}: dimensión ${embedding?.length || 0}, esperado 512`);
        errors++;
        continue;
      }

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
 * Búsqueda vectorial pura usando cosine similarity
 * Solo busca por similitud vectorial, sin filtros tradicionales
 * Usa los embeddings generados en Python/Colab
 */
export async function vectorSearch(embedding, limit = 5) {
  const db = await getDb();
  const embeddingsCollection = db.collection(COLLECTIONS.EMBEDDINGS);

  // Obtener todos los embeddings (generados en Python/Colab)
  const allEmbeddings = await embeddingsCollection.find({}).toArray();

  if (allEmbeddings.length === 0) {
    return [];
  }

  // Validar dimensión del embedding de consulta
  const queryDim = embedding.length;
  if (!queryDim || queryDim === 0) {
    throw new Error(`El embedding de la consulta está vacío o es inválido`);
  }

  // Filtrar embeddings con dimensiones incorrectas y calcular similitud
  const similarities = allEmbeddings
    .filter(doc => {
      const docEmbedding = doc.embedding;
      if (!Array.isArray(docEmbedding)) {
        console.warn(`⚠️ Embedding inválido para doc ${doc.id_doc}: no es un array`);
        return false;
      }
      if (docEmbedding.length !== queryDim) {
        console.warn(`⚠️ Embedding con dimensión incorrecta para doc ${doc.id_doc}: esperado ${queryDim}, encontrado ${docEmbedding.length}`);
        return false;
      }
      return true;
    })
    .map(doc => {
      const docEmbedding = doc.embedding;
      try {
        const similarity = cosineSimilarity(embedding, docEmbedding);
        return { ...doc, similarity };
      } catch (error) {
        console.error(`Error calculando similitud para doc ${doc.id_doc}:`, error.message);
        return null;
      }
    })
    .filter(result => result !== null);

  // Ordenar por similitud y tomar los top N
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, limit);
}

/**
 * Calcula similitud coseno entre dos vectores
 */
function cosineSimilarity(vecA, vecB) {
  // Validar que son arrays
  if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
    throw new Error(`Los vectores deben ser arrays. vecA: ${typeof vecA}, vecB: ${typeof vecB}`);
  }

  // Validar dimensiones
  if (vecA.length !== vecB.length) {
    throw new Error(`Los vectores deben tener la misma dimensión. vecA: ${vecA.length}, vecB: ${vecB.length}`);
  }

  // Validar que no están vacíos
  if (vecA.length === 0) {
    throw new Error('Los vectores no pueden estar vacíos');
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

