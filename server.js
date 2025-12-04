import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ragRoutes from './src/routes/rag.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static('public'));

// Routes
app.use('/api', ragRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Sistema RAG MongoDB funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint - servir frontend
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📚 Endpoints disponibles:`);
  console.log(`   GET  /health`);
  console.log(`   POST /api/search - Búsqueda híbrida`);
  console.log(`   POST /api/rag - Pipeline RAG completo`);
  console.log(`   GET  /api/news - Listar noticias`);
});

