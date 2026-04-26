// --- adaptador_sistemas.js ---

const AdaptadorSistemas = {
    // Recibe la hoja de Excel convertida en matriz 2D y el nombre del semestre
    procesarHoja: function(matrizExcel, nombreSemestre) {
        const registroAsignaturas = {}; 
        const diasSemana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

        // 1. Buscar en qué fila empieza el horario (donde dice "HORA")
        let filaInicio = matrizExcel.findIndex(fila => 
            fila[0] && fila[0].toString().toUpperCase().includes("HORA")
        );
        if (filaInicio === -1) return null; // No es una hoja válida

        // 2. Barrer la cuadrícula hacia abajo
        for (let i = filaInicio + 1; i < matrizExcel.length; i++) {
            const fila = matrizExcel[i];
            const rangoHora = fila[0]; // Ej: "7:00 - 7:50"
            if (!rangoHora) continue;

            // Extraer hora inicio y fin (Lógica de formato de hora aquí)
            const [horaInicio, horaFin] = rangoHora.split("-").map(h => h.trim());

            // 3. Barrer de Lunes (Col 1) a Viernes (Col 5)
            for (let diaIdx = 1; diaIdx <= 5; diaIdx++) {
                const celda = fila[diaIdx];
                if (!celda) continue; // Celda vacía (Hora libre)

                // 4. ELIMINAR EL MONSTRUO: Separar clases pegadas por guiones o saltos de línea
                const bloquesClase = celda.toString().split(/\n|---/);

                bloquesClase.forEach(bloque => {
                    // Regex mágico: Busca "Cualquier texto" + "(Grupo)" + "Cualquier texto"
                    const match = bloque.match(/(.*?)\s*\(([A-Z0-9]+)\)\s*[-]*\s*(.*)/i);
                    
                    if (match) {
                        let nombreMateria = match[1].trim();
                        let nombreGrupo = match[2].trim();
                        let docenteLugar = match[3].trim(); // A veces trae el salón

                        // 5. Inyectar en nuestro diccionario temporal
                        this.registrarClase(registroAsignaturas, nombreMateria, nombreGrupo, docenteLugar, diasSemana[diaIdx-1], horaInicio, horaFin);
                    }
                });
            }
        }
        
        return this.formatearAJSON(registroAsignaturas);
    },

    registrarClase: function(registro, materia, grupo, docente, dia, inicio, fin) {
        // Aquí va la lógica para agrupar horas continuas (ej. si hay clase de 7 a 8 y de 8 a 9, unirlas de 7 a 9)
        // ...
    }
};