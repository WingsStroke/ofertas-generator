let jsonGeneradoGlobal = null;
let nombreArchivoOriginal = "";

document.addEventListener('DOMContentLoaded', () => {
    // Escuchar los clicks de los botones de forma modular
    document.getElementById('btnProcesar').addEventListener('click', procesarArchivo);
    document.getElementById('btnDescargar').addEventListener('click', descargarJSON);
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
        } else {
            alert("El adaptador para esta carrera aún no está implementado.");
            return;
        }

        jsonGeneradoGlobal = resultado;
        document.getElementById('jsonOutput').textContent = JSON.stringify(resultado, null, 2);
        document.getElementById('btnDescargar').style.display = 'block';
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