# ============================================
# RAG SYSTEM - COLAB
# Genera embeddings de texto e imágenes
# Procesa todas las imágenes sin saltarse ninguna
# ============================================

# === SECCIÓN 1: INSTALACIÓN DE DEPENDENCIAS ===
# Ejecutar UNA SOLA VEZ en Colab (copiar y pegar en celda separada)

"""
!pip install --quiet pymongo dnspython requests pillow tqdm transformers sentencepiece regex
!pip install --quiet torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
!pip install --quiet flask flask-cors scikit-learn
print("Dependencias instaladas correctamente.")
"""

# === SECCIÓN 2: CONFIGURACIÓN INICIAL ===

import requests
import time
import warnings
warnings.filterwarnings('ignore')

from pymongo import MongoClient
from PIL import Image
import io
import numpy as np
from tqdm import tqdm
from transformers import AutoTokenizer, AutoModel, CLIPProcessor, CLIPModel
import torch
from sklearn.metrics.pairwise import cosine_similarity

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configuración de conexión
API_KEY = "pub_ee77445946384c0399a132e6a8df2caa"
USER = "zzarzarr12"
PASSWORD = "zarza2025"
CLUSTER = "cluster0.dyprncd.mongodb.net"

uri = f"mongodb+srv://zzarzarr12:zarza2025@cluster0.dyprncd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
client = MongoClient(uri)

db = client["rag_noticias"]
collection = db["noticias"]

print("Conectado a MongoDB Atlas correctamente.")

# === SECCIÓN 3: CARGAR NOTICIAS ===

def limpiar_todo():
    """Limpia todas las colecciones y prepara las categorías"""
    print("Limpiando todas las colecciones...")
    
    collection.delete_many({})
    print("Colección 'noticias' limpiada")
    
    db.embeddings.delete_many({})
    print("Colección 'embeddings' limpiada")
    
    db.image_embeddings.delete_many({})
    print("Colección 'image_embeddings' limpiada")
    
    db.comentarios.delete_many({})
    print("Colección 'comentarios' limpiada")
    
    db.categorias.delete_many({})
    print("Colección 'categorias' limpiada")
    
    categorias = [
        {"_id": 1, "nombre": "tecnología", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 2, "nombre": "deportes", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 3, "nombre": "economía", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 4, "nombre": "política", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 5, "nombre": "ciencia", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 6, "nombre": "salud", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 7, "nombre": "entretenimiento", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 8, "nombre": "internacional", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 9, "nombre": "educación", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()},
        {"_id": 10, "nombre": "negocios", "total_noticias": 0, "idiomas": [], "createdAt": time.time(), "updatedAt": time.time()}
    ]
    
    db.categorias.insert_many(categorias)
    print(f"{len(categorias)} categorías insertadas")
    
    print("\nBase de datos limpiada y lista para cargar nuevas noticias")
    return categorias

def mapear_categoria_api_a_local(categoria_api):
    """Mapea las categorías de la API a nuestras categorías locales"""
    mapeo = {
        "technology": "tecnología",
        "sports": "deportes",
        "business": "economía",
        "politics": "política",
        "science": "ciencia",
        "health": "salud",
        "entertainment": "entretenimiento",
        "world": "internacional",
        "education": "educación",
        "finance": "negocios",
        "economy": "economía",
        "tech": "tecnología"
    }
    
    categoria_lower = categoria_api.lower() if categoria_api else ""
    
    if categoria_lower in mapeo:
        return mapeo[categoria_lower]
    
    for key, value in mapeo.items():
        if key in categoria_lower or categoria_lower in key:
            return value
    
    return None

