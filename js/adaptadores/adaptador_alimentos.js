// --- adaptador_alimentos.js ---

const AdaptadorAlimentos = {
    procesar: function(workbook, nombreArchivo) {
        const asignaturasFlat = {}; 

        workbook.SheetNames.forEach((nombreHoja, indexHoja) => {
            const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], {header: 1});
            
            let filaInicio = matriz.findIndex(fila => fila[0] && fila[0].toString().toUpperCase().includes("HORA"));
            if (filaInicio === -1) return;

            let semestreNum = indexHoja + 1; 

            // FASE 1: MEMORIZAR TABLA DERECHA (Docentes)
            let baseDatosDerecha = [];
            
            let colNombre = 7, colGrupo = 10, colDocente = 11;
            for(let c = 0; c < matriz[filaInicio].length; c++){
                let txt = (matriz[filaInicio][c] || "").toString().toUpperCase();
                if(txt.includes("NOMBRE ASIGNATURA")) colNombre = c;
                else if(txt === "GRUPO") colGrupo = c;
                else if(txt.includes("DOCENTE")) colDocente = c;
            }

            for (let i = filaInicio + 1; i < matriz.length; i++) {
                let nombreOf = matriz[i][colNombre];
                let grupoOf = matriz[i][colGrupo];
                let docenteOf = matriz[i][colDocente];
                
                if (nombreOf && grupoOf) {
                    baseDatosDerecha.push({
                        nombre: nombreOf.toString().trim(),
                        grupo: grupoOf.toString().trim(),
                        docente: docenteOf ? docenteOf.toString().trim() : "Por definir"
                    });
                }
            }

            // FASE 2: ESCANEAR CUADRÍCULA IZQUIERDA
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

                    const bloquesClase = celda.toString().split(/\n/);

                    bloquesClase.forEach(bloque => {
                        let textoLimpio = bloque.replace(/-/g, " ").replace(/\s+/g, " ").trim();
                        if (textoLimpio.length < 4 || textoLimpio.toLowerCase().includes("sugerido")) return;

                        let regexGrupos = /\b([A-Z][0-9])\b/g;
                        let gruposEncontrados = [...textoLimpio.matchAll(regexGrupos)].map(m => m[1]);

                        if (gruposEncontrados.length === 0) gruposEncontrados = ["A1"];

                        let nombreBase = textoLimpio;
                        gruposEncontrados.forEach(g => {
                            nombreBase = nombreBase.replace(new RegExp("\\b" + g + "\\b", "g"), "");
                        });
                        nombreBase = nombreBase.trim();
                        if (nombreBase.length < 4) return;

                        // FASE 3: LA COLISIÓN (FUZZY MATCH)
                        gruposEncontrados.forEach(grupoStr => {
                            let nombreFinal = nombreBase;
                            let docenteFinal = "Por definir";
                            
                            let matchDerecha = baseDatosDerecha.find(bd => {
                                if (bd.grupo.toUpperCase() !== grupoStr.toUpperCase()) return false;
                                
                                let strIzq = normalizarID(nombreBase);
                                let strDer = normalizarID(bd.nombre);
                                
                                if (strIzq.includes("laboratorio") && strDer.includes("teoria")) return false;
                                if (strIzq.includes("teoria") && strDer.includes("laboratorio")) return false;

                                if (strIzq === strDer) return true;
                                if (strIzq.includes(strDer) || strDer.includes(strIzq)) return true;
                                
                                let palabrasIzq = strIzq.split("_").filter(w => w.length > 3);
                                let palabrasDer = strDer.split("_").filter(w => w.length > 3);
                                let coincidencias = palabrasIzq.filter(w => palabrasDer.includes(w));
                                
                                return (coincidencias.length >= 2 || (palabrasIzq.length === 1 && coincidencias.length === 1));
                            });

                            if (matchDerecha) {
                                nombreFinal = matchDerecha.nombre; 
                                docenteFinal = matchDerecha.docente;
                            }

                            const idMateria = normalizarID(nombreFinal);
                            const idGrupo = `${idMateria}_${grupoStr.toLowerCase()}`;

                            if (!asignaturasFlat[idMateria]) {
                                asignaturasFlat[idMateria] = {
                                    id: idMateria, nombre: nombreFinal, creditos: null, semestre: semestreNum, gruposMap: {}
                                };
                            }

                            if (!asignaturasFlat[idMateria].gruposMap[idGrupo]) {
                                asignaturasFlat[idMateria].gruposMap[idGrupo] = {
                                    id: idGrupo, 
                                    grupo: grupoStr, 
                                    profesor: docenteFinal, 
                                    // ELIMINAMOS LA PROPIEDAD "ubicacion"
                                    cupos: null, 
                                    horarios: []
                                };
                            }

                            asignaturasFlat[idMateria].gruposMap[idGrupo].horarios.push({
                                dia: obtenerDiaLetra(col), inicio: inicio, fin: fin, jornada: jornada
                            });
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
                grupo.horarios.forEach(h => { if (!porDia[h.dia]) porDia[h.dia] = []; porDia[h.dia].push(h); });
                const horariosConsolidados = [];
                for (const dia in porDia) {
                    let bloques = porDia[dia].sort((a, b) => a.inicio.localeCompare(b.inicio));
                    let actual = bloques[0];
                    for (let i = 1; i < bloques.length; i++) {
                        let sig = bloques[i];
                        if (actual.fin === sig.inicio) actual.fin = sig.fin;
                        else { horariosConsolidados.push(actual); actual = sig; }
                    }
                    horariosConsolidados.push(actual);
                }
                grupo.horarios = horariosConsolidados;
            });
        });
    },

    formatearJSONOficial: function(asignaturasFlat, nombreArchivo) {
        const semestresMap = {};
        let totalAsig = 0; let totalGrupos = 0;

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
                programa: "Ingeniería de Alimentos",
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