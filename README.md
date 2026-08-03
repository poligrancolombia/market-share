# Market Share — Educación Superior

Panel de analítica del mercado de educación superior en Colombia (SNIES 2016-2024), construido con React + Vite + DuckDB-WASM. No tiene backend: corre 100% en el navegador y consulta los datos como Parquet directamente desde Cloud Storage.

## Acceso con contraseña

El sitio pide una contraseña antes de cargar los datos. Los archivos Parquet en el bucket están **encriptados (AES-256-GCM)** — sin la contraseña correcta, cualquiera que baje esos archivos directamente del bucket público solo obtiene bytes ilegibles. La contraseña nunca se guarda en el código del sitio: solo se usa en el navegador para derivar (PBKDF2) la llave de desencriptado en el momento.

**Cambiar la contraseña compartida:** desde la raíz del proyecto (no `webapp/`), volver a correr el pipeline de publicación con la contraseña nueva:

```bash
GOOGLE_APPLICATION_CREDENTIALS="market-share-503713-ff5d79996657.json" SITE_PASSWORD="nueva-contraseña" ./.venv/Scripts/python.exe etl/export.py
```

Esto re-encripta y re-sube los 5 Parquet al bucket con la nueva contraseña; no hace falta tocar ni redeployar el frontend.

## Desarrollo local

```bash
npm install
npm run dev
```

## Build de producción

```bash
npm run build
```

Genera `dist/` — listo para servir como sitio estático (GitHub Pages, Netlify, etc.).
