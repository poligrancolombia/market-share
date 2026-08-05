import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import { decryptBuffer, AuthError } from "./crypto";

const BUCKET = "https://storage.googleapis.com/market-share-503713-data";
const TABLES = ["hecho_indicador", "dim_tiempo", "dim_institucion", "dim_programa", "oferta_poli"];

function deBigInt(row) {
  const out = {};
  for (const k in row) out[k] = typeof row[k] === "bigint" ? Number(row[k]) : row[k];
  return out;
}

// los .parquet.enc del bucket son AES-256-GCM (ver etl/crypto_config.py) --
// se traen completos con fetch() (ya no lecturas de rango HTTP: al desencriptar
// en memoria necesitamos el archivo entero de todas formas) y se
// desencriptan con la llave derivada de la contraseña del sitio antes de
// dárselos a DuckDB-WASM como buffer. Un fallo de red se reintenta; un fallo
// de desencriptado (AuthError, contraseña incorrecta) se propaga de una vez
// -- reintentar con la misma llave nunca va a funcionar.
async function registerTableWithRetry(db, conn, table, decryptKey) {
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const virtualName = `${table}_a${attempt}.parquet`;
    try {
      const res = await fetch(`${BUCKET}/${table}.parquet.enc?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} descargando ${table}`);
      const encrypted = await res.arrayBuffer();
      const plain = await decryptBuffer(decryptKey, encrypted);
      db.registerFileBuffer(virtualName, new Uint8Array(plain));
      await conn.query(`CREATE OR REPLACE VIEW ${table} AS SELECT * FROM read_parquet('${virtualName}')`);
      const cols = await conn.query(`SELECT * FROM ${table} LIMIT 0`);
      for (const f of cols.schema.fields) {
        await conn.query(`SELECT MAX("${f.name}") FROM ${table}`);
      }
      return;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      lastErr = err;
      await db.dropFile(virtualName).catch(() => {});
      await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }
  throw lastErr;
}

const DuckDBContext = createContext(null);

export function DuckDBProvider({ decryptKey, children }) {
  const [state, setState] = useState({ ready: false, error: null, message: "Cargando motor de datos…" });
  const connRef = useRef(null);
  const poliNameRef = useRef("POLI");
  // las tablas viven en un Parquet remoto -- dos consultas EN PARALELO contra
  // la misma vista pueden disparar lecturas de rango HTTP concurrentes sobre
  // el mismo archivo, que es justo lo que falla/cuelga el motor (mismo
  // problema que registerTableWithRetry ya evita para el arranque). Toda
  // consulta pasa por esta cola para forzar que se ejecuten una a la vez,
  // sin importar qué componente las dispare (ej. el buscador de Programa
  // mientras se escribe rápido).
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    if (!decryptKey) return;
    let cancelled = false;

    (async () => {
      try {
        const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
        const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
        const worker = new Worker(workerUrl);
        const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(workerUrl);
        const conn = await db.connect();

        for (const t of TABLES) {
          await registerTableWithRetry(db, conn, t, decryptKey);
        }

        await conn.query(`
          CREATE VIEW v_mercado AS
          SELECT
            h.anio, h.semestre, h.metrica, h.valor, h.sexo,
            i.institucion,
            i.institucion_completo, i.principal_o_seccional, i.sector_ies, i.ies_padre,
            p.codigo_snies_programa,
            p.programa_academico,
            p.grupo_homologo, p.competencia_directa,
            p.departamento_programa, p.municipio_programa,
            h.nivel_academico, h.metodologia,
            -- el dato fuente trae "nivel_formacion" con mayúsculas/minúsculas
            -- inconsistentes (ej. "Especializacion Universitaria" vs.
            -- "especializacion universitaria") Y con variantes de género --
            -- los registros de métrica "Primer Curso" usan "Universitaria" /
            -- "Tecnologica" (femenino) donde "Matriculados" usa "Universitario"
            -- / "Tecnologico" (masculino). Se normaliza una sola vez aquí
            -- (esta build de duckdb-wasm no trae initcap) para que
            -- agrupaciones, filtros y el selector de filtros global vean un
            -- único valor canónico por nivel, sin importar la métrica.
            CASE lower(trim(h.nivel_formacion))
              WHEN 'universitario' THEN 'Universitario'
              WHEN 'universitaria' THEN 'Universitario'
              WHEN 'tecnologico' THEN 'Tecnologico'
              WHEN 'tecnologica' THEN 'Tecnologico'
              WHEN 'especializacion universitaria' THEN 'Especializacion Universitaria'
              WHEN 'maestria' THEN 'Maestria'
              WHEN 'formacion tecnica profesional' THEN 'Formacion Tecnica Profesional'
              WHEN 'especializacion tecnologica' THEN 'Especializacion Tecnologica'
              WHEN 'doctorado' THEN 'Doctorado'
              WHEN 'especializacion medico quirurgica' THEN 'Especializacion Medico Quirurgica'
              WHEN 'especializacion tecnico profesional' THEN 'Especializacion Tecnico Profesional'
              ELSE h.nivel_formacion
            END AS nivel_formacion
          FROM hecho_indicador h
          JOIN dim_programa p ON h.codigo_snies_programa = p.codigo_snies_programa AND h.codigo_institucion = p.codigo_institucion
          JOIN dim_institucion i ON p.codigo_institucion = i.codigo_institucion
        `);

        if (cancelled) return;
        connRef.current = conn;

        const poliRes = await conn.query(`SELECT DISTINCT institucion FROM dim_institucion WHERE institucion_completo ILIKE '%Grancolombiano%' LIMIT 1`);
        const poliRows = poliRes.toArray().map((r) => deBigInt(r.toJSON()));
        if (poliRows.length) poliNameRef.current = poliRows[0].institucion;

        const countRes = await conn.query(`SELECT COUNT(*) AS n FROM hecho_indicador`);
        const [{ n }] = countRes.toArray().map((r) => deBigInt(r.toJSON()));

        if (!cancelled) {
          setState({
            ready: true,
            error: null,
            message: `Datos cargados: ${Number(n).toLocaleString("es-CO")} registros, esquema estrella nacional 2016-2025.`,
          });
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setState({ ready: false, error: err, message: "Error cargando los datos: " + err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [decryptKey]);

  const query = useCallback((sql) => {
    const result = queueRef.current.then(async () => {
      if (!connRef.current) throw new Error("La base de datos aún no está lista.");
      const res = await connRef.current.query(sql);
      return res.toArray().map((r) => deBigInt(r.toJSON()));
    });
    // la cola sigue avanzando pase lo que pase con esta consulta -- si
    // fallara y no la "asentáramos" aquí, dejaría bloqueadas a todas las
    // siguientes en espera de una promesa que nunca se resuelve en éxito.
    queueRef.current = result.then(
      () => {},
      () => {}
    );
    return result;
  }, []);

  const isPoli = useCallback((name) => name === poliNameRef.current, []);

  const value = useMemo(
    () => ({ ...state, query, isPoli, get poliName() { return poliNameRef.current; } }),
    [state, query, isPoli]
  );

  return <DuckDBContext.Provider value={value}>{children}</DuckDBContext.Provider>;
}

export function useDuckDB() {
  const ctx = useContext(DuckDBContext);
  if (!ctx) throw new Error("useDuckDB debe usarse dentro de <DuckDBProvider>");
  return ctx;
}
