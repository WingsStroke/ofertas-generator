// --- adaptador_sistemas.js ---

const AdaptadorSistemas = {
    procesar: function(workbook, nombreArchivo) {
        const asignaturasFlat = {}; 

        workbook.SheetNames.forEach((nombreHoja, indexHoja) => {
            const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], {header: 1});
            
            let filaInicio = matriz.findIndex(fila => fila[0] && fila[0].toString().toUpperCase().includes("HORA"));
            if (filaInicio === -1) return;

            let semestreNum = indexHoja; 
            let pasoMediodia = false;

            for (let i = filaInicio + 1; i < matriz.length; i++) {
                const fila = matriz[i];
                let rangoHora = fila[0]; 
                if (!rangoHora || typeof rangoHora !== 'string' || !rangoHora.includes("-")) continue;

                // ==========================================
                // 1. CONVERSIÓN INTELIGENTE AM/PM
                // ==========================================
                let [strInicio, strFin] = rangoHora.split("-").map(h => h.replace(/\s+/g, "").replace(".", ":").toLowerCase().replace(/a\.m\.|p\.m\.|am|pm/g, "")); 
                
                let horaInicioRaw = parseInt(strInicio.split(":")[0]);
                let minInicio = strInicio.split(":")[1] || "00";
                let horaFinRaw = parseInt(strFin.split(":")[0]);
                let minFin = strFin.split(":")[1] || "00";

                // Si detectamos las 12, o hay un salto a las 1, 2, 3... es la tarde
                if (horaInicioRaw === 12 || (horaInicioRaw >= 1 && horaInicioRaw <= 6)) pasoMediodia = true;

                let horaInicio = horaInicioRaw;
                let horaFin = horaFinRaw;

                if (pasoMediodia && horaInicioRaw >= 1 && horaInicioRaw <= 11) horaInicio += 12;
                if (horaFinRaw >= 1 && horaFinRaw <= 11 && (pasoMediodia || horaInicioRaw >= 10)) horaFin += 12;

                let inicio = `${horaInicio.toString().padStart(2, '0')}:${minInicio}`;
                let fin = `${horaFin.toString().padStart(2, '0')}:${minFin}`;
                let jornada = horaInicio >= 18 ? "nocturna" : "diurna";

                // ==========================================
                // 2. EXTRACCIÓN DE CELDAS Y LIMPIEZA
                // ==========================================
                for (let col = 1; col <= 5; col++) {
                    const celda = fila[col];
                    if (!celda) continue;

                    let textoCelda = celda.toString().replace(/\n/g, " ");
                    // Separamos solo si hay 3 o más guiones seguidos (cuando hay múltiples materias)
                    const bloquesClase = textoCelda.split(/-{3,}/);

                    bloquesClase.forEach(bloque => {
                        let textoLimpio = bloque.replace(/\s+/g, " ").trim();
                        if (textoLimpio.length < 5) return;

                        // Filtro de ruido: Ignoramos notas larguísimas de la administración
                        if (textoLimpio.toLowerCase().includes("sugerido") || textoLimpio.split(" ").length > 12) return;
                        
                        // Limpiamos los textos basura anexados al final ("En este grupo se deben...")
                        textoLimpio = textoLimpio.split(/\. En este grupo|\(Sólo debe escoger/i)[0].trim();

                        let nombre = "";
                        let grupoStr = "A1";
                        let docente = "Por definir";

                        // Expresiones regulares para cazar la estructura de la materia
                        let m1 = textoLimpio.match(/(.*?)\s*\(([A-Z0-9]{1,3})\)(?:\s*[-]*\s*(.*))?/i); // Ej: Materia (A1) - Profe
                        let m2 = !m1 ? textoLimpio.match(/(.*?)\s*-\s*Grupo\s*([A-Z0-9]{1,3})(?:\s*[-]*\s*(.*))?/i) : null; // Ej: Materia - Grupo A1
                        let m3 = !m1 && !m2 ? textoLimpio.match(/(.*?)\s*-\s*([A-Z][0-9]{1,2})(?:\s*[-]*\s*(.*))?/i) : null; // Ej: Materia - A1 - Profe

                        if (m1) {
                            nombre = m1[1]; grupoStr = m1[2]; docente = m1[3] || "";
                        } else if (m2) {
                            nombre = m2[1]; grupoStr = m2[2]; docente = m2[3] || "";
                        } else if (m3) {
                            nombre = m3[1]; grupoStr = m3[2]; docente = m3[3] || "";
                        } else {
                            // CASO 4 SALVAVIDAS: Materias sin grupo (Ej. "Gobernanza de TI - Javier Pinedo")
                            let partes = textoLimpio.split("-");
                            nombre = partes[0];
                            if (partes.length > 1) docente = partes.slice(1).join("-");
                            grupoStr = "A1"; 
                        }

                        nombre = nombre.replace(/^[-_]/g, "").trim();
                        docente = docente.replace(/^-/, "").trim() || "Por definir";

                        if (nombre.length < 4) return;

                        const idMateria = normalizarID(nombre);
                        const idGrupo = `${idMateria}_${grupoStr.toLowerCase()}`;

                        // Inyección al JSON
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
                                profesor: docente, 
                                ubicacion: "Ver docente", 
                                cupos: null,
                                horarios: []
                            };
                        }

                        asignaturasFlat[idMateria].gruposMap[idGrupo].horarios.push({
                            dia: obtenerDiaLetra(col),
                            inicio: inicio,
                            fin: fin,
                            jornada: jornada
                        });
                    });
                }
            }
        });

        this.consolidarTodosLosHorarios(asignaturasFlat);
        return this.formatearJSONOficial(asignaturasFlat, nombreArchivo);
    },

    // ALGORITMO DE FUSIÓN DE HORAS CONTINUAS
    consolidarTodosLosHorarios: function(asignaturasFlat) {
        Object.values(asignaturasFlat).forEach(materia => {
            Object.values(materia.gruposMap).forEach(grupo => {
                if (grupo.horarios.length === 0) return;

                const porDia = {};
                grupo.horarios.forEach(h => {
                    if (!porDia[h.dia]) porDia[h.dia] = [];
                    porDia[h.dia].push(h);
                });

                const horariosConsolidados = [];

                for (const dia in porDia) {
                    let bloques = porDia[dia].sort((a, b) => a.inicio.localeCompare(b.inicio));
                    
                    let actual = bloques[0];
                    for (let i = 1; i < bloques.length; i++) {
                        let sig = bloques[i];
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