// js/extractor-core.js
let jsonGeneradoGlobal = null; 
let draftData = null; 
let currentTabSemestre = null;

const BLOQUES_HORARIOS = [
    { id: "07:00", label: "07:00 - 07:50" }, { id: "07:50", label: "07:50 - 08:40" },
    { id: "08:40", label: "08:40 - 09:30" }, { id: "09:30", label: "09:30 - 10:20" },
    { id: "10:20", label: "10:20 - 11:10" }, { id: "11:10", label: "11:10 - 12:00" },
    { id: "12:00", label: "12:00 - 12:50" }, { id: "13:00", label: "13:00 - 13:50" },
    { id: "13:50", label: "13:50 - 14:40" }, { id: "14:40", label: "14:40 - 15:30" },
    { id: "15:30", label: "15:30 - 16:20" }, { id: "16:20", label: "16:20 - 17:10" },
    { id: "17:10", label: "17:10 - 18:00" }, { id: "18:00", label: "18:00 - 18:50" },
    { id: "18:50", label: "18:50 - 19:40" }, { id: "19:40", label: "19:40 - 20:30" },
    { id: "20:30", label: "20:30 - 21:20" }, { id: "21:20", label: "21:20 - 22:10" }
];
const DIAS = ["L", "M", "W", "J", "V", "S"];
const NOMBRES_DIAS = {"L":"Lunes", "M":"Martes", "W":"Miércoles", "J":"Jueves", "V":"Viernes", "S":"Sábado"};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnProcesar').addEventListener('click', procesarArchivo);
    document.getElementById('btnDescargar').addEventListener('click', descargarJSON);
    document.getElementById('btnVerResultados').addEventListener('click', abrirEditor);
    document.getElementById('cerrarModal').addEventListener('click', cerrarEditor);
    document.getElementById('btnAplicarCambios').addEventListener('click', aplicarCambios);

    // Bolsa de asignaturas (Dropzone)
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
        alert("Extracción exitosa. Abre el Editor Visual para revisar.");
    };
    reader.readAsArrayBuffer(file);
}

