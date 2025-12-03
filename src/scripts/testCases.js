import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';

const testCases = [
  {
    name: 'Caso 1: Búsqueda Semántica',
    description: '¿Qué documentos hablan sobre sostenibilidad ambiental?',
    endpoint: '/search',
    data: {
      query: '¿Qué documentos hablan sobre sostenibilidad ambiental?',
      limit: 5
    }
  },
  {
    name: 'Caso 2: Filtros Híbridos',
    description: 'Artículos en inglés sobre tecnología publicados en 2024',
    endpoint: '/search',
    data: {
      query: 'tecnología',
      filters: { 
        idioma: 'en', 
        fechaDesde: '2024-01-01' 
      },
      limit: 5
    }
  },
  {
    name: 'Caso 4: RAG Complejo',
    description: 'Explica las principales tendencias en energías renovables',
    endpoint: '/rag',
    data: {
      query: 'Explica las principales tendencias en energías renovables según los documentos',
      limit: 5
    }
  }
];

async function runTests() {
  console.log('🧪 Ejecutando Casos de Prueba Obligatorios\n');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      console.log(`\n📋 ${testCase.name}`);
      console.log(`   Consulta: ${testCase.description}`);
      
      const startTime = Date.now();
      const response = await axios.post(`${BASE_URL}${testCase.endpoint}`, testCase.data, {
        timeout: 30000
      });
      const elapsed = Date.now() - startTime;

      const result = response.data;
      const count = result.count || result.context_documents?.length || result.results?.length || 0;
      const time = result.response_time_ms || result.metadata?.total_time_ms || elapsed;

      console.log(`   ✅ Éxito:`);
      console.log(`      - Resultados: ${count}`);
      console.log(`      - Tiempo: ${time}ms`);
      
      if (testCase.endpoint === '/rag' && result.answer) {
        console.log(`      - Respuesta generada: ${result.answer.substring(0, 100)}...`);
        console.log(`      - Tokens usados: ${result.metadata?.tokens_used || 'N/A'}`);
      }

      passed++;
    } catch (error) {
      console.log(`   ❌ Error:`);
      console.log(`      ${error.response?.data?.error || error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Resumen:`);
  console.log(`   ✅ Exitosos: ${passed}`);
  console.log(`   ❌ Fallidos: ${failed}`);
  console.log(`   Total: ${passed + failed}\n`);
}

// Verificar que el servidor esté corriendo
async function checkServer() {
  try {
    await axios.get(BASE_URL.replace('/api', '/health'), { timeout: 5000 });
    return true;
  } catch (error) {
    console.error('❌ Error: El servidor no está corriendo en', BASE_URL.replace('/api', ''));
    console.error('   Ejecuta: npm start\n');
    return false;
  }
}

async function main() {
  const serverOk = await checkServer();
  if (!serverOk) {
    process.exit(1);
  }
  await runTests();
}

main().catch(console.error);

