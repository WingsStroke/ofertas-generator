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
                    
                    // ==========================================
                    // 1. RE-ENSAMBLADOR INTELIGENTE DE CELDAS
                    // ==========================================
                    lineasRaw.forEach(linea => {
                        let txt = linea.trim();
                        if (txt.length < 3) return;

                        let actualTieneGrupo = /\([A-Z0-9]{1,3}\)/i.test(txt) || /-\s*Grupo\s*[A-Z0-9]{1,3}/i.test(txt) || /-\s*[A-Z][0-9]{1,2}\b/.test(txt);
                        
                        let pareceNuevaMateria = false;
                        if (bloquesClase.length > 0) {
                            let bloqueAnterior = bloquesClase[bloquesClase.length - 1];
                            let anteriorTieneGrupo = /\([A-Z0-9]{1,3}\)/i.test(bloqueAnterior) || /-\s*Grupo\s*[A-Z0-9]{1,3}/i.test(bloqueAnterior) || /-\s*[A-Z][0-9]{1,2}\b/.test(bloqueAnterior);
                            
                            if (anteriorTieneGrupo && actualTieneGrupo) {
                                // Ambas líneas tienen grupo (Ej: Prog B1 \n Prog C1). Son materias distintas.
                                pareceNuevaMateria = true;
                            } else if (anteriorTieneGrupo && !actualTieneGrupo) {
                                // Anterior tiene, actual no. Puede ser un aula/profe abajo, o una materia electiva sin grupo.
                                if (txt.includes("-") && txt.length > 15 && !/(?:Lab\b|Laboratorio|Sal[oó]n|Sala|Edificio|Bloque)/i.test(txt)) {
                                    pareceNuevaMateria = true; 
                                } else {
                                    pareceNuevaMateria = false; // Es el profe o aula, se une.
                                }
                            } else if (!anteriorTieneGrupo && actualTieneGrupo) {
                                // Anterior NO tiene, actual SI. ¡El anterior era la primera mitad del nombre! (Ej: Laboratorio de \n Física (A1) )
                                pareceNuevaMateria = false; 
                            } else {
                                // Ninguna tiene grupo. Son materias distintas solo si ambas tienen formato largo con guiones.
                                if (txt.includes("-") && txt.length > 15 && bloqueAnterior.includes("-")) {
                                    pareceNuevaMateria = true; 
                                } else {
                                    pareceNuevaMateria = false; 
                                }
                            }
                            
                            // Excepción absoluta: Si la línea anterior quedó mochada en un conector.
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
                        
                        // ==========================================
                        // 2. BORRADOR INVERSO DE AULAS EN DOCENTE
                        // ==========================================
                        docente = docente || "";
                        
                        // A) Borrar ubicaciones escondidas en paréntesis (ej. "(Lab de Redes B)")
                        docente = docente.replace(/\(\s*(?:Lab\b|Laboratorio|Sal[oó]n|Sala|Edificio|Bloque).*?\)/ig, "");

                        // B) Borrar aulas al inicio o al final, absorbiendo sus guiones de conexión.
                        // Esto mata el error: "Laboratorio de Redes B - Juan José Puello" -> "Juan José Puello"
                        docente = docente.replace(/(?:^|\s*-\s*|\s+)(?:Lab\b|Laboratorio|Sal[oó]n|Sala|Edificio|Bloque|Sede)[^-]*(?:-|$)/ig, " ");

                        // C) Quitar guiones iniciales o finales que quedaron colgando
                        docente = docente.replace(/^[-_:\s]+|[-_:\s]+$/g, "").trim(); 
                        
                        if (docente === "") docente = "Por definir";

                        if (nombre.length < 4) return;

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