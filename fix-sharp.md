# Solución para el Error de Sharp en Windows

Si encuentras el error `ERR_DLOPEN_FAILED` con `sharp`, sigue estos pasos:

## Solución Rápida

```bash
# 1. Desinstalar sharp
npm uninstall sharp

# 2. Limpiar caché
npm cache clean --force

# 3. Reinstalar sharp con la plataforma correcta
npm install --include=optional sharp

# O específicamente para Windows x64:
npm install --os=win32 --cpu=x64 sharp
```

## Solución Alternativa (Si la anterior no funciona)

```bash
# 1. Eliminar node_modules y package-lock.json
rm -rf node_modules package-lock.json

# 2. Reinstalar todo
npm install

# 3. Reinstalar sharp específicamente
npm install --include=optional sharp
```

## Si Sharp Sigue Fallando

El código ahora está configurado para que `sharp` sea opcional. Si no puedes instalarlo:

1. **Para embeddings de texto**: Funciona sin problemas (no necesita sharp)
2. **Para embeddings de imágenes**: Necesitarás instalar sharp o usar una alternativa

### Opción: Usar solo embeddings de texto

Si no puedes instalar sharp, puedes generar solo embeddings de texto:

```bash
node src/scripts/generateEmbeddings.js text
```

Esto generará embeddings solo para texto, que es suficiente para el proyecto básico.

## Verificar Instalación

```bash
# Verificar versión de sharp
npm ls sharp

# Probar importación
node -e "import('sharp').then(() => console.log('✅ Sharp OK')).catch(e => console.error('❌ Error:', e.message))"
```

## Notas

- Sharp es necesario solo para procesar imágenes
- Los embeddings de texto funcionan sin sharp
- El proyecto puede funcionar sin embeddings de imágenes si es necesario