def cargar_noticias_por_categorias(noticias_por_categoria=10):
    """Carga noticias de cada categoría predefinida
    
    Estrategia: Carga noticias sin filtro y las asigna a categorías basándose en su categoría original
    """
    url = "https://newsdata.io/api/1/news"
    noticias_cargadas_por_categoria = {cat: 0 for cat in [
        "tecnología", "deportes", "economía", "política", "ciencia",
        "salud", "entretenimiento", "internacional", "educación", "negocios"
    ]}
    
    mapeo_categorias = {
        "technology": "tecnología",
        "tech": "tecnología",
        "sports": "deportes",
        "business": "economía",
        "finance": "negocios",
        "economy": "economía",
        "politics": "política",
        "science": "ciencia",
        "health": "salud",
        "entertainment": "entretenimiento",
        "world": "internacional",
        "education": "educación"
    }
    
    print(f"Cargando {noticias_por_categoria} noticias de cada categoría...")
    print("Estrategia: Cargando noticias y asignándolas a categorías según su contenido\n")
    
    total_necesario = noticias_por_categoria * 10
    noticias_cargadas_total = 0
    next_page = None
    max_iteraciones = 100
    
    print("Verificando conexión con la API...")
    try:
        test_params = {"apikey": API_KEY}
        test_response = requests.get(url, params=test_params, timeout=30)
        if test_response.status_code != 200:
            print(f"Error: La API devolvió código {test_response.status_code}")
            print(f"Respuesta: {test_response.text[:300]}")
            return 0, noticias_cargadas_por_categoria
        test_data = test_response.json()
        if test_data.get("status") != "success":
            print(f"Error en API: {test_data.get('message', 'Unknown error')}")
            return 0, noticias_cargadas_por_categoria
        print("Conexión con API exitosa\n")
        next_page = test_data.get("nextPage")
    except Exception as e:
        print(f"Error conectando con API: {e}")
        return 0, noticias_cargadas_por_categoria
    
    iteracion = 0
    while noticias_cargadas_total < total_necesario and iteracion < max_iteraciones:
        if all(count >= noticias_por_categoria for count in noticias_cargadas_por_categoria.values()):
            print(f"\nYa tenemos suficientes noticias en todas las categorías!")
            break
        
        params = {"apikey": API_KEY}
        if next_page:
            params["page"] = next_page
        
        try:
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code != 200:
                print(f"Error HTTP {response.status_code} en iteración {iteracion + 1}")
                try:
                    error_data = response.json()
                    print(f"Mensaje: {error_data.get('message', 'Sin mensaje')}")
                except:
                    pass
                break
            
            data = response.json()
            
            if data.get("status") != "success":
                print(f"Status no exitoso en iteración {iteracion + 1}: {data.get('message', 'Unknown error')}")
                break
            
            resultados = data.get("results", [])
            if not resultados:
                print(f"No hay más resultados")
                break
            
            next_page = data.get("nextPage")
            print(f"\nIteración {iteracion + 1}: {len(resultados)} resultados encontrados")
            
            sin_imagen = 0
            sin_contenido = 0
            sin_categoria_valida = 0
            duplicados = 0
            
            for noticia in resultados:
                if all(count >= noticias_por_categoria for count in noticias_cargadas_por_categoria.values()):
                    break
                
                try:
                    imagenes = []
                    if isinstance(noticia.get("image_url"), list):
                        imagenes = [img for img in noticia.get("image_url") if img and img.strip()]
                    elif noticia.get("image_url"):
                        img_url = noticia.get("image_url")
                        if img_url and img_url.strip():
                            imagenes = [img_url]
                    
                    titulo = noticia.get("title", "").strip()
                    contenido = (noticia.get("content", "") or noticia.get("description", "")).strip()
                    
                    if not titulo or not contenido:
                        sin_contenido += 1
                        continue
                    
                    if not imagenes:
                        sin_imagen += 1
                        continue
                    
                    categoria_api = None
                    if isinstance(noticia.get("category"), list) and noticia.get("category"):
                        categoria_api = noticia.get("category")[0].lower()
                    elif noticia.get("category"):
                        categoria_api = noticia.get("category", "").lower()
                    
                    categoria_local = mapeo_categorias.get(categoria_api)
                    
                    if not categoria_local:
                        titulo_lower = titulo.lower()
                        contenido_lower = contenido.lower()
                        
                        if any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["tech", "tecnología", "software", "ai", "inteligencia artificial"]):
                            categoria_local = "tecnología"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["sport", "deporte", "fútbol", "football"]):
                            categoria_local = "deportes"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["business", "negocio", "empresa", "comercio"]):
                            categoria_local = "negocios"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["política", "político", "gobierno", "presidente"]):
                            categoria_local = "política"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["science", "ciencia", "investigación", "estudio"]):
                            categoria_local = "ciencia"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["health", "salud", "médico", "hospital"]):
                            categoria_local = "salud"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["entertainment", "entretenimiento", "cine", "película"]):
                            categoria_local = "entretenimiento"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["world", "internacional", "global", "país"]):
                            categoria_local = "internacional"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["education", "educación", "escuela", "universidad"]):
                            categoria_local = "educación"
                        elif any(palabra in titulo_lower or palabra in contenido_lower for palabra in ["economía", "económico", "finanza", "mercado"]):
                            categoria_local = "economía"
                    
                    if not categoria_local:
                        sin_categoria_valida += 1
                        continue
                    
                    if noticias_cargadas_por_categoria[categoria_local] >= noticias_por_categoria:
                        continue
                    
                    doc = {
                        "titulo": titulo,
                        "autor": noticia.get("creator", []) if isinstance(noticia.get("creator"), list) else ([noticia.get("creator")] if noticia.get("creator") else []),
                        "fecha": noticia.get("pubDate", ""),
                        "idioma": noticia.get("language", "unknown"),
                        "categoria": categoria_local,
                        "contenido_texto": contenido,
                        "imagenes": imagenes,
                        "fuente": noticia.get("source_id", ""),
                        "link_original": noticia.get("link", ""),
                        "createdAt": time.time()
                    }
                    
                    existe = collection.find_one({"link_original": doc["link_original"]})
                    if existe:
                        duplicados += 1
                        continue
                    
                    collection.insert_one(doc)
                    noticias_cargadas_por_categoria[categoria_local] += 1
                    noticias_cargadas_total += 1
                    print(f"   [{categoria_local}] {noticias_cargadas_por_categoria[categoria_local]}/{noticias_por_categoria}: {titulo[:55]}...")
                    
                except Exception as e:
                    print(f"   Error procesando noticia: {e}")
                    continue
            
            if sin_imagen > 0 or sin_contenido > 0 or sin_categoria_valida > 0:
                print(f"   Omitidas: {sin_imagen} sin imagen, {sin_contenido} sin contenido, {sin_categoria_valida} sin categoría válida, {duplicados} duplicados")
            
        except requests.exceptions.RequestException as e:
            print(f"   Error de conexión: {e}")
            break
        except Exception as e:
            print(f"   Error: {e}")
            break
        
        if not next_page:
            print(f"\nNo hay más páginas disponibles")
            break
        
        iteracion += 1
        time.sleep(1)
    
    total = sum(noticias_cargadas_por_categoria.values())
    print(f"\n{'='*60}")
    print(f"RESUMEN FINAL")
    print(f"{'='*60}")
    for cat, count in sorted(noticias_cargadas_por_categoria.items()):
        print(f"   {cat}: {count} noticias")
    print(f"\nTotal de noticias cargadas: {total}")
    
    return total, noticias_cargadas_por_categoria

