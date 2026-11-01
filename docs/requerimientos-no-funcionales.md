# Requerimientos no funcionales de PsiGestion

Estado al 31/10/2026, después de los pasos 1 a 4 (agenda, pacientes y pagos, finanzas).
La app es de escritorio para Windows, de un solo usuario, y guarda todo en una base SQLite local
(`%APPDATA%\com.psigestion.app\psigestion.db`).

Prioridades:

- **Alta**: protege los datos del paciente o evita perderlos. Conviene hacerlo antes de cargar datos reales.
- **Media**: mejora la confiabilidad y el mantenimiento a medida que la app crece.
- **Baja**: comodidad o pulido.

## Resumen

| # | Requerimiento | Prioridad | Estado actual |
|---|---|---|---|
| 1 | Copias de seguridad automáticas y restauración | Alta | Hecho (paso 1) |
| 2 | Integridad de la base (claves foráneas, transacciones, modo WAL) | Alta | Hecho (paso 1) |
| 3 | Bloqueo de la app con contraseña o PIN | Alta | Hecho (paso 3) |
| 4 | Cifrado de la base de datos | Alta | Hecho (paso 3) |
| 5 | Endurecer la seguridad de Tauri (CSP y permisos) | Alta | Hecho (paso 2) |
| 6 | Exportación de datos (portabilidad) | Media | Hecho (paso 4) |
| 7 | Registro de errores (logs) | Media | Hecho (paso 4) |
| 8 | Aviso de actualización y actualizaciones automáticas | Media | Hecho (paso 6) |
| 9 | Firma digital del instalador | Media | Pendiente (tiene costo) |
| 10 | Precisión de los montos (sin errores de redondeo) | Media | Hecho (paso 5) |
| 11 | Borrado seguro y papelera | Media | Hecho (paso 5) |
| 12 | Rendimiento con varios años de datos | Media | Cubierto por ahora |
| 13 | Calidad: pruebas y CI | Media | Cubierto en parte |
| 14 | Usabilidad y atajos de teclado | Baja | Parcial |
| 15 | Accesibilidad | Baja | Parcial |
| 16 | Versionado y notas de cambios | Baja | Hecho (paso 6) |
| 17 | Funcionamiento sin conexión | Baja | Cubierto |

## Lo que la app ya cubre

- **Datos locales y sin conexión**: no hay servidores ni envíos por internet; todo queda en la computadora.
- **Migraciones versionadas** de la base (`src-tauri/migrations`), con la regla de no modificar una ya publicada.
- **Validaciones** en la capa de datos (`src/repositorio.ts`): nombre obligatorio, montos no negativos, fecha y hora válidas, `CHECK` en la base para estados y montos.
- **Historial conservado**: dar de baja un paciente no borra sus turnos; el monto se copia al turno, así un cambio de tarifa no altera el pasado.
- **Confirmación** antes de eliminar turnos, gastos o dar de baja pacientes.
- **Pruebas automáticas** (Vitest) de la lógica de agenda, finanzas, fechas, formato y repositorio, que corren en GitHub Actions antes de compilar el instalador.
- **Instalador en español** (NSIS y MSI) generado en cada cambio.
- **Modo oscuro** según la configuración de Windows.
- **Índices** en las columnas que más se consultan (`turnos.inicio`, `turnos.paciente_id`, `gastos.mes`).

## Detalle

### 1. Copias de seguridad automáticas y restauración (Alta)

Hoy toda la información está en un único archivo. Si el disco falla, la computadora se pierde o el archivo se daña, se pierde todo.

- Copia automática al cerrar la app (o una vez por día), usando `VACUUM INTO` para obtener una copia consistente.
- Carpeta de destino elegible, pensada para una carpeta sincronizada (OneDrive, Google Drive) o un pendrive.
- Conservar las últimas N copias (por ejemplo 30 diarias) y borrar las más viejas.
- Botón "Hacer copia ahora" y "Restaurar desde una copia", con confirmación y copia previa del estado actual.
- Aviso visible si la última copia tiene más de 7 días.
- Si se implementa el cifrado (punto 4), las copias quedan cifradas también.

