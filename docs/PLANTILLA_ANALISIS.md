# Documento de Análisis - Sistema RAG NoSQL

## 1. Universo del Discurso

### 1.1 Descripción del Dominio
[Describe el dominio del problema: sistema de noticias, búsqueda semántica, etc.]

### 1.2 Entidades Principales
- **Noticias**: Artículos de noticias con título, contenido, imágenes, metadatos
- **Embeddings**: Representaciones vectoriales de texto e imágenes
- **Consultas**: Búsquedas semánticas de usuarios
- **Respuestas RAG**: Respuestas generadas usando contexto recuperado

### 1.3 Actores del Sistema
- **Usuarios**: Realizan consultas semánticas
- **Sistema RAG**: Procesa consultas, recupera contexto, genera respuestas
- **LLM (Groq)**: Genera respuestas contextualizadas

---

## 2. Análisis de Requerimientos

### 2.1 Requerimientos Funcionales
- RF1: Sistema debe almacenar noticias con estructura flexible
- RF2: Sistema debe generar embeddings de texto e imágenes
- RF3: Sistema debe realizar búsqueda semántica vectorial
- RF4: Sistema debe combinar filtros tradicionales con búsqueda vectorial
- RF5: Sistema debe generar respuestas usando RAG con LLM
- RF6: Sistema debe soportar búsqueda multimodal (texto ↔ imagen)

### 2.2 Requerimientos No Funcionales
- RNF1: Tiempo de respuesta < 2 segundos para búsquedas
- RNF2: Escalabilidad para 100+ documentos
- RNF3: Disponibilidad mediante API REST
- RNF4: Uso de tecnologías gratuitas (Groq, MongoDB Atlas M0)

---

## 3. Justificación de Decisiones de Modelado NoSQL

### 3.1 ¿Por qué NoSQL (MongoDB)?

**Ventajas para este proyecto**:
1. **Flexibilidad de esquema**: Las noticias tienen campos variables (algunas tienen imágenes, otras no)
2. **Documentos anidados**: Metadatos pueden variar sin afectar estructura
3. **Búsqueda vectorial nativa**: Atlas Vector Search integrado
4. **Escalabilidad horizontal**: Fácil escalar con sharding
5. **JSON nativo**: Fácil integración con APIs y frontend

**Desventajas vs. Relacional**:
1. Menos estructura rígida (pero es una ventaja aquí)
2. No hay joins nativos (pero usamos referencias)
3. Menos herramientas de análisis tradicionales

### 3.2 Comparación con Enfoque Relacional

| Aspecto | NoSQL (MongoDB) | Relacional (PostgreSQL) |
|---------|----------------|------------------------|
| **Esquema** | Flexible, documentos JSON | Rígido, tablas normalizadas |
| **Búsqueda Vectorial** | Nativa (Atlas Vector Search) | Requiere extensión (pgvector) |
| **Embeddings** | Colección separada, fácil de escalar | Tabla separada, requiere joins |
| **Metadatos Variables** | Fácil (campos opcionales) | Difícil (muchas columnas NULL) |
| **Escalabilidad** | Horizontal (sharding) | Vertical (más hardware) |
| **Consultas Complejas** | Aggregation Pipeline | SQL complejo |

**Conclusión**: NoSQL es mejor para este caso porque:
- Necesitamos flexibilidad para metadatos variables
- Búsqueda vectorial es nativa
- Estructura de documentos se alinea con datos de noticias
- Escalabilidad horizontal es importante

---

## 4. Comparación Embedding vs. Referencing

### 4.1 Estrategia de Embedding

**Cuándo usar**: Datos pequeños que se consultan frecuentemente junto con el documento principal.

**Ejemplos en el proyecto**:
- ❌ **NO usamos embedding** para embeddings vectoriales (son grandes, 384 dimensiones)
- ✅ **SÍ usamos embedding** para metadatos pequeños (fecha, idioma, categoría)

**Ventajas**:
- Consultas más rápidas (todo en un documento)
- Menos operaciones de lectura
- Atomicidad de datos

**Desventajas**:
- Documentos más grandes
- Duplicación si datos se comparten

