// js/extractor-core.js
let jsonGeneradoGlobal = null;
let nombreArchivoOriginal = "";

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnProcesar').addEventListener('click', procesarArchivo);
    document.getElementById('btnDescargar').addEventListener('click', descargarJSON);
    
    // Eventos del Modal
    document.getElementById('btnVerResultados').addEventListener('click', abrirModalResultados);
    document.getElementById('cerrarModal').addEventListener('click', cerrarModalResultados);
    
    // Cerrar modal al hacer clic afuera
    document.getElementById('resultadosModal').addEventListener('click', (e) => {
        if (e.target.id === 'resultadosModal') cerrarModalResultados();
    });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cerrarModalResultados();
    });
});

function procesarArchivo() {
    const input = document.getElementById('fileInput');
    const selector = document.getElementById('carreraSelect').value;
    
    if (!input.files || input.files.length === 0) {
        alert("Por favor, selecciona un archivo Excel primero.");
        return;
    }

    const file = input.files[0];
    nombreArchivoOriginal = file.name;
    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        
        let resultado = null;

        if (selector === "SISTEMAS") {
            resultado = AdaptadorSistemas.procesar(workbook, nombreArchivoOriginal);
        } else if (selector === "ALIMENTOS") {
            resultado = AdaptadorAlimentos.procesar(workbook, nombreArchivoOriginal);
        } else {
            alert("El adaptador para esta carrera aún no está implementado.");
            return;
        }

        jsonGeneradoGlobal = resultado;
        document.getElementById('jsonOutput').textContent = JSON.stringify(resultado, null, 2);
        
        // Mostrar los botones de Ver y Descargar
        document.getElementById('actionButtons').style.display = 'flex';
    };

    reader.readAsArrayBuffer(file);
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

// ==========================================
// SISTEMA DEL MODAL Y RENDERIZADO DE TABLA
// ==========================================

function abrirModalResultados() {
    if (!jsonGeneradoGlobal) return;
    generarTablaResultados(jsonGeneradoGlobal);
    document.getElementById('resultadosModal').classList.add('active');
    document.body.style.overflow = 'hidden'; // Ocultar scroll del body
}

function cerrarModalResultados() {
    document.getElementById('resultadosModal').classList.remove('active');
    document.body.style.overflow = '';
}

function generarTablaResultados(datosJSON) {
    const contenedor = document.getElementById('resultadosTablaContenedor');
    
    if (!datosJSON || !datosJSON.semestres || datosJSON.semestres.length === 0) {
        contenedor.innerHTML = "<p>No hay datos para mostrar.</p>";
        return;
    }

    let html = `
        <table class="resultados-tabla">
            <thead>
                <tr>
                    <th>Semestre</th>
                    <th>Asignatura</th>
                    <th>Grupo</th>
                    <th>Docente</th>
                    <th>Horario Extraído</th>
                </tr>
            </thead>
            <tbody>
    `;

    datosJSON.semestres.forEach(semestre => {
        semestre.asignaturas.forEach(asig => {
            asig.grupos.forEach(grupo => {
                
                // Formatear los horarios en una lista amigable
                let horariosTexto = grupo.horarios.map(h => {
                    return `<strong>${h.dia}</strong> ${h.inicio}-${h.fin}`;
                }).join(' <br> ');

                if (grupo.horarios.length === 0) horariosTexto = "<span style='color: #ef4444;'>Sin horario asignado</span>";

                html += `
                    <tr>
                        <td><span class="badge-semestre">Sem ${semestre.numero}</span></td>
                        <td><strong>${asig.nombre}</strong></td>
                        <td><span class="badge-grupo">${grupo.grupo}</span></td>
                        <td>${grupo.profesor}</td>
                        <td>${horariosTexto}</td>
                    </tr>
                `;
            });
        });
    });

    html += `</tbody></table>`;
    contenedor.innerHTML = html;
}