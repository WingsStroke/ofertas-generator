// js/extractor-utils.js

function normalizarID(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, ""); 
}

// CORRECCIÓN: Ahora usa "W" para Miércoles, igual que tu proyecto principal
function obtenerDiaLetra(indice) {
    const dias = ["L", "M", "W", "J", "V", "S", "D"]; 
    return dias[indice - 1];
}