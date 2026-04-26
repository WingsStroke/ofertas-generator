// js/extractor-core.js
let jsonGeneradoGlobal = null; 
let draftData = null; 
let currentTabSemestre = null;

// Sistema de historial y estado
let historyStack = [];
let isDirty = false;

const BLOQUES_HORARIOS = [
    { id: "07:00", next: "07:50" }, { id: "07:50", next: "08:40" },
    { id: "08:40", next: "09:30" }, { id: "09:30", next: "10:20" },
    { id: "10:20", next: "11:10" }, { id: "11:10", next: "12:00" },
    { id: "12:00", next: "12:50" }, { id: "13:00", next: "13:50" },
    { id: "13:50", next: "14:40" }, { id: "14:40", next: "15:30" },
    { id: "15:30", next: "16:20" }, { id: "16:20", next: "17:10" },
    { id: "17:10", next: "18:00" }, { id: "18:00", next: "18:50" },
    { id: "18:50", next: "19:40" }, { id: "19:40", next: "20:30" },
    { id: "20:30", next: "21:20" }, { id: "21:20", next: "22:10" }
];
const DIAS = ["L", "M", "W", "J", "V", "S"];
const NOMBRES_DIAS = {"L":"Lunes", "M":"Martes", "W":"Miércoles", "J":"Jueves", "V":"Viernes", "S":"Sábado"};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnProcesar').addEventListener('click', procesarArchivo);
    document.getElementById('btnDescargar').addEventListener('click', descargarJSON);
    document.getElementById('btnVerResultados').addEventListener('click', abrirEditor);
    document.getElementById('cerrarModal').addEventListener('click', cerrarEditor);
    document.getElementById('btnAplicarCambios').addEventListener('click', aplicarCambios);
    document.getElementById('btnDeshacer').addEventListener('click', deshacerCambio);

    const bolsa = document.getElementById('bolsaContainer');
    bolsa.ondragover = handleDragOver;
    bolsa.ondragleave = handleDragLeave;
    bolsa.ondrop = dropToBolsa;
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
        alert("Extracción exitosa. Abre el Editor Visual para auditar.");
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// CONTROL DEL ESTADO Y TABS
// ==========================================
function guardarEstado() {
    historyStack.push(JSON.stringify(draftData));
    isDirty = true;
    document.getElementById('btnDeshacer').disabled = false;
}

function deshacerCambio() {
    if (historyStack.length === 0) return;
    
    draftData = JSON.parse(historyStack.pop());
    
    if (historyStack.length === 0) {
        isDirty = false;
        document.getElementById('btnDeshacer').disabled = true;
    }
    
    renderGrid(currentTabSemestre);
    renderTabs();
}

