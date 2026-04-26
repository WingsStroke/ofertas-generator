// js/extractor-core.js
let jsonGeneradoGlobal = null; 
let draftData = null; // BORRADOR PARA EL EDITOR (Smart Sync)
let currentTabSemestre = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnProcesar').addEventListener('click', procesarArchivo);
    document.getElementById('btnDescargar').addEventListener('click', descargarJSON);
    
    // Eventos del Editor
    document.getElementById('btnVerResultados').addEventListener('click', abrirEditor);
    document.getElementById('cerrarModal').addEventListener('click', cerrarEditor);
    document.getElementById('btnAplicarCambios').addEventListener('click', aplicarCambios);
});

function procesarArchivo() {
    const input = document.getElementById('fileInput');
    const selector = document.getElementById('carreraSelect').value;
    
    if (!input.files || input.files.length === 0) { alert("Sube un Excel."); return; }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        
        let resultado = null;
        if (selector === "SISTEMAS") resultado = AdaptadorSistemas.procesar(workbook, file.name);
        else if (selector === "ALIMENTOS") resultado = AdaptadorAlimentos.procesar(workbook, file.name);

        jsonGeneradoGlobal = resultado;
        document.getElementById('actionButtons').style.display = 'flex';
        alert("¡Extracción exitosa! Abre el Editor Visual para revisar.");
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// EL EDITOR VISUAL (STATEFUL IDE)
// ==========================================

function abrirEditor() {
    if (!jsonGeneradoGlobal) return;
    // 1. Crear un Borrador Desconectado (Deep Copy)
    draftData = JSON.parse(JSON.stringify(jsonGeneradoGlobal));
    
    document.getElementById('editorModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    renderTabs();
    if (draftData.semestres.length > 0) {
        seleccionarTab(draftData.semestres[0].numero);
    }
}

function cerrarEditor() {
    if(confirm("¿Seguro que deseas salir? Los cambios no aplicados se perderán.")){
        document.getElementById('editorModal').classList.remove('active');
        document.body.style.overflow = '';
        draftData = null; // Destruir borrador
    }
}

function aplicarCambios() {
    // 2. Sobrescribir el JSON global con el Borrador
    jsonGeneradoGlobal = JSON.parse(JSON.stringify(draftData));
    alert("✅ Cambios guardados con éxito. ¡Ya puedes descargar el JSON curado!");
    document.getElementById('editorModal').classList.remove('active');
    document.body.style.overflow = '';
}

// ==========================================
// RENDERIZADO DEL TABLERO
// ==========================================

function renderTabs() {
    const container = document.getElementById('tabsContainer');
    container.innerHTML = '';

    draftData.semestres.forEach(sem => {
        // Contar clases sin horario para la insignia (Badge)
        let conflictos = 0;
        sem.asignaturas.forEach(a => a.grupos.forEach(g => { if(g.horarios.length === 0) conflictos++; }));

        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.innerHTML = `Sem ${sem.numero} ${conflictos > 0 ? `<span class="tab-badge">${conflictos}</span>` : ''}`;
        btn.onclick = () => seleccionarTab(sem.numero);
        btn.id = `tab-${sem.numero}`;
        container.appendChild(btn);
    });
}

function seleccionarTab(numSemestre) {
    currentTabSemestre = numSemestre;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${numSemestre}`).classList.add('active');
    renderGrid(numSemestre);
}

function renderGrid(numSemestre) {
    const grid = document.getElementById('gridContainer');
    const bolsa = document.getElementById('bolsaContainer');
    grid.innerHTML = ''; bolsa.innerHTML = '';

    const dias = ["L", "M", "W", "J", "V", "S"];
    const nombresDias = {"L":"Lunes", "M":"Martes", "W":"Miércoles", "J":"Jueves", "V":"Viernes", "S":"Sábado"};

    // Crear Columnas
    const columnasDOM = {};
    dias.forEach(dia => {
        const col = document.createElement('div');
        col.className = 'day-column';
        col.innerHTML = `<div class="day-header">${nombresDias[dia]}</div><div class="day-dropzone" data-dia="${dia}"></div>`;
        grid.appendChild(col);
        columnasDOM[dia] = col.querySelector('.day-dropzone');
    });

    const semestre = draftData.semestres.find(s => s.numero === numSemestre);
    if(!semestre) return;

    // Pintar Tarjetas
    semestre.asignaturas.forEach((asig, asigIndex) => {
        asig.grupos.forEach((grupo, grupoIndex) => {
            
            if (grupo.horarios.length === 0) {
                // A la Bolsa de Conflictos
                bolsa.appendChild(crearTarjeta(asig, grupo, null, asigIndex, grupoIndex, -1));
            } else {
                // Al Tablero de Horarios
                grupo.horarios.forEach((horario, hIndex) => {
                    if (columnasDOM[horario.dia]) {
                        columnasDOM[horario.dia].appendChild(crearTarjeta(asig, grupo, horario, asigIndex, grupoIndex, hIndex));
                    }
                });
            }
        });
    });
}

function crearTarjeta(asig, grupo, horario, aIdx, gIdx, hIdx) {
    const card = document.createElement('div');
    card.className = 'clase-card';
    
    // Si no hay horario, mostramos advertencia
    const tiempoTexto = horario ? `${horario.inicio} - ${horario.fin}` : '⚠️ Sin Horario';
    
    card.innerHTML = `
        <div class="cc-time">
            <span>${tiempoTexto}</span>
        </div>
        <div class="cc-name" onclick="editarTexto('nombre', ${currentTabSemestre}, ${aIdx}, ${gIdx})">
            <span class="cc-group">${grupo.grupo}</span> ${asig.nombre}
        </div>
        <div class="cc-prof" onclick="editarTexto('profesor', ${currentTabSemestre}, ${aIdx}, ${gIdx})">
            👨‍🏫 ${grupo.profesor}
        </div>
    `;
    return card;
}

// ==========================================
// EDICIÓN EN LÍNEA (Smart Sync)
// ==========================================

function editarTexto(campo, semNum, asigIdx, grupoIdx) {
    const semestre = draftData.semestres.find(s => s.numero === semNum);
    const asig = semestre.asignaturas[asigIdx];
    const grupo = asig.grupos[grupoIdx];

    const valorActual = campo === 'nombre' ? asig.nombre : grupo.profesor;
    const nuevoValor = prompt(`Editar ${campo.toUpperCase()}:`, valorActual);

    if (nuevoValor !== null && nuevoValor.trim() !== "" && nuevoValor !== valorActual) {
        
        if (campo === 'nombre') {
            // Smart Sync: Preguntar si aplicar a todos los grupos de esta materia
            if (asig.grupos.length > 1) {
                const aplicarATodos = confirm(`Esta asignatura tiene ${asig.grupos.length} grupos. ¿Deseas cambiarle el nombre a todos?`);
                if (aplicarATodos) {
                    asig.nombre = nuevoValor.trim();
                } else {
                    alert("Por ahora, el nombre pertenece a la asignatura global. Se cambiará para todos los grupos.");
                    asig.nombre = nuevoValor.trim();
                }
            } else {
                asig.nombre = nuevoValor.trim();
            }
        } else if (campo === 'profesor') {
            grupo.profesor = nuevoValor.trim();
        }

        // Re-renderizar para mostrar los cambios
        renderGrid(currentTabSemestre);
    }
}

function descargarJSON() {
    if (!jsonGeneradoGlobal) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(jsonGeneradoGlobal, null, 2));
    const nodoDescarga = document.createElement('a');
    nodoDescarga.setAttribute("href", dataStr);
    nodoDescarga.setAttribute("download", `oferta_${new Date().getTime()}.json`);
    document.body.appendChild(nodoDescarga);
    nodoDescarga.click();
    nodoDescarga.remove();
}