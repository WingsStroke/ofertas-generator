// --- adaptador_sistemas.js ---

const AdaptadorSistemas = {
    procesar: function(workbook, nombreArchivo) {
        const asignaturasFlat = {}; 

        workbook.SheetNames.forEach((nombreHoja, indexHoja) => {
            const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], {header: 1});
            
            let filaInicio = matriz.findIndex(fila => fila[0] && fila[0].toString().toUpperCase().includes("HORA"));
            if (filaInicio === -1) return;

            let semestreNum = indexHoja; 

            for (let i = filaInicio + 1; i < matriz.length; i++) {
                const fila = matriz[i];
                const rangoHora = fila[0]; 
                if (!rangoHora || !rangoHora.includes("-")) continue;

                const [inicio, fin] = rangoHora.split("-").map(h => h.trim().replace(".", ":")); 

                for (let col = 1; col <= 5; col++) {
                    const celda = fila[col];
                    if (!celda) continue;

                    const bloquesClase = celda.toString().split(/\n|---/);

                    bloquesClase.forEach(bloque => {
                        const match = bloque.match(/(.*?)\s*\(([A-Z0-9]+)\)(?:[\s-]+(.*))?/i);
                        
                        if (match) {
                            const nombre = match[1].trim();
                            const grupoStr = match[2].trim();
                            const docenteUbicacion = match[3] ? match[3].trim() : "Por definir";
                            
                            // Usamos las funciones de utilidades globales
                            const idMateria = normalizarID(nombre);
                            const idGrupo = `${idMateria}_${grupoStr.toLowerCase()}`;

                            if (!asignaturasFlat[idMateria]) {
                                asignaturasFlat[idMateria] = {
                                    id: idMateria,
                                    nombre: nombre,
                                    creditos: null,
                                    semestre: semestreNum,
                                    gruposMap: {}
                                };
                            }

                            if (!asignaturasFlat[idMateria].gruposMap[idGrupo]) {
                                asignaturasFlat[idMateria].gruposMap[idGrupo] = {
                                    id: idGrupo,
                                    grupo: grupoStr,
                                    profesor: docenteUbicacion, 
                                    ubicacion: "Ver docente", 
                                    cupos: null,
                                    horarios: []
                                };
                            }

                            asignaturasFlat[idMateria].gruposMap[idGrupo].horarios.push({
                                dia: obtenerDiaLetra(col),
                                inicio: inicio,
                                fin: fin,
                                jornada: parseInt(inicio.split(":")[0]) >= 18 ? "nocturna" : "diurna"
                            });
                        }
                    });
                }
            }
        });

        return this.formatearJSONOficial(asignaturasFlat, nombreArchivo);
    },

    formatearJSONOficial: function(asignaturasFlat, nombreArchivo) {
        const semestresMap = {};
        let totalAsig = 0;
        let totalGrupos = 0;

        Object.values(asignaturasFlat).forEach(materia => {
            const sem = materia.semestre;
            if (!semestresMap[sem]) semestresMap[sem] = { numero: sem, asignaturas: [] };

            const gruposArray = Object.values(materia.gruposMap);
            totalGrupos += gruposArray.length;
            
            delete materia.gruposMap; 
            materia.grupos = gruposArray;

            semestresMap[sem].asignaturas.push(materia);
            totalAsig++;
        });

        const semestresArray = Object.values(semestresMap).sort((a, b) => a.numero - b.numero);

        return {
            metadata: {
                programa: "Ingeniería de Sistemas",
                archivo: nombreArchivo,
                fechaProcesamiento: new Date().toISOString(),
                totalAsignaturas: totalAsig,
                totalGrupos: totalGrupos,
                totalSemestres: semestresArray.length,
                version: "2.0.0"
            },
            semestres: semestresArray
        };
    }
};