function abrirEditor() {
    if (!jsonGeneradoGlobal) return;
    draftData = JSON.parse(JSON.stringify(jsonGeneradoGlobal));
    
    // Reiniciar estado
    historyStack = [];
    isDirty = false;
    document.getElementById('btnDeshacer').disabled = true;

    document.getElementById('editorModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    renderTabs();
    if (draftData.semestres.length > 0) seleccionarTab(draftData.semestres[0].numero);
}

function cerrarEditor() {
    if (isDirty) {
        if (!confirm("¿Salir sin guardar? Los cambios no aplicados se perderán.")) return;
    }
    document.getElementById('editorModal').classList.remove('active');
    document.body.style.overflow = '';
    draftData = null; 
}

function aplicarCambios() {
    jsonGeneradoGlobal = JSON.parse(JSON.stringify(draftData));
    isDirty = false; // Se reinicia al guardar
    alert("Cambios aplicados al JSON.");
    document.getElementById('editorModal').classList.remove('active');
    document.body.style.overflow = '';
}

function renderTabs() {
    const container = document.getElementById('tabsContainer');
    container.innerHTML = '';
    draftData.semestres.forEach(sem => {
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

// ==========================================
// EL MOTOR DEL GRID (COORDENADAS)
// ==========================================
function parseTime(timeStr) {
    let [h, m] = timeStr.split(':').map(Number);
    return (h * 60) + m;
}

function getRowForTime(timeStr) {
    let index = BLOQUES_HORARIOS.findIndex(b => b.id === timeStr);
    if (index !== -1) return index + 2; 
    
    let prevIndex = BLOQUES_HORARIOS.findIndex(b => b.next === timeStr);
    if (prevIndex !== -1) return prevIndex + 3;
    
    let tMins = parseTime(timeStr);
    let closestRow = 2;
    let minDiff = Infinity;
    BLOQUES_HORARIOS.forEach((b, i) => {
        let diff = Math.abs(parseTime(b.id) - tMins);
        if (diff < minDiff) { minDiff = diff; closestRow = i + 2; }
    });
    return closestRow;
}

function renderGrid(numSemestre) {
    const gridContainer = document.getElementById('gridContainer');
    const bolsa = document.getElementById('bolsaContainer');
    gridContainer.innerHTML = ''; bolsa.innerHTML = '';

    const semestre = draftData.semestres.find(s => s.numero === numSemestre);
    if(!semestre) return;

    const grid = document.createElement('div');
    grid.className = 'timetable-grid';

    let corner = document.createElement('div');
    corner.className = 'timetable-header';
    corner.style.gridColumn = '1 / 2'; corner.style.gridRow = '1 / 2';
    corner.innerText = 'Hora / Día';
    grid.appendChild(corner);

    DIAS.forEach((d, i) => {
        let header = document.createElement('div');
        header.className = 'timetable-header';
        header.style.gridColumn = `${i + 2} / ${i + 3}`;
        header.style.gridRow = '1 / 2';
        header.innerText = NOMBRES_DIAS[d];
        grid.appendChild(header);
    });

    BLOQUES_HORARIOS.forEach((b, r) => {
        let timeLabel = document.createElement('div');
        timeLabel.className = 'timetable-time';
        timeLabel.style.gridColumn = '1 / 2';
        timeLabel.style.gridRow = `${r + 2} / ${r + 3}`;
        timeLabel.innerText = `${b.id} - ${b.next}`;
        grid.appendChild(timeLabel);

        DIAS.forEach((d, c) => {
            let cell = document.createElement('div');
            cell.className = 'timetable-cell dropzone';
            cell.style.gridColumn = `${c + 2} / ${c + 3}`;
            cell.style.gridRow = `${r + 2} / ${r + 3}`;
            cell.dataset.dia = d;
            cell.dataset.inicio = b.id;
            cell.ondragover = handleDragOver;
            cell.ondragleave = handleDragLeave;
            cell.ondrop = dropToGrid;
            grid.appendChild(cell);
        });
    });

    semestre.asignaturas.forEach((asig, aIdx) => {
        asig.grupos.forEach((grupo, gIdx) => {
            if (grupo.horarios.length === 0) {
                bolsa.appendChild(crearTarjetaBolsa(asig, grupo, aIdx, gIdx));
            } else {
                grupo.horarios.forEach((horario, hIdx) => {
                    let startRow = getRowForTime(horario.inicio);
                    let endRow = getRowForTime(horario.fin);
                    let colIdx = DIAS.indexOf(horario.dia) + 2;

                    if (endRow <= startRow) endRow = startRow + 1;

                    let card = crearTarjetaGrid(asig, grupo, horario, aIdx, gIdx, hIdx);
                    card.style.gridColumn = `${colIdx} / ${colIdx + 1}`;
                    card.style.gridRow = `${startRow} / ${endRow}`;
                    grid.appendChild(card);
                });
            }
        });
    });

    gridContainer.appendChild(grid);
}

// ==========================================
// CREACIÓN DE TARJETAS Y EVENTOS
// ==========================================
function crearTarjetaGrid(asig, grupo, horario, aIdx, gIdx, hIdx) {
    const card = document.createElement('div');
    card.className = 'clase-card';
    card.draggable = true;
    card.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({aIdx, gIdx, hIdx})); };

    card.innerHTML = `
        <div class="cc-header">
            <span class="cc-time" title="Clic para editar horas" onclick="editarHora(${aIdx}, ${gIdx}, ${hIdx}, event)">${horario.inicio}-${horario.fin}</span>
            <span class="cc-delete" title="Enviar a Bolsa" onclick="enviarABolsa(${aIdx}, ${gIdx}, ${hIdx}, event)">X</span>
        </div>
        <div class="cc-name" onclick="editarTexto('nombre', ${aIdx}, ${gIdx}, event)">
            <span class="cc-group">${grupo.grupo}</span> ${asig.nombre}
        </div>
        <div class="cc-prof" onclick="editarTexto('profesor', ${aIdx}, ${gIdx}, event)">
            ${grupo.profesor}
        </div>
    `;
    return card;
}

function crearTarjetaBolsa(asig, grupo, aIdx, gIdx) {
    const card = document.createElement('div');
    card.className = 'bolsa-card';
    card.draggable = true;
    card.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({aIdx, gIdx, hIdx: -1})); };

    card.innerHTML = `
        <div class="cc-name"><span class="cc-group">${grupo.grupo}</span> ${asig.nombre}</div>
        <div class="cc-prof">${grupo.profesor}</div>
    `;
    return card;
}

// ==========================================
// LÓGICA DE DRAG & DROP Y EDICIÓN
// ==========================================
function handleDragOver(ev) { ev.preventDefault(); ev.currentTarget.classList.add('drag-over'); }
function handleDragLeave(ev) { ev.currentTarget.classList.remove('drag-over'); }