def completar_categorias_faltantes(noticias_por_categoria=10):
    """Completa las categorías que no tienen suficientes noticias"""
    url = "https://newsdata.io/api/1/news"
    
    categorias_actuales = {}
    for cat in ["tecnología", "deportes", "economía", "política", "ciencia", 
                "salud", "entretenimiento", "internacional", "educación", "negocios"]:
        count = collection.count_documents({"categoria": cat})
        categorias_actuales[cat] = count
        if count < noticias_por_categoria:
            print(f"{cat}: {count}/{noticias_por_categoria} noticias")
    
    print(f"\nBuscando noticias para completar categorías faltantes...\n")
    
    palabras_clave = {
        "educación": ["education", "educación", "escuela", "universidad", "estudiante", "aprendizaje"],
        "negocios": ["business", "negocio", "empresa", "startup", "comercio", "emprendimiento"],
        "ciencia": ["science", "ciencia", "investigación", "estudio científico", "descubrimiento"],
        "salud": ["health", "salud", "médico", "hospital", "medicina", "tratamiento"],
        "política": ["politics", "política", "gobierno", "presidente", "elección", "partido político"]
    }
    
    next_page = None
    iteracion = 0
    max_iteraciones = 20
    
    while iteracion < max_iteraciones:
        faltantes = {cat: noticias_por_categoria - categorias_actuales[cat] 
                     for cat in categorias_actuales 
                     if categorias_actuales[cat] < noticias_por_categoria}
        
        if not faltantes:
            print("\nTodas las categorías están completas!")
            break
        
        params = {"apikey": API_KEY}
        if next_page:
            params["page"] = next_page
        
        try:
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code == 429:
                print(f"\nRate limit alcanzado. Esperando 60 segundos...")
                time.sleep(60)
                continue
            
            if response.status_code != 200:
                break
            
            data = response.json()
            if data.get("status") != "success":
                break
            
            resultados = data.get("results", [])
            if not resultados:
                break
            
            next_page = data.get("nextPage")
            
            for noticia in resultados:
                faltantes = {cat: noticias_por_categoria - categorias_actuales[cat] 
                           for cat in categorias_actuales 
                           if categorias_actuales[cat] < noticias_por_categoria}
                if not faltantes:
                    break
                
                try:
                    imagenes = []
                    if isinstance(noticia.get("image_url"), list):
                        imagenes = [img for img in noticia.get("image_url") if img and img.strip()]
                    elif noticia.get("image_url"):
                        img_url = noticia.get("image_url")
                        if img_url and img_url.strip():
                            imagenes = [img_url]
                    
                    titulo = noticia.get("title", "").strip()
                    contenido = (noticia.get("content", "") or noticia.get("description", "")).strip()
                    
                    if not titulo or not contenido or not imagenes:
                        continue
                    
                    titulo_lower = titulo.lower()
                    contenido_lower = contenido.lower()
                    texto_completo = titulo_lower + " " + contenido_lower
                    
                    categoria_encontrada = None
                    for cat, palabras in palabras_clave.items():
                        if categorias_actuales[cat] >= noticias_por_categoria:
                            continue
                        if any(palabra in texto_completo for palabra in palabras):
                            categoria_encontrada = cat
                            break
                    
                    if not categoria_encontrada:
                        continue
                    
                    existe = collection.find_one({"link_original": noticia.get("link", "")})
                    if existe:
                        continue
                    
                    doc = {
                        "titulo": titulo,
                        "autor": noticia.get("creator", []) if isinstance(noticia.get("creator"), list) else ([noticia.get("creator")] if noticia.get("creator") else []),
                        "fecha": noticia.get("pubDate", ""),
                        "idioma": noticia.get("language", "unknown"),
                        "categoria": categoria_encontrada,
                        "contenido_texto": contenido,
                        "imagenes": imagenes,
                        "fuente": noticia.get("source_id", ""),
                        "link_original": noticia.get("link", ""),
                        "createdAt": time.time()
                    }
                    
                    collection.insert_one(doc)
                    categorias_actuales[categoria_encontrada] += 1
                    print(f"   [{categoria_encontrada}] {categorias_actuales[categoria_encontrada]}/{noticias_por_categoria}: {titulo[:55]}...")
                    
                except Exception as e:
                    continue
            
            iteracion += 1
            time.sleep(2)
            
        except Exception as e:
            print(f"   Error: {e}")
            break
    
    print(f"\nEstado final de categorías:")
    for cat, count in sorted(categorias_actuales.items()):
        print(f"   {cat}: {count} noticias")
    
    return categorias_actuales

# === SECCIÓN 4: CONFIGURACIÓN DE ÍNDICES ===