function abrirEditor() {
    if (!jsonGeneradoGlobal) return;
    draftData = JSON.parse(JSON.stringify(jsonGeneradoGlobal));
    document.getElementById('editorModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    renderTabs();
    if (draftData.semestres.length > 0) seleccionarTab(draftData.semestres[0].numero);
}

function cerrarEditor() {
    if(confirm("¿Seguro que deseas salir? Los cambios no aplicados se perderán.")){
        document.getElementById('editorModal').classList.remove('active');
        document.body.style.overflow = '';
        draftData = null; 
    }
}

function aplicarCambios() {
    jsonGeneradoGlobal = JSON.parse(JSON.stringify(draftData));
    alert("Cambios aplicados con éxito. Ya puedes descargar el JSON curado.");
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

function renderGrid(numSemestre) {
    const grid = document.getElementById('gridContainer');
    const bolsa = document.getElementById('bolsaContainer');
    grid.innerHTML = ''; bolsa.innerHTML = '';

    const semestre = draftData.semestres.find(s => s.numero === numSemestre);
    if(!semestre) return;

    // Crear la estructura de la Tabla
    const table = document.createElement('table');
    table.className = 'timetable';
    
    let thead = '<thead><tr><th>Hora</th>';
    DIAS.forEach(d => thead += `<th>${NOMBRES_DIAS[d]}</th>`);
    thead += '</tr></thead>';
    table.innerHTML = thead;

    const tbody = document.createElement('tbody');
    const mapHorarios = {};
    
    BLOQUES_HORARIOS.forEach(b => {
        mapHorarios[b.id] = {};
        DIAS.forEach(d => mapHorarios[b.id][d] = []);
    });

    // Mapear asignaturas
    semestre.asignaturas.forEach((asig, asigIdx) => {
        asig.grupos.forEach((grupo, grupoIdx) => {
            if (grupo.horarios.length === 0) {
                bolsa.appendChild(crearTarjeta(asig, grupo, null, asigIdx, grupoIdx, -1));
            } else {
                grupo.horarios.forEach((horario, hIdx) => {
                    // Buscar el bloque más cercano a la hora de inicio
                    let targetBlock = BLOQUES_HORARIOS.find(b => b.id === horario.inicio);
                    if(!targetBlock) {
                        let hMins = parseTime(horario.inicio);
                        let minDiff = Infinity;
                        BLOQUES_HORARIOS.forEach(b => {
                            let diff = Math.abs(parseTime(b.id) - hMins);
                            if(diff < minDiff) { minDiff = diff; targetBlock = b; }
                        });
                    }
                    if(targetBlock && mapHorarios[targetBlock.id][horario.dia]) {
                        mapHorarios[targetBlock.id][horario.dia].push(crearTarjeta(asig, grupo, horario, asigIdx, grupoIdx, hIdx));
                    }
                });
            }
        });
    });

    // Dibujar Filas de la Tabla
    BLOQUES_HORARIOS.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="time-label">${b.label}</td>`;
        DIAS.forEach(d => {
            const td = document.createElement('td');
            td.className = 'time-cell dropzone';
            td.dataset.dia = d;
            td.dataset.inicio = b.id;
            td.ondragover = handleDragOver;
            td.ondragleave = handleDragLeave;
            td.ondrop = dropToGrid;

            mapHorarios[b.id][d].forEach(card => td.appendChild(card));
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    grid.appendChild(table);
}

// ==========================================
// TARJETAS Y EVENTOS DRAG & DROP
// ==========================================
function crearTarjeta(asig, grupo, horario, aIdx, gIdx, hIdx) {
    const card = document.createElement('div');
    card.className = 'clase-card';
    card.draggable = true;
    card.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({aIdx, gIdx, hIdx}));
    };

    const tiempoTexto = horario ? `${horario.inicio} - ${horario.fin}` : 'Sin Horario';
    
    card.innerHTML = `
        <div class="cc-time"><span>${tiempoTexto}</span></div>
        <div class="cc-name" onclick="editarTexto('nombre', ${currentTabSemestre}, ${aIdx}, ${gIdx}, event)">
            <span class="cc-group">${grupo.grupo}</span> ${asig.nombre}
        </div>
        <div class="cc-prof" onclick="editarTexto('profesor', ${currentTabSemestre}, ${aIdx}, ${gIdx}, event)">
            ${grupo.profesor}
        </div>
    `;
    return card;
}

function handleDragOver(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('drag-over');
}

function handleDragLeave(ev) {
    ev.currentTarget.classList.remove('drag-over');
}

function parseTime(timeStr) {
    let [h, m] = timeStr.split(':').map(Number);
    return (h * 60) + m;
}

function formatTime(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function dropToGrid(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
    const {aIdx, gIdx, hIdx} = data;

    const targetCell = ev.currentTarget;
    const newDia = targetCell.dataset.dia;
    const newInicio = targetCell.dataset.inicio;

    const semestre = draftData.semestres.find(s => s.numero === currentTabSemestre);
    const grupo = semestre.asignaturas[aIdx].grupos[gIdx];

    if (hIdx === -1) {
        // Viene de la bolsa, asignamos 50 min por defecto
        grupo.horarios.push({
            dia: newDia,
            inicio: newInicio,
            fin: formatTime(parseTime(newInicio) + 50),
            jornada: parseTime(newInicio) >= 1080 ? "nocturna" : "diurna"
        });
    } else {
        // Viene del grid, conservamos su duración
        let horario = grupo.horarios[hIdx];
        let duracion = parseTime(horario.fin) - parseTime(horario.inicio);
        if(duracion <= 0) duracion = 50; 
        
        horario.dia = newDia;
        horario.inicio = newInicio;
        horario.fin = formatTime(parseTime(newInicio) + duracion);
        horario.jornada = parseTime(newInicio) >= 1080 ? "nocturna" : "diurna";
    }
    
    renderGrid(currentTabSemestre);
    renderTabs();
}

function dropToBolsa(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
    const {aIdx, gIdx, hIdx} = data;

    if (hIdx !== -1) {
        const semestre = draftData.semestres.find(s => s.numero === currentTabSemestre);
        semestre.asignaturas[aIdx].grupos[gIdx].horarios.splice(hIdx, 1);
        renderGrid(currentTabSemestre);
        renderTabs();
    }
}

function editarTexto(campo, semNum, asigIdx, grupoIdx, event) {
    event.stopPropagation(); // Evita conflictos con el Drag&Drop
    const semestre = draftData.semestres.find(s => s.numero === semNum);
    const asig = semestre.asignaturas[asigIdx];
    const grupo = asig.grupos[grupoIdx];

    const valorActual = campo === 'nombre' ? asig.nombre : grupo.profesor;
    const nuevoValor = prompt(`Editar ${campo.toUpperCase()}:`, valorActual);

    if (nuevoValor !== null && nuevoValor.trim() !== "" && nuevoValor !== valorActual) {
        if (campo === 'nombre') {
            if (asig.grupos.length > 1) {
                const aplicarATodos = confirm(`Esta asignatura tiene ${asig.grupos.length} grupos. ¿Aplicar nombre a todos?`);
                if (aplicarATodos) asig.nombre = nuevoValor.trim();
                else { alert("Se modificará para toda la asignatura globalmente."); asig.nombre = nuevoValor.trim(); }
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
    nodoDescarga.setAttribute("download", `oferta_${new Date().getTime()}.json`);
    document.body.appendChild(nodoDescarga);
    nodoDescarga.click();
    nodoDescarga.remove();
}