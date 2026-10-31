# PsiGestion

Aplicación de escritorio para Windows que ayuda a un psicólogo a gestionar su agenda de turnos, pacientes y finanzas mensuales. Todos los datos se guardan solo en la computadora, en una base SQLite local.

## Tecnología

- [Tauri 2](https://tauri.app) para la app de escritorio (instalador liviano para Windows).
- React + TypeScript + Vite para la interfaz.
- SQLite mediante `tauri-plugin-sql`. Las tablas se crean con las migraciones de `src-tauri/migrations`.

## Descargar el instalador

Cada cambio compila el instalador en GitHub Actions (flujo **Instalador de Windows**). Abrí la ejecución más reciente en la pestaña *Actions* y descargá el artefacto `PsiGestion-instalador-windows`, que trae el `.exe` (NSIS) y el `.msi`.

## Desarrollo local (Windows)

1. Instalar los [requisitos de Tauri para Windows](https://tauri.app/start/prerequisites/): Microsoft C++ Build Tools, WebView2 y Rust.
2. Instalar Node.js 22.
3. Ejecutar:

```sh
npm install
npm run tauri dev
```

Para generar el instalador localmente: `npm run tauri build`.

Para correr las pruebas: `npm test`.

## Plan

1. Base del proyecto: estructura, base de datos e instalador automático.
2. Agenda de turnos.
3. Pacientes y monto por sesión.
4. Finanzas del mes: objetivo, gastos y sesiones necesarias.