def configurar_indices():
    """Configura los índices de MongoDB según los requisitos del proyecto
    
    REQUISITOS DEL PROYECTO:
    - Índice compuesto en { "fecha": 1, "idioma": 1 }
    - Índice de texto en "contenido_texto"
    - Índice knnVector en embeddings (configurar manualmente en Atlas UI)
    """
    print("Configurando índices de MongoDB según requisitos del proyecto...\n")
    
    # REQUISITO 1: Índice compuesto en { "fecha": 1, "idioma": 1 }
    try:
        collection.create_index([("fecha", 1), ("idioma", 1)])
        print("REQUISITO 1: Índice compuesto creado: { fecha: 1, idioma: 1 }")
    except Exception as e:
        if "already exists" in str(e) or "duplicate" in str(e).lower():
            print("REQUISITO 1: Índice compuesto ya existe: { fecha: 1, idioma: 1 }")
        else:
            print(f"REQUISITO 1: Error creando índice compuesto: {e}")
    
    # REQUISITO 2: Índice de texto en "contenido_texto"
    # Verificar si ya existe un índice de texto que incluya contenido_texto
    indices_existentes = list(collection.list_indexes())
    tiene_indice_texto_contenido = False
    
    for idx in indices_existentes:
        if "text" in str(idx.get("key", {})):
            weights = idx.get("weights", {})
            if "contenido_texto" in weights:
                tiene_indice_texto_contenido = True
                print(f"REQUISITO 2: Índice de texto ya existe que incluye 'contenido_texto': {idx.get('name')}")
                print(f"   Campos indexados: {list(weights.keys())}")
                break
    
    if not tiene_indice_texto_contenido:
        try:
            # Crear índice de texto solo en contenido_texto (requisito del proyecto)
            collection.create_index([("contenido_texto", "text")])
            print("REQUISITO 2: Índice de texto creado en 'contenido_texto'")
        except Exception as e:
            if "already exists" in str(e) or "duplicate" in str(e).lower():
                print("REQUISITO 2: Índice de texto ya existe en 'contenido_texto'")
            else:
                print(f"REQUISITO 2: Error creando índice de texto: {e}")
    
    # Índices adicionales para optimización (no requeridos pero recomendados)
    try:
        collection.create_index([("idioma", 1)])
        print("Índice adicional: simple en 'idioma'")
    except Exception as e:
        if "already exists" not in str(e) and "duplicate" not in str(e).lower():
            print(f"   (índice en idioma ya existe o error: {e})")
    
    try:
        collection.create_index([("categoria", 1)])
        print("Índice adicional: simple en 'categoria'")
    except Exception as e:
        if "already exists" not in str(e) and "duplicate" not in str(e).lower():
            print(f"   (índice en categoria ya existe o error: {e})")
    
    # Índices para colecciones de embeddings
    try:
        db.embeddings.create_index([("id_doc", 1)])
        print("Índice creado en id_doc (embeddings)")
    except Exception as e:
        if "already exists" not in str(e) and "duplicate" not in str(e).lower():
            print(f"   (índice en embeddings ya existe o error: {e})")
    
    try:
        db.image_embeddings.create_index([("id_doc", 1)])
        print("Índice creado en id_doc (image_embeddings)")
    except Exception as e:
        if "already exists" not in str(e) and "duplicate" not in str(e).lower():
            print(f"   (índice en image_embeddings ya existe o error: {e})")
    
    # Índices para otras colecciones
    try:
        db.comentarios.create_index([("id_noticia", 1)])
        print("Índice creado en id_noticia (comentarios)")
    except Exception as e:
        if "already exists" not in str(e) and "duplicate" not in str(e).lower():
            print(f"   (índice en comentarios ya existe o error: {e})")
    
    try:
        db.categorias.create_index([("nombre", 1)])
        print("Índice creado en nombre (categorias)")
    except Exception as e:
        if "already exists" not in str(e) and "duplicate" not in str(e).lower():
            print(f"   (índice en categorias ya existe o error: {e})")
    
    print("\n" + "="*60)
    print("REQUISITO 3: Índice knnVector (configurar manualmente en Atlas)")
    print("="*60)
    print("Para usar Atlas Vector Search nativo, debes configurar el índice vectorial desde MongoDB Atlas UI:")
    print("\nPASOS EN ATLAS UI:")
    print("1. Ve a tu cluster en MongoDB Atlas")
    print("2. En el menú lateral, selecciona 'Atlas Search'")
    print("3. Haz clic en 'Create Search Index'")
    print("4. Selecciona 'JSON Editor' como método de configuración")
    print("5. Selecciona la base de datos 'rag_noticias' y colección 'embeddings'")
    print("6. Pega esta configuración JSON para la colección 'embeddings':")
    print("\n" + "-"*60)
    print("CONFIGURACIÓN PARA COLECCIÓN 'embeddings':")
    print("-"*60)
    print("""{
  "mappings": {
    "dynamic": true,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 384,
        "similarity": "cosine"
      }
    }
  }
}""")
    print("\n" + "-"*60)
    print("7. Guarda el índice con nombre: 'vector_index_embeddings'")
    print("\n8. Repite el proceso para la colección 'image_embeddings' con esta configuración:")
    print("\n" + "-"*60)
    print("CONFIGURACIÓN PARA COLECCIÓN 'image_embeddings':")
    print("-"*60)
    print("""{
  "mappings": {
    "dynamic": true,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 512,
        "similarity": "cosine"
      }
    }
  }
}""")
    print("\n" + "-"*60)
    print("9. Guarda el índice con nombre: 'vector_index_image_embeddings'")
    print("\nNOTA IMPORTANTE:")
    print("  - Los índices vectoriales pueden tardar varios minutos en construirse")
    print("  - Actualmente el sistema usa búsqueda vectorial en código (cosine similarity)")
    print("  - El índice knnVector permite usar $vectorSearch nativo de MongoDB Atlas")
    print("  - Una vez creados, podrás usar $vectorSearch en aggregation pipelines")
    
    print("\nConfiguración de índices completada")

def listar_indices():
    """Lista todos los índices creados en las colecciones"""
    print("Índices en colección 'noticias':")
    indices_noticias = collection.list_indexes()
    for idx in indices_noticias:
        print(f"   - {idx['name']}: {idx.get('key', {})}")
    
    print("\nÍndices en colección 'embeddings':")
    indices_embeddings = db.embeddings.list_indexes()
    for idx in indices_embeddings:
        print(f"   - {idx['name']}: {idx.get('key', {})}")
    
    print("\nÍndices en colección 'image_embeddings':")
    indices_image = db.image_embeddings.list_indexes()
    for idx in indices_image:
        print(f"   - {idx['name']}: {idx.get('key', {})}")
    
    print("\nÍndices en colección 'comentarios':")
    indices_comentarios = db.comentarios.list_indexes()
    for idx in indices_comentarios:
        print(f"   - {idx['name']}: {idx.get('key', {})}")
    
    print("\nÍndices en colección 'categorias':")
    indices_categorias = db.categorias.list_indexes()
    for idx in indices_categorias:
        print(f"   - {idx['name']}: {idx.get('key', {})}")

# === SECCIÓN 5: GENERACIÓN DE EMBEDDINGS DE TEXTO ===

