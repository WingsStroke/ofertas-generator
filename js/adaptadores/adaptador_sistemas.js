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

                    // CORRECCIÓN 1: Convertir saltos de línea en espacios para no romper los nombres
                    let textoCelda = celda.toString().replace(/\n/g, " ");
                    
                    // Separar solo si hay guiones largos (---) que indican múltiples materias
                    const bloquesClase = textoCelda.split(/---|- - -/);

                    bloquesClase.forEach(bloque => {
                        // CORRECCIÓN 3: Regex mejorado. Busca los primeros paréntesis que tengan máximo 3 caracteres alfanuméricos
                        const match = bloque.match(/(.*?)\s*\(([A-Z0-9]{1,3})\)(.*)/i);
                        
                        if (match) {
                            const nombre = match[1].replace(/-/g, "").trim(); // Limpiamos guiones huérfanos
                            const grupoStr = match[2].trim();
                            const docenteUbicacion = match[3] ? match[3].replace(/^-/, "").trim() : "Por definir";
                            
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

        // Aplicamos la Consolidación antes de exportar
        this.consolidarTodosLosHorarios(asignaturasFlat);
        return this.formatearJSONOficial(asignaturasFlat, nombreArchivo);
    },

    // CORRECCIÓN 2: ALGORITMO DE FUSIÓN DE HORAS CONTINUAS
    consolidarTodosLosHorarios: function(asignaturasFlat) {
        Object.values(asignaturasFlat).forEach(materia => {
            Object.values(materia.gruposMap).forEach(grupo => {
                if (grupo.horarios.length === 0) return;

                // 1. Agrupar por día
                const porDia = {};
                grupo.horarios.forEach(h => {
                    if (!porDia[h.dia]) porDia[h.dia] = [];
                    porDia[h.dia].push(h);
                });

                const horariosConsolidados = [];

                // 2. Fusionar los continuos de cada día
                for (const dia in porDia) {
                    // Ordenamos por hora de inicio
                    let bloques = porDia[dia].sort((a, b) => a.inicio.localeCompare(b.inicio));
                    
                    let actual = bloques[0];
                    for (let i = 1; i < bloques.length; i++) {
                        let sig = bloques[i];
                        // Si la hora de fin del actual es la hora de inicio del siguiente (fusionar)
                        if (actual.fin === sig.inicio) {
                            actual.fin = sig.fin;
                        } else {
                            horariosConsolidados.push(actual);
                            actual = sig;
                        }
                    }
                    horariosConsolidados.push(actual);
                }

                grupo.horarios = horariosConsolidados;
            });
        });
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