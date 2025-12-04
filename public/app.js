// Detectar la URL base automáticamente
const API_BASE_URL = window.location.origin + '/api';

// Estado de usuario (nombre y apellido para comentarios)
let currentUser = {
    nombre: '',
    apellido: ''
};

// Cache de categorías para el select de edición
let categoriesCache = [];

// Cargar usuario desde localStorage al iniciar
loadUserFromStorage();

// Manejo de tabs
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // Remover active de todos los tabs y botones
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Activar el tab seleccionado
        button.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Limpiar resultados
        document.getElementById('search-results').innerHTML = '';
        document.getElementById('rag-results').innerHTML = '';
    });
});

// Formulario de usuario (nombre y apellido)
const userForm = document.getElementById('user-form');
if (userForm) {
    userForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('user-nombre').value.trim();
        const apellido = document.getElementById('user-apellido').value.trim();

        if (!nombre || !apellido) {
            const status = document.getElementById('user-status');
            status.textContent = 'Por favor ingresa nombre y apellido.';
            status.style.color = '#c53030';
            return;
        }

        currentUser = { nombre, apellido };
        localStorage.setItem('ragUser', JSON.stringify(currentUser));

        const status = document.getElementById('user-status');
        status.textContent = `Usuario actual: ${nombre} ${apellido}`;
        status.style.color = '#2f855a';
    });
}

// Formulario de búsqueda vectorial
document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const query = document.getElementById('search-query').value.trim();
    const limit = parseInt(document.getElementById('search-limit').value);
    const incluirComentarios = document.getElementById('incluir-comentarios').checked;
    
    if (!query) {
        showError('search-results', 'Por favor ingresa una consulta de búsqueda');
        return;
    }
    
    showLoading();
    
    try {
        // Asegurar que las categorías estén cargadas (para el select de edición)
        if (!categoriesCache.length) {
            await loadCategories();
        }

        console.log('Enviando búsqueda:', { query, limit, incluir_comentarios: incluirComentarios });
        
        const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query,
                limit,
                incluir_comentarios: incluirComentarios
            })
        });
        
        console.log('📡 Respuesta recibida, status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error del servidor:', errorText);
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText || `Error ${response.status}` };
            }
            throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Datos recibidos:', data);
        console.log('📊 Cantidad de resultados:', data.count);
        console.log('📋 Array de resultados:', data.results);
        
        displaySearchResults(data);
    } catch (error) {
        console.error('Error en búsqueda:', error);
        showError('search-results', `Error: ${error.message}`);
    } finally {
        hideLoading();
    }
});

// Formulario RAG
document.getElementById('rag-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const query = document.getElementById('rag-query').value.trim();
    const limit = parseInt(document.getElementById('rag-limit').value);
    
    if (!query) {
        showError('rag-results', 'Por favor ingresa una pregunta');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE_URL}/rag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query,
                limit
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error en la generación RAG');
        }
        
        displayRAGResults(data);
    } catch (error) {
        showError('rag-results', `Error: ${error.message}`);
    } finally {
        hideLoading();
    }
});

