// --- adaptador_alimentos.js ---

const AdaptadorAlimentos = {
    procesarHoja: function(matrizExcel, nombreSemestre) {
        const diccionarioMaterias = {}; // Aquí guardaremos los datos de la derecha
        const diasSemana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

        // 1. Encontrar la fila de encabezados
        let filaInicio = matrizExcel.findIndex(fila => fila[0] && fila[0].toString().toUpperCase().includes("HORA"));
        if (filaInicio === -1) return null;

        // ==========================================
        // FASE 1: LEER TABLA DERECHA (Base de datos)
        // ==========================================
        // Asumimos que la columna 7 (H) es el "NOMBRE ASIGNATURA" y la 10 (K) es el "GRUPO"
        for (let i = filaInicio + 1; i < matrizExcel.length; i++) {
            const fila = matrizExcel[i];
            const nombre = fila[7];
            const grupo = fila[10];
            const docente = fila[11];
            const codigo = fila[9];

            if (nombre && grupo) {
                // Creamos la llave única, ej: "QUIMICA_A1"
                const llaveUnica = `${nombre.toString().trim().toUpperCase()}_${grupo.toString().trim()}`;
                diccionarioMaterias[llaveUnica] = {
                    nombre: nombre,
                    codigo: codigo,
                    grupo: grupo,
                    docente: docente || "Por definir",
                    horarios: []
                };
            }
        }

        // ==========================================
        // FASE 2: LEER CUADRÍCULA IZQUIERDA (Horarios)
        // ==========================================
        for (let i = filaInicio + 1; i < matrizExcel.length; i++) {
            const fila = matrizExcel[i];
            const rangoHora = fila[0]; // "7:00 - 7:50"
            if (!rangoHora) continue;

            const [horaInicio, horaFin] = rangoHora.split("-").map(h => h.trim());

            for (let diaIdx = 1; diaIdx <= 5; diaIdx++) {
                const celda = fila[diaIdx];
                if (!celda) continue;

                // El reto: En Alimentos la celda dice "Quimica General Teoria - A1"
                // Buscamos el patrón: Texto + Espacio + Guión(Opcional) + Grupo(Alfanumérico al final)
                const match = celda.toString().match(/(.*?)\s*[-]*\s*([A-Z0-9]+)$/i);
                
                if (match) {
                    let nombreEnCuadricula = match[1].trim().toUpperCase();
                    let grupo = match[2].trim();

                    // ¡Cacería de Fuzzy Match! Buscamos si "QUIMICA GENERAL TEORIA" coincide con lo que leímos en la Fase 1
                    let llaveEncontrada = this.buscarLlaveAproximada(diccionarioMaterias, nombreEnCuadricula, grupo);

                    if (llaveEncontrada) {
                        // Le inyectamos la hora a la materia correcta
                        diccionarioMaterias[llaveEncontrada].horarios.push({
                            dia: diasSemana[diaIdx-1],
                            inicio: horaInicio,
                            fin: horaFin
                        });
                    }
                }
            }
        }

        return this.consolidarHorasYFormatear(diccionarioMaterias);
    },

    buscarLlaveAproximada: function(diccionario, nombreCuadricula, grupo) {
        // Lógica para saber que "Física Mecánica A1" en la izquierda
        // es lo mismo que "Física Mecánica Teoria" grupo "A1" en la derecha
        // ...
    }
};