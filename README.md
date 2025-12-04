# Sistema RAG NoSQL con MongoDB

Proyecto Final - Bases de Datos No Relacionales

Sistema de Recuperación y Generación Aumentada (RAG) utilizando MongoDB como base de datos principal, con soporte para búsqueda vectorial, procesamiento multimodal (texto e imágenes) y generación de respuestas contextualizadas mediante LLM.

## 🚀 Características

- ✅ **Búsqueda Híbrida**: Combina filtros tradicionales (idioma, fecha, categoría) con búsqueda vectorial por similitud semántica
- ✅ **Pipeline RAG Completo**: Recuperación de contexto + generación de respuestas con Groq LLM
- ✅ **Procesamiento Multimodal**: Embeddings de texto e imágenes usando modelos transformer
- ✅ **API REST**: Endpoints documentados para búsqueda y generación RAG
- ✅ **Modelado NoSQL Flexible**: Estrategias de embedding vs referencing según el caso de uso

## 📋 Requisitos Previos

- Node.js 18+ 
- MongoDB Atlas (cluster M0 gratuito) o MongoDB 7.0+ local
- Cuenta en [Groq](https://console.groq.com/) para API key (gratuita)
- Cuenta en [NewsData.io](https://newsdata.io/) para API key (gratuita)

## 🛠️ Instalación

1. **Clonar el repositorio**
```bash
git clone <tu-repo-url>
cd rag-mongodb-js
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp env.example .env
```

O crea manualmente el archivo `.env` basándote en `env.example`.

Edita el archivo `.env` con tus credenciales:
```env
MONGODB_URI=mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/...
DB_NAME=rag_noticias
NEWS_API_KEY=tu_api_key_de_newsdata
GROQ_API_KEY=tu_api_key_de_groq
GROQ_MODEL=llama-3.1-8b-instant
PORT=3000
```

## 📦 Estructura del Proyecto

```
rag-mongodb-js/
├── README.md
├── package.json
├── .env.example
├── server.js                 # Servidor Express principal
├── src/
│   ├── config/
│   │   └── mongo.js         # Configuración de MongoDB
│   ├── routes/
│   │   └── rag.routes.js    # Rutas de la API
│   ├── services/
│   │   ├── embeddings.service.js  # Generación de embeddings
│   │   ├── news.service.js        # Gestión de noticias
│   │   └── groq.service.js        # Integración con Groq LLM
│   └── scripts/
│       ├── loadNews.js            # Cargar noticias desde API
│       ├── generateEmbeddings.js  # Generar embeddings
│       └── setupIndexes.js       # Configurar índices
└── docs/
    └── informe_final.pdf
```

## 🚀 Uso

### 1. Cargar Datos Iniciales

```bash
# Cargar noticias desde NewsData.io API
npm run load-news

# Opcional: especificar número de páginas
node src/scripts/loadNews.js 20
```

### 2. Generar Embeddings

```bash
# Generar embeddings de texto e imágenes
npm run generate-embeddings

# Solo texto
node src/scripts/generateEmbeddings.js text

# Solo imágenes
node src/scripts/generateEmbeddings.js image
```

### 3. Configurar Índices

```bash
npm run setup-indexes
```

### 4. Iniciar el Servidor

```bash
# Modo producción
npm start

# Modo desarrollo (con auto-reload)
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

## 📡 Endpoints de la API

### `GET /health`
Verifica el estado del servidor.

**Respuesta:**
```json
{
  "status": "ok",
  "message": "Sistema RAG MongoDB funcionando correctamente",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### `POST /api/search`
Búsqueda híbrida: combina filtros tradicionales con búsqueda vectorial.

**Request:**
```json
{
  "query": "inteligencia artificial",
  "filters": {
    "idioma": "es",
    "fechaDesde": "2024-01-01"
  },
  "limit": 5
}
```

**Response:**
```json
{
  "query": "inteligencia artificial",
  "filters": { "idioma": "es" },
  "results": [
    {
      "_id": "...",
      "titulo": "...",
      "contenido_texto": "...",
      "similarity": 0.85
    }
  ],
  "count": 5,
  "response_time_ms": 234
}
```

### `POST /api/rag`
Pipeline RAG completo: búsqueda + generación de respuesta con LLM.

**Request:**
```json
{
  "query": "Explica las principales tendencias en energías renovables según los documentos",
  "filters": {
    "idioma": "es"
  },
  "limit": 5
}
```

**Response:**
```json
{
  "query": "Explica las principales tendencias...",
  "answer": "Según los documentos analizados...",
  "context_documents": [
    {
      "_id": "...",
      "titulo": "...",
      "similarity": 0.89
    }
  ],
  "metadata": {
        "model": "llama-3.1-8b-instant",
    "tokens_used": 450,
    "documents_used": 5,
    "total_time_ms": 1234
  }
}
```

### `GET /api/news`
Lista noticias con filtros opcionales.

**Query Parameters:**
- `idioma` (opcional): Filtrar por idioma
- `categoria` (opcional): Filtrar por categoría
- `fechaDesde` (opcional): Fecha desde (ISO format)
- `fechaHasta` (opcional): Fecha hasta (ISO format)
- `limit` (default: 10): Número de resultados
- `skip` (default: 0): Paginación

**Ejemplo:**
```
GET /api/news?idioma=es&limit=20
```

### `GET /api/news/:id`
Obtiene una noticia específica por ID.

### `GET /api/stats`
Estadísticas del sistema (total de noticias, embeddings, cobertura, etc.)

## 🧪 Casos de Prueba Obligatorios

### 1. Búsqueda Semántica
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "¿Qué documentos hablan sobre sostenibilidad ambiental?"}'
```

### 2. Filtros Híbridos
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "tecnología",
    "filters": {
      "idioma": "en",
      "fechaDesde": "2024-01-01"
    }
  }'
```

### 3. Búsqueda Multimodal (Imágenes)
*Nota: Requiere embeddings de imágenes generados*

### 4. RAG Complejo
```bash
curl -X POST http://localhost:3000/api/rag \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explica las principales tendencias en energías renovables según los documentos",
    "limit": 5
  }'
```

## 🗄️ Modelado de Datos

### Colección: `noticias`
```javascript
{
  _id: ObjectId,
  titulo: String,
  autor: [String],
  fecha: String (ISO),
  idioma: String,
  categoria: String,
  contenido_texto: String,
  imagenes: [String], // URLs
  fuente: String,
  link_original: String,
  createdAt: Date
}
```

### Colección: `embeddings`
```javascript
{
  _id: ObjectId,
  id_doc: ObjectId, // Referencia a noticias
  embedding: [Number], // Vector 384-dimensional
  tipo: "texto",
  createdAt: Date
}
```

### Colección: `image_embeddings`
```javascript
{
  _id: ObjectId,
  id_doc: ObjectId,
  image_url: String,
  embedding: [Number], // Vector 512-dimensional (CLIP)
  tipo: "imagen",
  createdAt: Date
}
```

### Estrategias de Modelado

- **Embedded**: Metadatos pequeños, historial de consultas
- **Referenced**: Imágenes grandes, documentos compartidos
- **Híbrido**: Documento principal con referencias a embeddings separados

## 🔍 Índices Configurados

1. **Índice Compuesto**: `{ fecha: 1, idioma: 1 }` - Optimiza consultas por fecha e idioma
2. **Índice de Texto**: `{ contenido_texto: "text", titulo: "text" }` - Búsqueda de texto completo
3. **Índice en idioma**: `{ idioma: 1 }` - Filtros rápidos por idioma
4. **Índice en id_doc**: Para búsquedas rápidas de embeddings

### Configurar Atlas Vector Search (Opcional)

Para usar `$vectorSearch` nativo de MongoDB Atlas:

1. Ve a tu cluster en MongoDB Atlas
2. Selecciona "Atlas Search" o "Vector Search"
3. Crea un índice en la colección `embeddings`:
   - Campo: `embedding`
   - Tipo: `knnVector`
   - Dimensiones: `384` (para paraphrase-multilingual-MiniLM-L12-v2)
   - Similarity: `cosine`

## 🧩 Tecnologías Utilizadas

- **MongoDB**: Base de datos NoSQL
- **Express.js**: Framework web para Node.js
- **@xenova/transformers**: Modelos transformer para embeddings
- **Groq API**: LLM para generación de respuestas (Llama 3.1)
- **Sharp**: Procesamiento de imágenes
- **Axios**: Cliente HTTP

## 📊 Métricas y Rendimiento

Usa el endpoint `/api/stats` para ver:
- Total de noticias
- Cobertura de embeddings (texto e imágenes)
- Distribución por idioma
- Estadísticas generales

## 🐛 Solución de Problemas

Para problemas comunes, consulta el documento **[SOLUCION_PROBLEMAS.md](SOLUCION_PROBLEMAS.md)** que incluye:

- ❌ Error de validación de esquema
- ❌ Error de Sharp en Windows
- ⚠️ No hay resultados en búsquedas
- ❌ Errores de configuración de API keys
- Y más...

### Problemas Comunes Rápidos

**Error: "Document failed validation"**
```bash
npm run remove-schema-validation
```

**Error: "Could not load sharp module" (Windows)**
```bash
npm run fix-sharp
```

**No hay resultados en búsquedas**
- Verifica estadísticas: `curl http://localhost:3000/api/stats`
- Genera embeddings: `npm run generate-embeddings`
- Carga noticias: `npm run load-news`

## 📝 Próximos Pasos

- [ ] Implementar búsqueda multimodal (texto ↔ imagen)
- [ ] Configurar Atlas Vector Search nativo
- [ ] Agregar caché de embeddings
- [ ] Implementar paginación mejorada
- [ ] Agregar tests unitarios
- [ ] Documentación Swagger/OpenAPI

## 📄 Licencia

MIT

## 👤 Autor

Proyecto Final - Bases de Datos No Relacionales

---

**Nota**: Este proyecto es parte de un trabajo académico. Asegúrate de cumplir con los términos de uso de las APIs externas utilizadas.