function dropToGrid(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    
    const dataStr = ev.dataTransfer.getData('text/plain');
    if(!dataStr) return;
    
    const {aIdx, gIdx, hIdx} = JSON.parse(dataStr);
    const newDia = ev.currentTarget.dataset.dia;
    const newInicio = ev.currentTarget.dataset.inicio;

    const grupo = draftData.semestres.find(s => s.numero === currentTabSemestre).asignaturas[aIdx].grupos[gIdx];

    guardarEstado(); // Guardar fotografía antes de modificar

    if (hIdx === -1) {
        let startIndex = BLOQUES_HORARIOS.findIndex(b => b.id === newInicio);
        let finAprox = BLOQUES_HORARIOS[startIndex + 1] ? BLOQUES_HORARIOS[startIndex + 1].next : "22:10";
        grupo.horarios.push({ dia: newDia, inicio: newInicio, fin: finAprox, jornada: parseTime(newInicio) >= 1080 ? "nocturna" : "diurna" });
    } else {
        let horario = grupo.horarios[hIdx];
        let durationBlocks = getRowForTime(horario.fin) - getRowForTime(horario.inicio);
        
        horario.dia = newDia;
        horario.inicio = newInicio;
        
        let newStartIndex = BLOQUES_HORARIOS.findIndex(b => b.id === newInicio);
        let endIndex = newStartIndex + durationBlocks - 1;
        if (endIndex >= BLOQUES_HORARIOS.length) endIndex = BLOQUES_HORARIOS.length - 1;
        
        horario.fin = BLOQUES_HORARIOS[endIndex].next;
        horario.jornada = parseTime(newInicio) >= 1080 ? "nocturna" : "diurna";
    }
    renderGrid(currentTabSemestre); renderTabs();
}

function dropToBolsa(ev) {
    ev.preventDefault();
    const dataStr = ev.dataTransfer.getData('text/plain');
    if(!dataStr) return;
    const {aIdx, gIdx, hIdx} = JSON.parse(dataStr);
    if (hIdx !== -1) enviarABolsa(aIdx, gIdx, hIdx, ev);
}

function enviarABolsa(aIdx, gIdx, hIdx, event) {
    if(event) event.stopPropagation();
    guardarEstado(); // Guardar fotografía
    const grupo = draftData.semestres.find(s => s.numero === currentTabSemestre).asignaturas[aIdx].grupos[gIdx];
    grupo.horarios.splice(hIdx, 1);
    renderGrid(currentTabSemestre); renderTabs();
}

function editarHora(aIdx, gIdx, hIdx, event) {
    event.stopPropagation();
    const horario = draftData.semestres.find(s => s.numero === currentTabSemestre).asignaturas[aIdx].grupos[gIdx].horarios[hIdx];
    
    let nuevoInicio = prompt("Hora de Inicio (formato HH:MM):", horario.inicio);
    if (!nuevoInicio) return;
    let nuevoFin = prompt("Hora de Fin (formato HH:MM):", horario.fin);
    if (!nuevoFin) return;

    if (nuevoInicio.trim() === horario.inicio && nuevoFin.trim() === horario.fin) return; // Si no hay cambios, no hace nada

    guardarEstado(); // Guardar fotografía
    horario.inicio = nuevoInicio.trim();
    horario.fin = nuevoFin.trim();
    renderGrid(currentTabSemestre);
}

function editarTexto(campo, aIdx, gIdx, event) {
    event.stopPropagation();
    const asig = draftData.semestres.find(s => s.numero === currentTabSemestre).asignaturas[aIdx];
    const grupo = asig.grupos[gIdx];

    const valorActual = campo === 'nombre' ? asig.nombre : grupo.profesor;
    const nuevoValor = prompt(`Editar ${campo.toUpperCase()}:`, valorActual);

    if (nuevoValor && nuevoValor.trim() !== "" && nuevoValor !== valorActual) {
        guardarEstado(); // Guardar fotografía
        
        if (campo === 'nombre') {
            if (asig.grupos.length > 1) {
                if (confirm(`¿Aplicar nombre a todos los ${asig.grupos.length} grupos de esta materia?`)) asig.nombre = nuevoValor.trim();
            } else { asig.nombre = nuevoValor.trim(); }
        } else if (campo === 'profesor') {
            grupo.profesor = nuevoValor.trim();
        }
        renderGrid(currentTabSemestre);
    }
}

function descargarJSON() {
    if (!jsonGeneradoGlobal) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(jsonGeneradoGlobal, null, 2));
    const nodoDescarga = document.createElement('a');
    nodoDescarga.setAttribute("href", dataStr);
    nodoDescarga.setAttribute("download", `oferta_curada_${new Date().getTime()}.json`);
    document.body.appendChild(nodoDescarga);
    nodoDescarga.click();
    nodoDescarga.remove();
}