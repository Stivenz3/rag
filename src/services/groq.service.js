import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GROQ_API_BASE = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Modelo actualizado: llama-3.1-70b-versatile fue descontinuado
// Usar llama-3.1-8b-instant (rápido) o llama-3.3-70b-versatile (más potente)
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

/**
 * Genera respuesta usando Groq LLM con contexto RAG
 */
export async function generateRAGResponse(query, contextDocuments) {
  // Validar API key
  if (!GROQ_API_KEY || GROQ_API_KEY === 'your_groq_api_key_here' || GROQ_API_KEY.trim() === '') {
    throw new Error('GROQ_API_KEY no está configurada o es inválida. Por favor, configura tu API key de Groq en el archivo .env. Obtén una en: https://console.groq.com/');
  }
  
  // Validar formato de API key (debe empezar con gsk_)
  if (!GROQ_API_KEY.startsWith('gsk_')) {
    throw new Error('GROQ_API_KEY tiene un formato inválido. Debe empezar con "gsk_". Verifica tu API key en: https://console.groq.com/');
  }

  // Construir contexto a partir de los documentos recuperados
  const contextText = contextDocuments
    .map((doc, idx) => {
      const titulo = doc.titulo || 'Sin título';
      const contenido = doc.contenido_texto || '';
      const idioma = doc.idioma || 'unknown';
      const fecha = doc.fecha || 'Fecha desconocida';
      
      return `[Documento ${idx + 1}]
Título: ${titulo}
Idioma: ${idioma}
Fecha: ${fecha}
Contenido: ${contenido.substring(0, 500)}...`;
    })
    .join('\n\n');

  // Prompt optimizado para RAG
  const systemPrompt = `Eres un asistente experto que responde preguntas basándote únicamente en el contexto proporcionado. 
Si la información no está en el contexto, indica que no tienes esa información disponible.
Responde de manera clara, concisa y en el mismo idioma que la pregunta.`;

  const userPrompt = `Contexto proporcionado:
${contextText}

Pregunta del usuario: ${query}

Por favor, responde la pregunta basándote en el contexto proporcionado. Si necesitas información adicional que no está en el contexto, indícalo claramente.`;

  try {
    const response = await axios.post(
      GROQ_API_BASE,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const answer = response.data.choices[0]?.message?.content || 'No se pudo generar una respuesta';
    
    return {
      answer,
      model: GROQ_MODEL,
      tokens_used: response.data.usage?.total_tokens || 0,
      context_documents_count: contextDocuments.length
    };
  } catch (error) {
    // Manejo mejorado de errores
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        console.error('❌ Error 401: Autenticación fallida con Groq API');
        console.error('   Verifica que tu GROQ_API_KEY sea correcta en el archivo .env');
        console.error('   Obtén una nueva API key en: https://console.groq.com/');
        throw new Error('Error de autenticación con Groq API. Verifica que tu GROQ_API_KEY sea válida en el archivo .env. Obtén una nueva en: https://console.groq.com/');
      } else if (status === 429) {
        throw new Error('Límite de tasa excedido en Groq API. Intenta más tarde.');
      } else if (status === 400) {
        throw new Error(`Error en la solicitud a Groq API: ${data?.error?.message || 'Solicitud inválida'}`);
      } else {
        throw new Error(`Error en Groq API (${status}): ${data?.error?.message || error.message}`);
      }
    } else if (error.request) {
      throw new Error('No se pudo conectar con Groq API. Verifica tu conexión a internet.');
    } else {
      throw new Error(`Error generando respuesta con LLM: ${error.message}`);
    }
  }
}

/**
 * Genera respuesta simple sin contexto (para pruebas)
 */
export async function generateSimpleResponse(query) {
  // Validar API key
  if (!GROQ_API_KEY || GROQ_API_KEY === 'your_groq_api_key_here' || GROQ_API_KEY.trim() === '') {
    throw new Error('GROQ_API_KEY no está configurada o es inválida. Por favor, configura tu API key de Groq en el archivo .env. Obtén una en: https://console.groq.com/');
  }
  
  // Validar formato de API key
  if (!GROQ_API_KEY.startsWith('gsk_')) {
    throw new Error('GROQ_API_KEY tiene un formato inválido. Debe empezar con "gsk_". Verifica tu API key en: https://console.groq.com/');
  }

  try {
    const response = await axios.post(
      GROQ_API_BASE,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'user', content: query }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0]?.message?.content || 'No se pudo generar una respuesta';
  } catch (error) {
    // Manejo mejorado de errores
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        throw new Error('Error de autenticación con Groq API. Verifica que tu GROQ_API_KEY sea válida en el archivo .env. Obtén una nueva en: https://console.groq.com/');
      } else if (status === 429) {
        throw new Error('Límite de tasa excedido en Groq API. Intenta más tarde.');
      } else {
        throw new Error(`Error en Groq API (${status}): ${data?.error?.message || error.message}`);
      }
    } else if (error.request) {
      throw new Error('No se pudo conectar con Groq API. Verifica tu conexión a internet.');
    } else {
      throw new Error(`Error generando respuesta: ${error.message}`);
    }
  }
}

