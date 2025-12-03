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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema RAG con MongoDB',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      search: 'POST /api/search',
      rag: 'POST /api/rag',
      news: 'GET /api/news'
    }
  });
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