def generar_embedding_texto(texto, tokenizer, modelo):
    """Genera embedding de texto usando el modelo multilingüe"""
    if not texto or not texto.strip():
        return None
    
    entradas = tokenizer(texto, return_tensors='pt', truncation=True, padding=True, max_length=512)
    with torch.no_grad():
        salida = modelo(**entradas)
    embedding = salida.last_hidden_state.mean(dim=1).squeeze().numpy()
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding.tolist()

def generar_embeddings_texto():
    """Genera embeddings de texto para todos los artículos"""
    print("Generando embeddings de texto...")
    
    modelo_id = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    print(f"Cargando modelo: {modelo_id}")
    tokenizer = AutoTokenizer.from_pretrained(modelo_id)
    modelo = AutoModel.from_pretrained(modelo_id)
    print("Modelo de texto cargado")
    
    db.embeddings.delete_many({})
    print("Colección 'embeddings' limpiada")
    
    articulos = list(collection.find({}, {"_id": 1, "titulo": 1, "contenido_texto": 1}))
    print(f"Procesando {len(articulos)} artículos...")
    
    total = 0
    for art in tqdm(articulos, desc="Generando embeddings"):
        texto_base = (art.get("titulo") or "") + " " + (art.get("contenido_texto") or "")
        if not texto_base.strip():
            continue
        
        emb = generar_embedding_texto(texto_base, tokenizer, modelo)
        if emb and len(emb) > 0:
            db.embeddings.insert_one({
                "id_doc": art["_id"],
                "embedding": emb,
                "tipo": "texto",
                "createdAt": time.time()
            })
            total += 1
    
    print(f"Embeddings de texto generados: {total} documentos")
    return total

# === SECCIÓN 6: GENERACIÓN DE EMBEDDINGS DE IMÁGENES ===

def descargar_imagen(url, max_intentos=3):
    """Descarga una imagen con reintentos"""
    for intento in range(max_intentos):
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
            response = requests.get(url, timeout=30, headers=headers, stream=True, verify=False)
            response.raise_for_status()
            
            if len(response.content) < 1024:
                raise ValueError("Imagen demasiado pequeña o vacía")
            
            content_type = response.headers.get('content-type', '').lower()
            if content_type and not any(ct in content_type for ct in ['image/', 'jpeg', 'jpg', 'png', 'webp', 'gif']):
                pass
            
            img_data = response.content
            img = Image.open(io.BytesIO(img_data))
            
            img.verify()
            img = Image.open(io.BytesIO(img_data))
            
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')
            elif img.mode == 'L':
                img = img.convert('RGB')
            
            img.thumbnail((224, 224), Image.Resampling.LANCZOS)
            
            if img.size != (224, 224):
                new_img = Image.new('RGB', (224, 224), (255, 255, 255))
                x = (224 - img.size[0]) // 2
                y = (224 - img.size[1]) // 2
                new_img.paste(img, (x, y))
                img = new_img
            else:
                img = img.resize((224, 224), Image.Resampling.LANCZOS)
            
            return img
        except Exception as e:
            if intento < max_intentos - 1:
                time.sleep(2 ** intento)
                continue
            else:
                raise Exception(f"Error descargando imagen después de {max_intentos} intentos: {str(e)}")

def generar_embedding_imagen(url_imagen, processor, modelo_clip):
    """Genera embedding de imagen usando CLIP"""
    try:
        img = descargar_imagen(url_imagen)
        inputs = processor(images=img, return_tensors="pt")
        with torch.no_grad():
            image_features = modelo_clip.get_image_features(**inputs)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        embedding = image_features.squeeze().numpy().tolist()
        return embedding
    except Exception as e:
        raise Exception(f"Error generando embedding de imagen: {e}")