**Criterio de aceptación**: se puede borrar la base, restaurar la última copia y ver los mismos pacientes, turnos y gastos.

### 2. Integridad de la base (Alta)

Revisando el plugin de SQLite al implementar este punto, resultó que ya activa las claves foráneas en cada conexión y crea la base en modo `WAL`, así que esas dos cosas ya estaban cubiertas (ahora hay una prueba que lo verifica). Lo que se agregó:

- Transacciones para las operaciones de varios pasos (por ejemplo, cambiar la tarifa de un paciente y de sus turnos futuros), con un comando en Rust, porque el plugin usa varias conexiones y un `BEGIN` desde la interfaz no es confiable.
- `PRAGMA quick_check` al iniciar: si la base está dañada se avisa, se sugiere restaurar una copia y no se hace la copia automática para no guardar una base dañada.

### 3. Bloqueo de la app con contraseña (Alta)

Hecho en el paso 3:

- Contraseña obligatoria de al menos 8 caracteres. Al actualizar, la app la pide la primera vez que se abre.
- No se guarda la contraseña ni un hash de ella: se guarda la clave de datos cifrada con una clave derivada de la contraseña (Argon2id, 64 MiB, 3 pasadas, y XChaCha20-Poly1305) en `seguridad.json`. Tras un intento fallido hay una espera de un segundo.
- Clave de recuperación de 32 caracteres, que se muestra una sola vez. Con ella se entra y se elige una contraseña nueva. Desde la sección Seguridad se puede generar otra y cambiar la contraseña.
- Bloqueo automático tras 10 minutos sin uso (configurable, o nunca) y botón Bloquear. Al bloquear se cierra la base y se borra la clave de la memoria.

### 4. Cifrado de la base de datos (Alta)

Hecho en el paso 3:

- La base usa SQLCipher (AES-256) con la clave de datos. La abre Rust al desbloquear (`src-tauri/src/base.rs`), así que sin la contraseña la interfaz no puede leer nada.
- Una base sin cifrar de una versión anterior, o restaurada desde una copia vieja, se cifra sola al desbloquear.
- Las copias de seguridad quedan cifradas con la misma clave. Junto a ellas se guarda `psigestion-llave.json` (protegido por la contraseña y la clave de recuperación), que hace falta para abrirlas en otra computadora: la app lo pide si encuentra una base cifrada sin ese archivo.
- La sección Copias marca las copias viejas sin cifrar y permite borrarlas.

**Riesgo aceptado**: si se pierden la contraseña y la clave de recuperación, los datos no se pueden recuperar.

### 5. Endurecer la seguridad de Tauri (Alta)

Hecho en el paso 2:

- CSP en `tauri.conf.json`: solo recursos propios de la app, sin scripts, estilos, imágenes ni conexiones externas. Además `freezePrototype` para dificultar la manipulación de objetos de JavaScript.
- Permisos de `capabilities/default.json` reducidos a lo que se usa: abrir la base, leer, escribir y elegir una carpeta. Se quitaron `core:default` y el permiso de cerrar la base.
- CI semanal y en cada cambio con `npm audit` y `cargo audit` (flujo *Seguridad de dependencias*), y Dependabot propone actualizaciones una vez por mes.

### 6. Exportación de datos (Media)

Hecho en el paso 4:

- En **Copias de seguridad → Exportar a Excel**: un `.xlsx` con hojas de pacientes, turnos y gastos, de todo o de un mes, con montos en formato de pesos y filtros. Se avisa que el archivo no está cifrado.
- En la ficha del paciente, **Imprimir o guardar PDF**: abre la impresión de Windows con los datos, el saldo y el historial de sesiones; con "Microsoft Print to PDF" se guarda como PDF.

### 7. Registro de errores (Media)

Hecho en el paso 4:

- `tauri-plugin-log` guarda `psigestion.log` en `%LOCALAPPDATA%\com.psigestion.app\logs`, con hasta 5 archivos de 1 MB.
- Se registran el inicio, las restauraciones, los errores al abrir la base, los intentos de contraseña incorrecta y cualquier error de la interfaz, con la operación y el mensaje técnico. No se registran valores de los datos (las consultas usan parámetros, que no aparecen en los mensajes).
- **Seguridad → Abrir carpeta de registros** abre la carpeta en el Explorador.
- Los errores en pantalla se muestran en lenguaje simple (`src/errores.ts`); los técnicos se reemplazan por un mensaje genérico que remite al registro.

### 8. Aviso de actualización y actualizaciones automáticas (Media)

**Hecho (paso 6).** Se cumplió todo lo de abajo:

- La app busca al abrir y cada 24 horas el archivo `latest.json` del último Release de GitHub. El aviso es una barra arriba del contenido (no una ventana), con las novedades y los tres botones. "Recordarme más tarde" lo pospone 24 horas.
- "Actualizar ahora" pide confirmación, hace una copia de seguridad ("Antes de restaurar o actualizar"), descarga, verifica la firma e instala.
- En **Versión y novedades** (abajo en el menú) están la versión instalada, la opción de búsqueda automática, el botón "Buscar actualizaciones" y las novedades de cada versión.
- Las versiones se publican con el flujo **Publicar versión** (`.github/workflows/publicar-version.yml`) al empujar un tag `vX.Y.Z`. Las actualizaciones se firman con una clave guardada en el secreto `TAURI_SIGNING_PRIVATE_KEY` del repositorio; la clave pública está en `tauri.conf.json`.

Lo que se había pedido:

**Aviso de actualización del sistema**

- Al abrir la app (y cada 24 horas si queda abierta) consultar si hay una versión nueva publicada en los *Releases* de GitHub.
- Si la hay, mostrar un aviso discreto dentro de la app (barra o tarjeta, no una ventana que bloquee) con la versión nueva, la actual y un resumen de las novedades en español.
- Opciones del aviso: "Actualizar ahora", "Recordarme más tarde" y "Omitir esta versión".
- No interrumpir: el aviso no aparece encima de un formulario abierto (por ejemplo, mientras se carga un turno) y nunca cierra la app sin confirmación.
- Si no hay internet o la consulta falla, no mostrar ningún error: la app sigue funcionando igual y vuelve a intentar más tarde.
- La consulta no envía datos de pacientes ni de uso; solo pide el número de la última versión.
- En la configuración, opción para activar o desactivar la búsqueda automática y botón "Buscar actualizaciones".
- Mostrar la versión instalada en la app (ver punto 16).

**Instalación de la actualización**

- Usar `tauri-plugin-updater` para descargar e instalar con un clic, verificando la firma del paquete de actualización (Tauri lo exige).
- Hacer una copia de seguridad automática (punto 1) antes de instalar.
- Las migraciones deben aplicarse solas al abrir la versión nueva (ya ocurre).
- Después de actualizar, mostrar "Novedades" una vez.

**Criterio de aceptación**: con una versión anterior instalada y una nueva publicada, al abrir la app aparece el aviso; al elegir "Actualizar ahora" se instala, se reabre en la versión nueva y los datos siguen intactos.

### 9. Firma digital del instalador (Media)

Sin firma, Windows SmartScreen muestra "Windows protegió su PC" al instalar. Firmar el instalador con un certificado de firma de código evita la advertencia y garantiza que no fue modificado. Tiene un costo anual, así que puede quedar para más adelante.

**Pendiente.** Mientras tanto, los paquetes de actualización sí van firmados (punto 8): la app rechaza una actualización que no haya firmado la clave del proyecto. La advertencia de SmartScreen sigue apareciendo al instalar a mano. Opciones cuando se decida:

- Azure Trusted Signing (alrededor de USD 10 por mes): se integra con GitHub Actions, sin certificado físico.
- Un certificado de firma de código OV de una autoridad certificadora (desde unos USD 200 por año).

Con cualquiera de las dos, el flujo **Publicar versión** solo necesita los secretos del certificado para firmar el instalador.

### 10. Precisión de los montos (Media)