### 4.2 Estrategia de Referencing

**Cuándo usar**: Datos grandes o compartidos entre múltiples documentos.

**Ejemplos en el proyecto**:
- ✅ **SÍ usamos referencing** para embeddings vectoriales (colección separada)
- ✅ **SÍ usamos referencing** para imágenes (URLs, no almacenadas en MongoDB)

**Ventajas**:
- Documentos principales más pequeños
- Reutilización de datos compartidos
- Separación de concerns

**Desventajas**:
- Requiere operaciones adicionales ($lookup)
- Posible inconsistencia si no se maneja bien

### 4.3 Estrategia Híbrida (Usada en el Proyecto)

**Estructura implementada**:

```javascript
// Colección: noticias (documento principal)
{
  _id: ObjectId,
  titulo: "string",           // Embedded (pequeño, siempre presente)
  contenido_texto: "string",    // Embedded (parte del documento)
  idioma: "string",            // Embedded (metadato pequeño)
  fecha: "string",             // Embedded (metadato pequeño)
  imagenes: ["url1", "url2"],  // Referenced (URLs, no almacenadas)
  // ...
}

// Colección: embeddings (referenciada)
{
  _id: ObjectId,
  id_doc: ObjectId,            // Referencia a noticias
  embedding: [384 números],    // Vector grande, separado
  tipo: "texto"
}

// Colección: image_embeddings (referenciada)
{
  _id: ObjectId,
  id_doc: ObjectId,            // Referencia a noticias
  image_url: "string",         // Referencia a imagen externa
  embedding: [512 números],    // Vector grande, separado
  tipo: "imagen"
}
```

**Justificación**:
1. **Metadatos embedded**: Consultas rápidas por idioma, fecha, categoría
2. **Embeddings referenced**: Vectores grandes (384-512 dimensiones) separados para:
   - Mantener documentos principales pequeños
   - Facilitar búsqueda vectorial eficiente
   - Permitir actualización independiente
3. **Imágenes referenced**: URLs en lugar de almacenar binarios (más eficiente)

### 4.4 Comparación de Rendimiento

| Operación | Embedding | Referencing | Híbrido (Actual) |
|-----------|-----------|-------------|------------------|
| **Leer noticia completa** | 1 lectura | 2-3 lecturas | 2 lecturas (noticia + embedding) |
| **Búsqueda por metadatos** | Muy rápido | Rápido | Muy rápido |
| **Búsqueda vectorial** | Lento (documentos grandes) | Rápido | Rápido |
| **Actualizar embedding** | Lento (documento completo) | Rápido | Rápido |

**Conclusión**: La estrategia híbrida optimiza para:
- Consultas frecuentes (metadatos embedded)
- Búsqueda vectorial eficiente (embeddings referenced)
- Mantenimiento flexible (separación de concerns)

---

## 5. Decisiones de Diseño Adicionales

### 5.1 Índices

**Índices creados**:
1. **Compuesto {fecha: 1, idioma: 1}**: Optimiza filtros híbridos
2. **Texto {contenido_texto: "text", titulo: "text"}**: Búsqueda de texto completo
3. **Simple {idioma: 1}**: Filtros rápidos por idioma
4. **Vectorial (Atlas)**: Búsqueda por similitud (384 dimensiones)

**Justificación**: Cada índice optimiza un tipo de consulta específica.

### 5.2 Normalización vs. Denormalización

**Decisión**: Denormalización controlada
- Metadatos duplicados en documento principal (fecha, idioma)
- Embeddings separados (evita documentos muy grandes)
- URLs de imágenes (no almacenamos binarios)

---

## 6. Conclusiones

El modelo NoSQL elegido optimiza para:
1. ✅ Flexibilidad de esquema
2. ✅ Búsqueda vectorial eficiente
3. ✅ Consultas híbridas rápidas
4. ✅ Escalabilidad horizontal
5. ✅ Integración con LLM para RAG

La estrategia híbrida (embedding + referencing) balancea:
- Rendimiento de consultas
- Tamaño de documentos
- Mantenibilidad del código

---

**Nota**: Este documento debe convertirse a PDF para la entrega.