def generar_embeddings_imagenes(reanudar=True, limite_errores_consecutivos=5):
    """Genera embeddings de todas las imágenes
    
    Args:
        reanudar: Si True, continúa desde donde se quedó (no procesa imágenes ya embedadas)
        limite_errores_consecutivos: Si hay N errores consecutivos, pausa para revisar
    """
    print("Generando embeddings de imágenes...")
    print("IMPORTANTE: Este proceso puede tardar varias horas. NO cerrar Colab.")
    print("Puedes interrumpir (Ctrl+C) y reanudar después - no perderás progreso\n")
    
    print("Cargando modelo CLIP...")
    modelo_clip_id = "openai/clip-vit-base-patch32"
    processor = CLIPProcessor.from_pretrained(modelo_clip_id)
    modelo_clip = CLIPModel.from_pretrained(modelo_clip_id)
    print("Modelo CLIP cargado\n")
    
    if not reanudar:
        db.image_embeddings.delete_many({})
        print("Colección 'image_embeddings' limpiada\n")
    
    noticias = list(collection.find({
        "imagenes": {"$exists": True, "$ne": [], "$type": "array"}
    }, {"_id": 1, "imagenes": 1}))
    
    noticias_con_imagenes = [n for n in noticias if n.get("imagenes") and len(n.get("imagenes", [])) > 0]
    
    total_imagenes = sum(len(n.get("imagenes", [])) for n in noticias_con_imagenes)
    ya_procesadas = db.image_embeddings.count_documents({})
    
    print(f"Encontradas {len(noticias_con_imagenes)} noticias con {total_imagenes} imágenes en total")
    print(f"Ya procesadas: {ya_procesadas} imágenes")
    print(f"Pendientes: {total_imagenes - ya_procesadas} imágenes\n")
    
    total_procesadas = 0
    total_errores = 0
    total_omitidas = 0
    errores_consecutivos = 0
    errores_detallados = []
    
    for noticia in tqdm(noticias_con_imagenes, desc="Procesando noticias"):
        doc_id = noticia["_id"]
        imagenes = noticia.get("imagenes", [])
        
        for url_imagen in imagenes:
            if not url_imagen or not isinstance(url_imagen, str) or not url_imagen.startswith('http'):
                total_omitidas += 1
                continue
            
            if reanudar:
                existe = db.image_embeddings.find_one({"id_doc": doc_id, "image_url": url_imagen})
                if existe:
                    total_procesadas += 1
                    continue
            
            try:
                embedding = generar_embedding_imagen(url_imagen, processor, modelo_clip)
                
                if not embedding or len(embedding) != 512:
                    raise ValueError(f"Embedding inválido: dimensión {len(embedding) if embedding else 0}, esperada 512")
                
                db.image_embeddings.insert_one({
                    "id_doc": doc_id,
                    "image_url": url_imagen,
                    "embedding": embedding,
                    "tipo": "imagen",
                    "createdAt": time.time()
                })
                
                total_procesadas += 1
                errores_consecutivos = 0
                
            except Exception as e:
                total_errores += 1
                errores_consecutivos += 1
                error_msg = f"Doc: {doc_id}, URL: {url_imagen[:60]}... Error: {str(e)[:100]}"
                errores_detallados.append(error_msg)
                
                if total_errores % 10 == 0:
                    print(f"\n{total_errores} errores acumulados. Último: {error_msg}")
                
                if errores_consecutivos >= limite_errores_consecutivos:
                    print(f"\n{errores_consecutivos} errores consecutivos. Continuando...")
                    errores_consecutivos = 0
                
                continue
    
    print(f"\n{'='*60}")
    print(f"PROCESO COMPLETADO")
    print(f"{'='*60}")
    print(f"Imágenes procesadas exitosamente: {total_procesadas}")
    print(f"Errores: {total_errores}")
    print(f"Omitidas (URLs inválidas): {total_omitidas}")
    print(f"Total procesado en esta sesión: {total_procesadas + total_errores + total_omitidas}")
    total_final = db.image_embeddings.count_documents({})
    print(f"Total acumulado en BD: {total_final} imágenes")
    print(f"Cobertura: {(total_final / total_imagenes * 100):.1f}%" if total_imagenes > 0 else "N/A")
    
    if errores_detallados and len(errores_detallados) <= 20:
        print(f"\nErrores encontrados:")
        for i, err in enumerate(errores_detallados, 1):
            print(f"   {i}. {err}")
    elif errores_detallados:
        print(f"\nPrimeros 10 errores:")
        for i, err in enumerate(errores_detallados[:10], 1):
            print(f"   {i}. {err}")
    
    return total_procesadas, total_errores

# === SECCIÓN 7: BÚSQUEDA SEMÁNTICA (TEXTO) ===

def buscar_documentos_similares_texto(consulta, limite=5):
    """Busca documentos similares usando embeddings de texto
    
    Retorna resultados con: imagen, título, categoría, link (listo para frontend)
    """
    modelo_id = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    tokenizer = AutoTokenizer.from_pretrained(modelo_id)
    modelo = AutoModel.from_pretrained(modelo_id)
    
    emb_consulta = generar_embedding_texto(consulta, tokenizer, modelo)
    if not emb_consulta:
        print("No se pudo generar embedding de la consulta")
        return []
    
    emb_consulta = np.array(emb_consulta).reshape(1, -1)
    
    embeddings_docs = list(db.embeddings.find({}, {"id_doc": 1, "embedding": 1}))
    
    if not embeddings_docs:
        print("No hay embeddings de texto guardados")
        return []
    
    ids, vectores = [], []
    for doc in embeddings_docs:
        emb = doc.get("embedding")
        if isinstance(emb, list) and len(emb) == len(emb_consulta[0]):
            ids.append(doc["id_doc"])
            vectores.append(emb)
    
    if not vectores:
        print("No se encontraron vectores válidos")
        return []
    
    vectores = np.array(vectores)
    similitudes = cosine_similarity(emb_consulta, vectores)[0]
    top_idx = np.argsort(similitudes)[::-1][:limite]
    
    resultados = []
    for idx in top_idx:
        doc_id = ids[idx]
        articulo = collection.find_one({"_id": doc_id})
        if articulo:
            resultados.append({
                "id": str(articulo["_id"]),
                "imagen": articulo.get("imagenes", [""])[0] if articulo.get("imagenes") else "",
                "titulo": articulo.get("titulo", ""),
                "categoria": articulo.get("categoria", ""),
                "link": articulo.get("link_original", ""),
                "similitud": float(similitudes[idx]),
                "idioma": articulo.get("idioma", ""),
                "fecha": articulo.get("fecha", "")
            })
    
    return resultados

# === SECCIÓN 8: BÚSQUEDA SEMÁNTICA (IMÁGENES) ===

def buscar_documentos_similares_imagen(url_imagen_consulta, limite=5):
    """Busca documentos similares usando embeddings de imágenes"""
    modelo_clip_id = "openai/clip-vit-base-patch32"
    processor = CLIPProcessor.from_pretrained(modelo_clip_id)
    modelo_clip = CLIPModel.from_pretrained(modelo_clip_id)
    
    try:
        embedding_consulta = generar_embedding_imagen(url_imagen_consulta, processor, modelo_clip)
        embedding_consulta = np.array(embedding_consulta).reshape(1, -1)
    except Exception as e:
        print(f"Error procesando imagen de consulta: {e}")
        return []
    
    embeddings_docs = list(db.image_embeddings.find({}, {"id_doc": 1, "embedding": 1, "image_url": 1}))
    
    if not embeddings_docs:
        print("No hay embeddings de imágenes guardados")
        return []
    
    ids, urls, vectores = [], [], []
    for doc in embeddings_docs:
        emb = doc.get("embedding")
        if isinstance(emb, list) and len(emb) == 512:
            ids.append(doc["id_doc"])
            urls.append(doc.get("image_url", ""))
            vectores.append(emb)
    
    if not vectores:
        print("No se encontraron vectores válidos")
        return []
    
    vectores = np.array(vectores)
    similitudes = cosine_similarity(embedding_consulta, vectores)[0]
    top_idx = np.argsort(similitudes)[::-1][:limite]
    
    resultados = []
    for idx in top_idx:
        doc_id = ids[idx]
        articulo = collection.find_one({"_id": doc_id})
        if articulo:
            resultados.append({
                "doc": articulo,
                "similitud": float(similitudes[idx]),
                "image_url": urls[idx]
            })
    
    return resultados

