# ============================================
# SCRIPT PARA LIMPIAR TODA LA BASE DE DATOS
# ============================================

import requests
import time
from pymongo import MongoClient

# --- CLAVES Y CONEXIÓN ---
API_KEY = "pub_ee77445946384c0399a132e6a8df2caa"
USER = "zzarzarr12"
PASSWORD = "zarza2025"
CLUSTER = "cluster0.dyprncd.mongodb.net"

# --- URI DE CONEXIÓN ---
uri = f"mongodb+srv://zzarzarr12:zarza2025@cluster0.dyprncd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
client = MongoClient(uri)

# Base de datos y colección
db = client["rag_noticias"]

print("🧹 Limpiando todas las colecciones...")

# Limpiar todas las colecciones
db.noticias.delete_many({})
print("✅ Colección 'noticias' limpiada")

db.embeddings.delete_many({})
print("✅ Colección 'embeddings' limpiada")

db.image_embeddings.delete_many({})
print("✅ Colección 'image_embeddings' limpiada")

db.comentarios.delete_many({})
print("✅ Colección 'comentarios' limpiada")

db.categorias.delete_many({})
print("✅ Colección 'categorias' limpiada")

# Insertar las 10 categorías predefinidas
categorias = [
    {"_id": 1, "nombre": "tecnología"},
    {"_id": 2, "nombre": "deportes"},
    {"_id": 3, "nombre": "economía"},
    {"_id": 4, "nombre": "política"},
    {"_id": 5, "nombre": "ciencia"},
    {"_id": 6, "nombre": "salud"},
    {"_id": 7, "nombre": "entretenimiento"},
    {"_id": 8, "nombre": "internacional"},
    {"_id": 9, "nombre": "educación"},
    {"_id": 10, "nombre": "negocios"}
]

db.categorias.insert_many(categorias)
print(f"✅ {len(categorias)} categorías insertadas")

# Verificar que todo está limpio
total_noticias = db.noticias.count_documents({})
total_embeddings = db.embeddings.count_documents({})
total_image_embeddings = db.image_embeddings.count_documents({})
total_comentarios = db.comentarios.count_documents({})
total_categorias = db.categorias.count_documents({})

print("\n📊 Estado final:")
print(f"   Noticias: {total_noticias}")
print(f"   Embeddings texto: {total_embeddings}")
print(f"   Embeddings imagen: {total_image_embeddings}")
print(f"   Comentarios: {total_comentarios}")
print(f"   Categorías: {total_categorias}")

print("\n✅ Base de datos limpiada y lista para cargar nuevas noticias")

