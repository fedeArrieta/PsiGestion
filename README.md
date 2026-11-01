# PsiGestion

Aplicación de escritorio para Windows que ayuda a un psicólogo a gestionar su agenda de turnos, pacientes y finanzas mensuales. Todos los datos se guardan solo en la computadora, en una base SQLite local.

## Contraseña y cifrado

La app pide una contraseña al abrirse y guarda los datos cifrados con SQLCipher. Al crear la contraseña se muestra una clave de recuperación, que es la única forma de entrar si se olvida la contraseña. Se bloquea sola tras 10 minutos sin uso (se cambia en **Seguridad**).

## Copias de seguridad

La app hace una copia automática de la base al abrirse (como máximo una vez por día) en `Documentos\PsiGestion\Copias`, y conserva las últimas 30. Desde la sección **Copias de seguridad** se puede cambiar la carpeta (conviene una sincronizada con la nube o un disco externo), hacer una copia manual y restaurar cualquier copia. Antes de restaurar se guarda una copia del estado actual. Las copias están cifradas; para abrirlas en otra computadora hace falta el archivo `psigestion-llave.json`, que la app guarda en la misma carpeta.

## Tecnología

- [Tauri 2](https://tauri.app) para la app de escritorio (instalador liviano para Windows).
- React + TypeScript + Vite para la interfaz.
- SQLite mediante `tauri-plugin-sql`. Las tablas se crean con las migraciones de `src-tauri/migrations`.

## Descargar el instalador

La última versión publicada está en [Releases](https://github.com/fedeArrieta/PsiGestion/releases/latest). Una vez instalada, la app avisa sola cuando sale una versión nueva y se actualiza con un clic.

Además, cada cambio compila un instalador de prueba en GitHub Actions (flujo **Instalador de Windows**): abrí la ejecución en la pestaña *Actions* y descargá el artefacto `PsiGestion-instalador-windows`.

## Publicar una versión

1. Subir la versión en `package.json` y `src-tauri/Cargo.toml` (por ejemplo, `0.2.1`).
2. Agregar arriba en `CHANGELOG.md` la sección `## [0.2.1] - AAAA-MM-DD` con las novedades en español.
3. Después de mergear, en la pestaña *Actions* elegir **Publicar versión** y tocar *Run workflow* sobre `main`. (También se puede empujar el tag: `git tag v0.2.1 && git push origin v0.2.1`.)

El flujo **Publicar versión** compila, firma la actualización con el secreto `TAURI_SIGNING_PRIVATE_KEY` y crea el Release con `latest.json`. Si la clave privada se pierde, las versiones instaladas ya no pueden actualizarse solas (habría que reinstalar a mano), así que guardala también fuera de GitHub.

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