# === SECCIÓN 9: BÚSQUEDA HÍBRIDA (TEXTO + IMAGEN) ===

def buscar_hibrida(consulta_texto=None, url_imagen=None, limite=5, peso_texto=0.6, peso_imagen=0.4):
    """Búsqueda híbrida combinando texto e imagen"""
    resultados_texto = []
    resultados_imagen = []
    
    if consulta_texto:
        resultados_texto = buscar_documentos_similares_texto(consulta_texto, limite=limite * 2)
    
    if url_imagen:
        resultados_imagen = buscar_documentos_similares_imagen(url_imagen, limite=limite * 2)
    
    scores = {}
    for res in resultados_texto:
        doc_id = str(res["doc"]["_id"])
        if doc_id not in scores:
            scores[doc_id] = {"doc": res["doc"], "score": 0, "sim_texto": 0, "sim_imagen": 0}
        scores[doc_id]["score"] += res["similitud"] * peso_texto
        scores[doc_id]["sim_texto"] = res["similitud"]
    
    for res in resultados_imagen:
        doc_id = str(res["doc"]["_id"])
        if doc_id not in scores:
            scores[doc_id] = {"doc": res["doc"], "score": 0, "sim_texto": 0, "sim_imagen": 0}
        scores[doc_id]["score"] += res["similitud"] * peso_imagen
        scores[doc_id]["sim_imagen"] = res["similitud"]
    
    resultados_ordenados = sorted(scores.values(), key=lambda x: x["score"], reverse=True)[:limite]
    
    return resultados_ordenados

# === SECCIÓN 10: VISUALIZACIÓN DE RESULTADOS ===

from IPython.display import display, HTML

def mostrar_resultados(resultados, titulo="Resultados de búsqueda"):
    """Muestra resultados en formato HTML (listo para frontend)"""
    html = f"""
    <div style='margin-bottom:20px;'>
        <h3>{titulo}</h3>
    </div>
    """
    
    for i, res in enumerate(resultados):
        imagen = res.get("imagen", "")
        titulo_doc = res.get("titulo", "(Sin título)")
        categoria = res.get("categoria", "")
        link = res.get("link", "#")
        similitud = res.get("similitud", 0)
        idioma = res.get("idioma", "")
        
        if imagen:
            img_tag = f"<img src='{imagen}' width='250' style='border-radius:8px; margin-bottom:10px;' onerror='this.style.display=\"none\"'>"
        else:
            img_tag = "<div style='width:250px;height:150px;background:#eee;text-align:center;line-height:150px;border-radius:8px;color:#555; margin-bottom:10px;'>Sin imagen</div>"
        
        html += f"""
        <div style='margin:10px 0; padding:15px; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.1); background:#f9f9f9;'>
            {img_tag}
            <h4>{i+1}. {titulo_doc}</h4>
            <p><strong>Categoría:</strong> {categoria} &nbsp; | &nbsp; {idioma} &nbsp; | &nbsp; Similitud: {similitud:.4f}</p>
            <a href='{link}' target='_blank' style='color:#0066cc; text-decoration:none;'>Ver fuente completa</a>
        </div>
        """
    
    display(HTML(html))

# === SECCIÓN 11: POBLAR CATEGORÍAS Y COMENTARIOS ===

def poblar_categorias():
    """Pobla la colección de categorías desde las noticias existentes"""
    print("Poblando categorías desde noticias existentes...")
    
    categorias_stats = list(collection.aggregate([
        {"$match": {"categoria": {"$exists": True, "$ne": "", "$ne": None}}},
        {"$group": {
            "_id": "$categoria",
            "count": {"$sum": 1},
            "idiomas": {"$addToSet": "$idioma"}
        }},
        {"$sort": {"count": -1}}
    ]))
    
    db.categorias.delete_many({})
    
    categorias_docs = []
    for cat in categorias_stats:
        categorias_docs.append({
            "nombre": cat["_id"],
            "total_noticias": cat["count"],
            "idiomas": cat["idiomas"],
            "createdAt": time.time(),
            "updatedAt": time.time()
        })
    
    if categorias_docs:
        db.categorias.insert_many(categorias_docs)
    
    print(f"{len(categorias_docs)} categorías pobladas")
    return categorias_docs

def crear_comentario_ejemplo(id_noticia, autor="Usuario Ejemplo", contenido="Este es un comentario de ejemplo"):
    """Crea un comentario de ejemplo para una noticia"""
    comentario = {
        "id_noticia": id_noticia,
        "autor": autor,
        "contenido": contenido,
        "fecha": time.time(),
        "createdAt": time.time(),
        "likes": 0,
        "dislikes": 0,
        "reportado": False
    }
    db.comentarios.insert_one(comentario)
    return comentario

def poblar_comentarios_ejemplo(num_comentarios=10):
    """Pobla comentarios de ejemplo para las noticias más recientes"""
    print(f"Creando {num_comentarios} comentarios de ejemplo...")
    
    noticias = list(collection.find().sort("fecha", -1).limit(num_comentarios))
    
    comentarios_creados = 0
    for noticia in noticias:
        comentario = crear_comentario_ejemplo(
            noticia["_id"],
            f"Usuario_{comentarios_creados + 1}",
            f"Interesante artículo sobre {noticia.get('titulo', 'este tema')[:50]}..."
        )
        comentarios_creados += 1
    
    print(f"{comentarios_creados} comentarios creados")
    return comentarios_creados

