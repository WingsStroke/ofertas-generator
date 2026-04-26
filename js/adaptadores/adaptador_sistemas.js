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

                    let textoCelda = celda.toString()
                        .replace(/\n/g, " ")
                        .replace(/-{2,}/g, "---") 
                        .replace(/\s+/g, " "); 
                    
                    const bloquesClase = textoCelda.split("---");

                    bloquesClase.forEach(bloque => {
                        let textoLimpio = bloque.trim();
                        if (textoLimpio.length < 5 || textoLimpio.toLowerCase().includes("sugerido")) return;

                        textoLimpio = textoLimpio.split(/\. En este grupo|\(Sólo debe escoger/i)[0].trim();

                        let nombre = "";
                        let grupoStr = "A1"; 
                        let docente = "Por definir";

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
                        docente = docente.replace(/^[-_]+|[-_]+$/g, "").trim() || "Por definir";
                        
                        // CORRECCIÓN DOCENTE: Cortamos inteligentemente solo si vemos palabras de "ubicación"
                        let partesDocente = docente.split(/\s*-\s*Lab\b|\s*-\s*Sal[oó]n\b|\s*-\s*Sala\b/i);
                        docente = partesDocente[0].trim();

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
                                // ELIMINAMOS LA PROPIEDAD "ubicacion"
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