// Mostrar resultados de búsqueda
function displaySearchResults(data) {
    const container = document.getElementById('search-results');
    
    console.log('🎨 Mostrando resultados. Datos completos:', data);
    console.log('📦 Tipo de data:', typeof data);
    console.log('📦 data.results existe?', !!data.results);
    console.log('📦 data.results es array?', Array.isArray(data.results));
    console.log('📦 Longitud de results:', data.results ? data.results.length : 0);
    
    if (!data) {
        container.innerHTML = `
            <div class="empty-results">
                <div class="empty-results-icon">⚠️</div>
                <h3>Error: No se recibieron datos</h3>
                <p>La respuesta del servidor está vacía</p>
            </div>
        `;
        return;
    }
    
    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
        container.innerHTML = `
            <div class="empty-results">
                <div class="empty-results-icon"></div>
                <h3>No se encontraron resultados</h3>
                <p>Intenta con otra consulta de búsqueda</p>
                <p style="font-size: 0.9em; color: #999; margin-top: 10px;">
                    ${data.error ? `Error: ${data.error}` : 'La búsqueda no devolvió resultados'}
                </p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="results-header" style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
            <strong>${data.count}</strong> resultado(s) encontrado(s) en <strong>${data.response_time_ms}ms</strong>
        </div>
    `;
    
    data.results.forEach((result, index) => {
        // Debug: ver el formato del ID
        console.log(`Resultado ${index}:`, result);
        console.log(`ID del resultado ${index}:`, result._id);
        
        const docId = getDocumentId(result);
        console.log(`ID extraído: ${docId}`);

        // Manejar diferentes formatos de imágenes
        let imagen = null;
        if (result.imagenes && Array.isArray(result.imagenes) && result.imagenes.length > 0) {
            imagen = result.imagenes[0];
        } else if (result.imagen) {
            imagen = result.imagen;
        }
        
        const categoria = result.categoria || 'Sin categoría';
        const idioma = result.idioma || 'Desconocido';
        const similarity = result.similarity ? (result.similarity * 100).toFixed(2) : '0.00';
        const contenido = result.contenido_texto || result.titulo || 'Sin contenido disponible';
        const contenidoPreview = contenido.length > 300 ? contenido.substring(0, 300) + '...' : contenido;
        
        html += `
            <div class="result-card" data-doc-id="${docId || ''}">
                <div class="result-header">
                    ${imagen ? 
                        `<img src="${escapeHtml(imagen)}" alt="${escapeHtml(result.titulo || '')}" class="result-image" data-image-url="${escapeHtml(imagen)}" onerror="handleImageError(this);">` :
                        `<div class="result-image-placeholder">Sin imagen</div>`
                    }
                    <div class="result-info">
                        <h3 class="result-title">${escapeHtml(result.titulo || 'Sin título')}</h3>
                        <div class="result-meta">
                            <span class="meta-badge badge-category">${escapeHtml(categoria)}</span>
                            <span class="meta-badge badge-language">${escapeHtml(idioma)}</span>
                            <span class="meta-badge badge-similarity">Similitud: ${similarity}%</span>
                        </div>
                        <div class="result-content">${escapeHtml(contenidoPreview)}</div>
                        ${result.link_original ? 
                            `<a href="${result.link_original}" target="_blank" class="result-link">🔗 Ver noticia original</a>` :
                            ''
                        }
                    </div>
                </div>
                ${result.comentarios && result.comentarios.length > 0 ? `
                    <div class="comentarios-section">
                        <div class="comentarios-title">💬 Comentarios (${result.total_comentarios || result.comentarios.length}):</div>
                        ${result.comentarios.slice(0, 3).map(function(com) {
                            return `
                                <div class="comentario-item">
                                    <div class="comentario-autor">${escapeHtml(com.autor || 'Anónimo')}</div>
                                    <div>${escapeHtml(com.contenido)}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}

                <!-- Formulario para nuevo comentario (asociado a la noticia por id) -->
                ${docId ? `
                <div class="comentarios-section comentario-form-wrapper">
                    <div class="comentarios-title">Agregar comentario</div>
                    <form class="comentario-form" data-doc-id="${docId}">
                        <textarea placeholder="Escribe tu comentario..."></textarea>
                        <button type="submit" class="btn-secondary">Publicar comentario</button>
                    </form>
                </div>
                ` : ''}

                <!-- Formulario de edición básica de noticia -->
                ${docId ? `
                <div class="edit-form" data-doc-id="${docId}">
                    <div class="form-group">
                        <label>Título</label>
                        <input type="text" class="edit-titulo" value="${escapeHtml(result.titulo || '')}">
                    </div>
                    <div class="form-group">
                        <label>Categoría</label>
                        ${renderCategorySelect(categoria)}
                    </div>
                    <div class="form-group">
                        <label>Contenido (resumen)</label>
                        <textarea class="edit-contenido">${escapeHtml(contenido)}</textarea>
                    </div>
                    <div class="edit-actions">
                        <button type="button" class="btn-secondary guardar-noticia" data-doc-id="${docId}">Guardar cambios</button>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Mostrar resultados RAG
function displayRAGResults(data) {
    const container = document.getElementById('rag-results');
    
    let html = `
        <div class="rag-answer">
            <div class="rag-answer-title">💡 Respuesta del Sistema RAG:</div>
            <div class="rag-answer-text">${escapeHtml(data.answer || 'No se pudo generar una respuesta')}</div>
        </div>
        
        <div class="rag-metadata">
            <div class="metadata-item"><strong>Modelo:</strong> ${data.metadata?.model || 'N/A'}</div>
            <div class="metadata-item"><strong>Documentos usados:</strong> ${data.metadata?.documents_used || 0}</div>
            <div class="metadata-item"><strong>Tokens usados:</strong> ${data.metadata?.tokens_used || 'N/A'}</div>
            <div class="metadata-item"><strong>Tiempo total:</strong> ${data.metadata?.total_time_ms || 0}ms</div>
        </div>
    `;
    
    if (data.context_documents && data.context_documents.length > 0) {
        html += `
            <div class="rag-context">
                <div class="rag-context-title">📚 Documentos de contexto utilizados:</div>
        `;
        
        data.context_documents.forEach((doc, index) => {
            const similarity = (doc.similarity * 100).toFixed(2);
            html += `
                <div class="result-card">
                    <h3 class="result-title">${index + 1}. ${escapeHtml(doc.titulo || 'Sin título')}</h3>
                    <div class="result-meta">
                        <span class="meta-badge badge-language">${escapeHtml(doc.idioma || 'Desconocido')}</span>
                        <span class="meta-badge badge-similarity">Similitud: ${similarity}%</span>
                        ${doc.fecha ? `<span class="meta-badge">📅 ${doc.fecha}</span>` : ''}
                    </div>
                    ${doc.link_original ? 
                        `<a href="${doc.link_original}" target="_blank" class="result-link">🔗 Ver noticia original</a>` :
                        ''
                    }
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

// Utilidades
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showError(containerId, message) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <div class="error-message">
            <strong>❌ Error:</strong> ${escapeHtml(message)}
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Manejar errores de carga de imagen
function handleImageError(img) {
    img.onerror = null;
    const placeholder = document.createElement('div');
    placeholder.className = 'result-image-placeholder';
    placeholder.textContent = 'Imagen no disponible';
    img.parentNode.replaceChild(placeholder, img);
}

// Cargar categorías desde la API y guardarlas en cache
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/categorias`);
        const data = await response.json();
        if (response.ok && Array.isArray(data.categorias)) {
            categoriesCache = data.categorias;
            console.log('✅ Categorías cargadas:', categoriesCache.map(c => c.nombre));
        } else {
            console.warn('⚠️ No se pudieron cargar categorías correctamente', data);
        }
    } catch (error) {
        console.error('❌ Error cargando categorías:', error);
    }
}

// Renderizar select de categorías para el formulario de edición
function renderCategorySelect(selectedCategory) {
    if (!categoriesCache.length) {
        // Si no hay categorías, dejar un input de texto como fallback
        return `<input type="text" class="edit-categoria" value="${escapeHtml(selectedCategory || '')}">`;
    }

    const options = categoriesCache.map(cat => {
        const nombre = cat.nombre || '';
        const selected = nombre === selectedCategory ? 'selected' : '';
        return `<option value="${escapeHtml(nombre)}" ${selected}>${escapeHtml(nombre)}</option>`;
    }).join('');

    const placeholderSelected = selectedCategory ? '' : 'selected';

    return `
        <select class="edit-categoria">
            <option value="" disabled ${placeholderSelected}>Selecciona una categoría</option>
            ${options}
        </select>
    `;
}

// Obtener ID de documento (maneja formatos de ObjectId serializado)
function getDocumentId(doc) {
    if (!doc) return null;
    
    const id = doc._id;
    if (!id) {
        console.warn('Documento sin _id:', doc);
        return null;
    }
    
    // Si es string, devolverlo directamente
    if (typeof id === 'string') {
        return id;
    }
    
    // Si es objeto con $oid (formato MongoDB serializado)
    if (typeof id === 'object' && id.$oid) {
        return id.$oid;
    }
    
    // Si es objeto ObjectId, intentar convertir a string
    if (typeof id === 'object' && id.toString) {
        return id.toString();
    }
    
    // Último recurso: convertir a string
    return String(id);
}

// Cargar usuario desde localStorage y mostrar en la UI
function loadUserFromStorage() {
    try {
        const raw = localStorage.getItem('ragUser');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.nombre && parsed.apellido) {
            currentUser = parsed;
            const nombreInput = document.getElementById('user-nombre');
            const apellidoInput = document.getElementById('user-apellido');
            const status = document.getElementById('user-status');

            if (nombreInput) nombreInput.value = parsed.nombre;
            if (apellidoInput) apellidoInput.value = parsed.apellido;
            if (status) {
                status.textContent = `Usuario actual: ${parsed.nombre} ${parsed.apellido}`;
                status.style.color = '#2f855a';
            }
        }
    } catch (_) {
        // Ignorar errores de parseo
    }
}

// Delegación de eventos para formularios de comentario y edición
document.addEventListener('submit', async (e) => {
    // Nuevo comentario
    if (e.target.matches('.comentario-form')) {
        e.preventDefault();

        const form = e.target;
        const docId = form.dataset.docId;
        const textarea = form.querySelector('textarea');
        const contenido = textarea.value.trim();

        if (!docId) {
            alert('No se pudo determinar el ID de la noticia.');
            return;
        }

        if (!currentUser.nombre || !currentUser.apellido) {
            alert('Primero debes definir un usuario (nombre y apellido) en la parte superior.');
            return;
        }

        if (!contenido) {
            alert('El comentario no puede estar vacío.');
            return;
        }

        showLoading();
        try {
            const response = await fetch(`${API_BASE_URL}/comentarios`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id_noticia: docId,
                    autor: `${currentUser.nombre} ${currentUser.apellido}`,
                    contenido
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Error al crear comentario');
            }

            textarea.value = '';
            alert('Comentario creado correctamente.');
        } catch (error) {
            alert(`Error creando comentario: ${error.message}`);
        } finally {
            hideLoading();
        }
    }
});

document.addEventListener('click', async (e) => {
    // Guardar cambios de noticia
    if (e.target.matches('.guardar-noticia')) {
        const button = e.target;
        const docId = button.dataset.docId;
        const card = button.closest('.result-card');
        if (!card || !docId) {
            alert('No se pudo determinar la noticia a actualizar.');
            return;
        }

        const tituloInput = card.querySelector('.edit-titulo');
        const categoriaInput = card.querySelector('.edit-categoria');
        const contenidoTextarea = card.querySelector('.edit-contenido');

        const updates = {
            titulo: tituloInput ? tituloInput.value.trim() : undefined,
            categoria: categoriaInput ? categoriaInput.value.trim() : undefined,
            contenido_texto: contenidoTextarea ? contenidoTextarea.value.trim() : undefined
        };

        showLoading();
        try {
            const response = await fetch(`${API_BASE_URL}/news/${docId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Error al actualizar la noticia');
            }

            alert('Noticia actualizada correctamente.');
        } catch (error) {
            alert(`Error actualizando noticia: ${error.message}`);
        } finally {
            hideLoading();
        }
    }
});