# === SECCIÓN 12: API FLASK PARA FRONTEND ===

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

@app.route('/api/search', methods=['POST'])
def search():
    """Búsqueda híbrida (texto e imagen)"""
    try:
        data = request.json
        consulta_texto = data.get("query")
        url_imagen = data.get("image_url")
        limite = data.get("limit", 5)
        
        if not consulta_texto and not url_imagen:
            return jsonify({"error": "Se requiere 'query' o 'image_url'"}), 400
        
        resultados = buscar_hibrida(
            consulta_texto=consulta_texto,
            url_imagen=url_imagen,
            limite=limite
        )
        
        resultados_formateados = []
        for res in resultados:
            doc = res["doc"]
            resultados_formateados.append({
                "id": str(doc["_id"]),
                "titulo": doc.get("titulo", ""),
                "contenido": doc.get("contenido_texto", "")[:200] + "...",
                "idioma": doc.get("idioma", ""),
                "fecha": doc.get("fecha", ""),
                "imagenes": doc.get("imagenes", []),
                "link_original": doc.get("link_original", ""),
                "similitud": res.get("score", res.get("similitud", 0)),
                "sim_texto": res.get("sim_texto", 0),
                "sim_imagen": res.get("sim_imagen", 0)
            })
        
        return jsonify({
            "results": resultados_formateados,
            "total": len(resultados_formateados)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def stats():
    """Estadísticas del sistema"""
    try:
        total_noticias = collection.count_documents({})
        total_embeddings_texto = db.embeddings.count_documents({})
        total_embeddings_imagen = db.image_embeddings.count_documents({})
        total_categorias = db.categorias.count_documents({})
        total_comentarios = db.comentarios.count_documents({})
        
        noticias_con_imagenes = collection.count_documents({
            "imagenes": {"$exists": True, "$ne": [], "$type": "array"}
        })
        
        return jsonify({
            "noticias": total_noticias,
            "embeddings_texto": total_embeddings_texto,
            "embeddings_imagen": total_embeddings_imagen,
            "categorias": total_categorias,
            "comentarios": total_comentarios,
            "noticias_con_imagenes": noticias_con_imagenes,
            "cobertura_imagenes": f"{(total_embeddings_imagen / noticias_con_imagenes * 100):.1f}%" if noticias_con_imagenes > 0 else "0%"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/categorias', methods=['GET'])
def get_categorias():
    """Obtiene todas las categorías"""
    try:
        categorias = list(db.categorias.find({}, {"_id": 0}))
        return jsonify({"categorias": categorias, "total": len(categorias)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/comentarios/noticia/<noticia_id>', methods=['GET'])
def get_comentarios_noticia(noticia_id):
    """Obtiene comentarios de una noticia"""
    try:
        from bson import ObjectId
        comentarios = list(db.comentarios.find(
            {"id_noticia": ObjectId(noticia_id)}
        ).sort("fecha", -1))
        
        for com in comentarios:
            com["_id"] = str(com["_id"])
            com["id_noticia"] = str(com["id_noticia"])
        
        return jsonify({"comentarios": comentarios, "total": len(comentarios)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/news/<noticia_id>/completo', methods=['GET'])
def get_noticia_completa(noticia_id):
    """Obtiene una noticia con sus comentarios y categoría"""
    try:
        from bson import ObjectId
        
        noticia = collection.find_one({"_id": ObjectId(noticia_id)})
        if not noticia:
            return jsonify({"error": "Noticia no encontrada"}), 404
        
        comentarios = list(db.comentarios.find(
            {"id_noticia": ObjectId(noticia_id)}
        ).sort("fecha", -1).limit(10))
        
        categoria_info = None
        if noticia.get("categoria"):
            categoria_info = db.categorias.find_one({"nombre": noticia["categoria"]})
        
        noticia["_id"] = str(noticia["_id"])
        for com in comentarios:
            com["_id"] = str(com["_id"])
            com["id_noticia"] = str(com["id_noticia"])
        
        return jsonify({
            **noticia,
            "comentarios": comentarios,
            "total_comentarios": len(comentarios),
            "categoria_info": categoria_info
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

print("Script completo cargado.")
print("\nORDEN DE EJECUCIÓN:")
print("1. Ejecutar Sección 1 (instalación de dependencias)")
print("2. Ejecutar Sección 2 (configuración)")
print("3. limpiar_todo()")
print("4. cargar_noticias_por_categorias(10)")
print("5. completar_categorias_faltantes(10)  # OPCIONAL")
print("6. configurar_indices()  # Configura índices para optimizar consultas")
print("7. generar_embeddings_texto()")
print("8. generar_embeddings_imagenes()  # Tarda horas pero procesa TODAS")
print("   Puedes interrumpir (Ctrl+C) y reanudar: generar_embeddings_imagenes(reanudar=True)")
print("9. poblar_comentarios_ejemplo(20)")
print("10. Probar: buscar_documentos_similares_texto('tu consulta')")
print("11. (Opcional) Iniciar API para frontend")
print("\nFUNCIONES ÚTILES:")
print("   - listar_indices()  # Ver todos los índices creados")
print("\nENDPOINTS API DISPONIBLES:")
print("   GET  /api/stats - Estadísticas del sistema")
print("   POST /api/search - Búsqueda híbrida (texto + imagen)")
print("   GET  /api/categorias - Lista todas las categorías")
print("   GET  /api/categorias/:nombre - Info de una categoría")
print("   GET  /api/comentarios/noticia/:id - Comentarios de una noticia")
print("   GET  /api/news/:id/completo - Noticia completa con comentarios")