**Hecho (paso 5).** Los montos (tarifas, turnos, gastos y objetivo mensual) se guardan como centavos enteros. La migración 0004 convierte los datos existentes al abrir la versión nueva. La app sigue mostrando y pidiendo pesos: la conversión se hace en un solo lugar (`src/repositorio.ts`), así que las sumas se hacen sobre enteros y no acumulan errores de redondeo.

- Pruebas: sumar 0,1 + 0,2 y mil montos de 0,01 da exactamente el total esperado, y la migración convierte bien una base con datos anteriores.

### 11. Borrado seguro y papelera (Media)

**Hecho (paso 5).**

- Al eliminar un turno o un gasto aparece una barra con "Deshacer" durante unos segundos.
- Lo eliminado va a la sección "Papelera e historial", donde se puede restaurar o borrar definitivamente. Se vacía sola a los 30 días.
- Historial de cambios de los turnos: creación, cambio de estado, pago, cambio de monto, reprogramación y eliminación, con fecha y hora. Se registra automáticamente en la base (triggers de SQLite), sin depender de la pantalla.
- Conservación de pacientes dados de baja: la app no borra pacientes ni su historia automáticamente. La Ley 26.529 exige conservar la historia clínica al menos 10 años, así que los pacientes inactivos quedan guardados (y en las copias de seguridad) hasta que la profesional decida otra cosa.

### 12. Rendimiento (Media)

Con las consultas por rango de fechas y los índices actuales, la app debería responder bien durante años.

- Objetivo: abrir la app en menos de 2 segundos y cambiar de semana o mes en menos de 300 ms con 5 años de datos (unos 10.000 turnos).
- Agregar una prueba con datos de volumen que mida estas consultas.
- Paginar o buscar en el listado de pacientes si supera unos cientos.

### 13. Calidad: pruebas y CI (Media)

- Mantener las pruebas existentes y sumar pruebas de las pantallas principales (React Testing Library).
- Agregar verificación de tipos y un linter (ESLint) en el CI.
- Probar las migraciones sobre una base con datos de una versión anterior.

### 14. Usabilidad (Baja)

- Atajos de teclado: nuevo turno, ir a hoy, semana anterior y siguiente, buscar paciente.
- Búsqueda de pacientes por nombre.
- Recordar la última sección y semana abiertas.
- Formatos de fecha y moneda argentinos en toda la app (ya se usan en gran parte).

### 15. Accesibilidad (Baja)

- Navegación completa con teclado y foco visible.
- Etiquetas en todos los campos y botones de solo ícono.
- Contraste suficiente (WCAG AA) en modo claro y oscuro, incluidos los colores de estado de los turnos.
- Respetar el tamaño de texto y el zoom de Windows.

### 16. Versionado y notas de cambios (Baja)

**Hecho (paso 6).** La versión sale de `package.json` (Tauri la toma de ahí) y se ve abajo en el menú. Las novedades están en `CHANGELOG.md`, la app las muestra en **Versión y novedades** y avisa una vez al abrir una versión nueva. Una prueba verifica que el CHANGELOG tenga la entrada de la versión actual.

- Numerar versiones (0.1.0, 0.2.0…) y mostrar la versión en la app.
- Mantener un `CHANGELOG.md` en español y mostrar "Novedades" después de actualizar.

### 17. Funcionamiento sin conexión (Baja)

Ya cubierto: la app no necesita internet. Solo hay que preservarlo al sumar funciones nuevas; las actualizaciones (punto 8) deben ser opcionales y no bloquear el uso si no hay conexión.

## Orden sugerido

1. ~~Integridad de la base (2) y copias de seguridad (1)~~: hecho.
2. ~~CSP y permisos (5)~~: hecho.
3. ~~Contraseña (3) y cifrado (4)~~: hecho.
4. ~~Logs (7) y exportación (6)~~: hecho.
5. ~~Precisión de montos (10) y papelera (11)~~: hecho.
6. ~~Versionado (16), aviso de actualización y actualizaciones (8)~~: hecho. Firma (9): pendiente, tiene costo. El aviso y el versionado van juntos, porque el aviso necesita saber qué versión está instalada.
7. El resto según se necesite.
