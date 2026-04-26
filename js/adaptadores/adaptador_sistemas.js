// --- adaptador_sistemas.js ---

const AdaptadorSistemas = {
    procesar: function(workbook, nombreArchivo) {
        const asignaturasFlat = {}; 

        workbook.SheetNames.forEach((nombreHoja, indexHoja) => {
            const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], {header: 1});
            
            let filaInicio = matriz.findIndex(fila => fila[0] && fila[0].toString().toUpperCase().includes("HORA"));
            if (filaInicio === -1) return;

            let semestreNum = indexHoja + 1; 
            
            for (let i = filaInicio + 1; i < matriz.length; i++) {
                const fila = matriz[i];
                let rangoHora = fila[0]; 
                if (!rangoHora || typeof rangoHora !== 'string' || !rangoHora.includes("-")) continue;

                let [strInicio, strFin] = rangoHora.split("-").map(h => h.trim().replace(/\s+/g, "").replace(".", ":").toLowerCase().replace(/a\.m\.|p\.m\.|am|pm/g, "")); 
                
                let horaInicioRaw = parseInt(strInicio.split(":")[0]);
                let minInicio = strInicio.split(":")[1] || "00";
                let horaFinRaw = parseInt(strFin.split(":")[0]);
                let minFin = strFin.split(":")[1] || "00";

                let horaInicio = horaInicioRaw;
                let horaFin = horaFinRaw;

                if (horaInicio >= 1 && horaInicio <= 6) horaInicio += 12;
                if (horaFin >= 1 && horaFin <= 6) horaFin += 12;

                let inicio = `${horaInicio.toString().padStart(2, '0')}:${minInicio}`;
                let fin = `${horaFin.toString().padStart(2, '0')}:${minFin}`;
                let jornada = horaInicio >= 18 ? "nocturna" : "diurna";

                for (let col = 1; col <= 5; col++) {
                    const celda = fila[col];
                    if (!celda) continue;

                    let lineasRaw = celda.toString().split(/\n|-{3,}/);
                    let bloquesClase = [];
                    
                    lineasRaw.forEach(linea => {
                        let txt = linea.trim();
                        if (txt.length < 3) return;

                        let actualTieneGrupo = /\([A-Z0-9]{1,3}\)/i.test(txt) || /-\s*Grupo\s*[A-Z0-9]{1,3}/i.test(txt) || /-\s*[A-Z][0-9]{1,2}\b/.test(txt);
                        
                        let pareceNuevaMateria = false;
                        if (bloquesClase.length > 0) {
                            let bloqueAnterior = bloquesClase[bloquesClase.length - 1];
                            let anteriorTieneGrupo = /\([A-Z0-9]{1,3}\)/i.test(bloqueAnterior) || /-\s*Grupo\s*[A-Z0-9]{1,3}/i.test(bloqueAnterior) || /-\s*[A-Z][0-9]{1,2}\b/.test(bloqueAnterior);
                            
                            if (anteriorTieneGrupo && actualTieneGrupo) {
                                pareceNuevaMateria = true;
                            } else if (anteriorTieneGrupo && !actualTieneGrupo) {
                                if (txt.includes("-") && txt.length > 15 && !/(?:Lab\b|Laboratorio|Sal[oó]n|Sala|Edificio|Bloque)/i.test(txt)) {
                                    pareceNuevaMateria = true; 
                                } else {
                                    pareceNuevaMateria = false; 
                                }
                            } else if (!anteriorTieneGrupo && actualTieneGrupo) {
                                pareceNuevaMateria = false; 
                            } else {
                                if (txt.includes("-") && txt.length > 15 && bloqueAnterior.includes("-")) {
                                    pareceNuevaMateria = true; 
                                } else {
                                    pareceNuevaMateria = false; 
                                }
                            }
                            
                            if (bloqueAnterior.match(/\b(de|y|la|el|los|las|en|para|con)$/i)) {
                                pareceNuevaMateria = false;
                            }
                        }

                        if (pareceNuevaMateria || bloquesClase.length === 0) {
                            bloquesClase.push(txt);
                        } else {
                            bloquesClase[bloquesClase.length - 1] += " " + txt;
                        }
                    });

                    bloquesClase.forEach(bloque => {
                        let textoLimpio = bloque.replace(/\s+/g, " ").trim();
                        if (textoLimpio.length < 5 || textoLimpio.toLowerCase().includes("sugerido")) return;

                        textoLimpio = textoLimpio.split(/\. En este grupo|\(Sólo debe escoger/i)[0].trim();

                        let nombre = "";
                        let grupoStr = "A1"; 
                        let docente = "";

                        let matchConParentesis = textoLimpio.match(/(.*?)\s*\(([A-Z0-9]{1,3})\)(.*)/i);
                        let matchConGuion = !matchConParentesis ? textoLimpio.match(/(.*?)\s*-\s*Grupo\s*([A-Z0-9]{1,3})(.*)/i) : null;

                        if (matchConParentesis) {
                            nombre = matchConParentesis[1];
                            grupoStr = matchConParentesis[2];
                            docente = matchConParentesis[3];
                        } else if (matchConGuion) {
                            nombre = matchConGuion[1];
                            grupoStr = matchConGuion[2];
                            docente = matchConGuion[3];
                        } else {
                            let partes = textoLimpio.split("-");
                            nombre = partes[0];
                            if (partes.length > 1) docente = partes.slice(1).join("-");
                        }

                        nombre = nombre.replace(/^[-_]+|[-_]+$/g, "").trim();
                        
                        docente = docente || "";
                        docente = docente.replace(/\(\s*(?:Lab\b|Laboratorio|Sal[oó]n|Sala|Edificio|Bloque).*?\)/ig, "");
                        docente = docente.replace(/(?:^|\s*-\s*|\s+)(?:Lab\b|Laboratorio|Sal[oó]n|Sala|Edificio|Bloque|Sede)[^-]*(?:-|$)/ig, " ");
                        docente = docente.replace(/^[-_:\s]+|[-_:\s]+$/g, "").trim(); 
                        
                        if (docente === "") docente = "Por definir";

                        // CORRECCIÓN 1: Reducir exigencia de longitud de nombre de 4 a 3 (Para permitir POO)
                        if (nombre.length < 3) return;

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
                                profesor: docente, 
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

    consolidarTodosLosHorarios: function(asignaturasFlat) {
        // Función auxiliar para convertir formato HH:MM a minutos totales y hacer cálculos matemáticos
        function timeToMins(t) {
            let [h, m] = t.split(':').map(Number);
            return (h * 60) + m;
        }

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
                        
                        let minsFinActual = timeToMins(actual.fin);
                        let minsInicioSig = timeToMins(sig.inicio);

                        // CORRECCIÓN 2: Tolerancia de fusión de 15 minutos
                        // Si termina igual o hay un receso de hasta 15 min (ej. de 12:50 a 13:00), se fusionan
                        if (actual.fin === sig.inicio || (minsInicioSig - minsFinActual > 0 && minsInicioSig - minsFinActual <= 15)) {
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