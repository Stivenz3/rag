# Solución de Problemas Comunes

## ❌ Error: "Document failed validation"

**Problema**: MongoDB está rechazando documentos por validación de esquema.

**Solución**:

```bash
# Remover la validación de esquema
npm run remove-schema-validation
```

Luego intenta cargar las noticias de nuevo:

```bash
npm run load-news
```

**Nota**: El código ahora inserta documentos uno por uno y maneja errores de validación, pero es mejor remover la validación si no la necesitas.

---

## ❌ Error: "Could not load the sharp module" (Windows)

**Problema**: El módulo `sharp` no se puede cargar en Windows.

**Solución Rápida**:

```bash
npm run fix-sharp
```

**Solución Manual**:

```bash
# 1. Desinstalar sharp
npm uninstall sharp

# 2. Limpiar caché
npm cache clean --force

# 3. Reinstalar
npm install --include=optional sharp
```

**Si sigue fallando**:

El código ahora está configurado para que `sharp` sea opcional. Puedes:

1. **Usar solo embeddings de texto** (recomendado para empezar):
   ```bash
   node src/scripts/generateEmbeddings.js text
   ```

2. **Instalar sharp manualmente con la plataforma específica**:
   ```bash
   npm install --os=win32 --cpu=x64 sharp
   ```

3. **Reinstalar todas las dependencias**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm install --include=optional sharp
   ```

**Nota**: Sharp solo es necesario para procesar imágenes. Los embeddings de texto funcionan sin él.

---

## ⚠️ No hay resultados en las búsquedas

**Problema**: Las búsquedas retornan resultados vacíos.

**Verificaciones**:

1. **Verificar que hay datos**:
   ```bash
   curl http://localhost:3000/api/stats
   ```

2. **Verificar que hay embeddings**:
   - Debe mostrar `total_text_embeddings > 0`

3. **Si no hay embeddings, generarlos**:
   ```bash
   npm run generate-embeddings
   ```

4. **Si no hay noticias, cargarlas**:
   ```bash
   npm run load-news
   ```

---

## ❌ Error: "GROQ_API_KEY no está configurada"

**Problema**: Falta la API key de Groq.

**Solución**:

1. Obtén tu API key en https://console.groq.com/
2. Agrega al archivo `.env`:
   ```env
   GROQ_API_KEY=gsk_tu_api_key_aqui
   ```
3. Reinicia el servidor

---

## ❌ Error: "MONGODB_URI no está definida"

**Problema**: Falta la URI de conexión a MongoDB.

**Solución**:

1. Verifica que el archivo `.env` existe
2. Verifica que contiene:
   ```env
   MONGODB_URI=mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/...
   ```
3. Asegúrate de que no hay espacios extra alrededor del `=`
4. Reinicia el servidor

---

## ❌ Error de conexión a MongoDB

**Problema**: No se puede conectar a MongoDB Atlas.

**Verificaciones**:

1. **Verificar que tu IP está en la whitelist**:
   - Ve a MongoDB Atlas → Network Access
   - Agrega tu IP actual o `0.0.0.0/0` para desarrollo

2. **Verificar la connection string**:
   - Debe tener el formato correcto
   - Usuario y contraseña deben ser correctos
   - No debe tener espacios

3. **Verificar que el cluster está activo**:
   - Ve a MongoDB Atlas → Clusters
   - Asegúrate de que el cluster está corriendo

---

## ⚠️ Los modelos tardan mucho en descargarse

**Problema**: La primera vez que generas embeddings, los modelos se descargan (puede tardar 5-10 minutos).

**Solución**: 
- Es normal, solo pasa la primera vez
- Los modelos se guardan en caché para usos futuros
- Asegúrate de tener buena conexión a internet

---

## ❌ Error: "Cannot find module '@xenova/transformers'"

**Problema**: Falta instalar dependencias.

**Solución**:

```bash
npm install
```

---

## ❌ Error: "Could not locate file: model_quantized.onnx"

**Problema**: El modelo no se puede descargar desde Hugging Face.

**Solución**:

✅ **Ya está corregido en el código**. El modelo ahora usa `Xenova/all-MiniLM-L6-v2` que está disponible.

Si aún tienes problemas:

1. **Verifica conexión a internet** (el modelo se descarga automáticamente)
2. **Limpiar caché** si la descarga falló parcialmente (elimina la carpeta `.cache`)
3. **Reinstalar transformers**:
   ```bash
   npm uninstall @xenova/transformers
   npm install @xenova/transformers@latest
   ```

Ver documentación completa en: `SOLUCION_MODELO_EMBEDDINGS.md`

---

## ⚠️ Búsquedas son lentas

**Problema**: Las búsquedas vectoriales son lentas.

**Soluciones**:

1. **Configurar índices**:
   ```bash
   npm run setup-indexes
   ```

2. **Configurar Atlas Vector Search** (recomendado):
   - Ve a MongoDB Atlas → Vector Search
   - Crea un índice vectorial en la colección `embeddings`
   - Ver instrucciones en `CONFIGURACION.md`

3. **Reducir el número de documentos**:
   - Usa `limit` más pequeño en las búsquedas

---

## 📊 Verificar Estado del Sistema

Para verificar que todo está funcionando:

```bash
# 1. Health check
curl http://localhost:3000/health

# 2. Estadísticas
curl http://localhost:3000/api/stats

# 3. Probar búsqueda
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "tecnología", "limit": 3}'
```

---

## 🆘 Si Nada Funciona

1. **Revisa los logs del servidor** para ver errores específicos
2. **Verifica las variables de entorno** en `.env`
3. **Reinstala dependencias**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
4. **Verifica la versión de Node.js** (debe ser 18+):
   ```bash
   node --version
   ```

---

¿Problema no listado? Revisa los logs del servidor o crea un issue en el repositorio.

