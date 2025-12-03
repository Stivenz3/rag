import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GROQ_API_BASE = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

/**
 * Genera respuesta usando Groq LLM con contexto RAG
 */
export async function generateRAGResponse(query, contextDocuments) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY no está configurada en las variables de entorno');
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
    console.error('Error llamando a Groq API:', error.response?.data || error.message);
    throw new Error(`Error generando respuesta con LLM: ${error.message}`);
  }
}

/**
 * Genera respuesta simple sin contexto (para pruebas)
 */
export async function generateSimpleResponse(query) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY no está configurada');
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
    console.error('Error llamando a Groq API:', error.response?.data || error.message);
    throw new Error(`Error generando respuesta: ${error.message}`);
  }
}

