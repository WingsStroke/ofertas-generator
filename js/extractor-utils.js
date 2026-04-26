function normalizarID(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, ""); 
}

// Convierte la columna 1 en Lunes (L), la 2 en Martes (M), etc.
function obtenerDiaLetra(indice) {
    const dias = ["L", "M", "I", "J", "V", "S", "D"]; 
    return dias[indice - 1];
}