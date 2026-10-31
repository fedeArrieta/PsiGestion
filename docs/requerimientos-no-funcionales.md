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
| 1 | Copias de seguridad automáticas y restauración | Alta | No existe |
| 2 | Integridad de la base (claves foráneas, transacciones, modo WAL) | Alta | Parcial |
| 3 | Bloqueo de la app con contraseña o PIN | Alta | No existe |
| 4 | Cifrado de la base de datos | Alta | No existe |
| 5 | Endurecer la seguridad de Tauri (CSP y permisos) | Alta | Parcial |
| 6 | Exportación de datos (portabilidad) | Media | No existe |
| 7 | Registro de errores (logs) | Media | No existe |
| 8 | Actualizaciones automáticas | Media | No existe |
| 9 | Firma digital del instalador | Media | No existe |
| 10 | Precisión de los montos (sin errores de redondeo) | Media | Parcial |
| 11 | Borrado seguro y papelera | Media | Parcial |
| 12 | Rendimiento con varios años de datos | Media | Cubierto por ahora |
| 13 | Calidad: pruebas y CI | Media | Cubierto en parte |
| 14 | Usabilidad y atajos de teclado | Baja | Parcial |
| 15 | Accesibilidad | Baja | Parcial |
| 16 | Versionado y notas de cambios | Baja | No existe |
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

- Activar `PRAGMA foreign_keys = ON` al abrir la conexión en la app. Hoy solo está activo en los tests, así que la base real no impide, por ejemplo, un turno con un paciente inexistente.
- Usar transacciones en las operaciones de varios pasos (por ejemplo, copiar los gastos fijos al mes siguiente) para que no queden a medias.
- Activar el modo `WAL` para que un corte de luz durante una escritura no corrompa el archivo.
- Ejecutar `PRAGMA integrity_check` al iniciar (o antes de cada copia de seguridad) y avisar si falla.

### 3. Bloqueo de la app con contraseña o PIN (Alta)

La app guarda datos de salud mental (notas de pacientes y de sesiones). Cualquiera que use la computadora puede abrirla.

- Contraseña o PIN al abrir la app, guardado como hash (Argon2), nunca en texto plano.
- Bloqueo automático tras X minutos sin uso (configurable, por ejemplo 10).
- Opción para recuperar el acceso (por ejemplo, una clave de recuperación que se muestra una sola vez al configurar).

### 4. Cifrado de la base de datos (Alta)

Aunque la app tenga contraseña, el archivo `psigestion.db` se puede abrir con cualquier visor de SQLite.

- Cifrar la base con SQLCipher (o similar), con la clave derivada de la contraseña del punto 3.
- Alternativa más simple: recomendar y verificar que Windows tenga BitLocker activo, mostrando un aviso si no.
- La Ley 26.529 (derechos del paciente e historia clínica) y la Ley 25.326 (protección de datos personales) exigen confidencialidad e integridad de los datos de salud; el cifrado ayuda a cumplirlas.

### 5. Endurecer la seguridad de Tauri (Alta)

- Definir una CSP en `tauri.conf.json` (hoy es `null`): solo recursos propios de la app, sin scripts externos.
- Revisar los permisos de `capabilities/default.json` y dejar solo los que se usan.
- Mantener las dependencias actualizadas (por ejemplo con Dependabot) y revisar avisos de seguridad (`npm audit`, `cargo audit`) en el CI.

### 6. Exportación de datos (Media)

- Exportar pacientes, turnos y gastos a Excel/CSV, por mes o completo.
- Exportar la ficha de un paciente (datos y historial de sesiones) a PDF, por si el paciente la solicita o hay que entregarla.
- Sirve también como respaldo legible fuera de la app.

### 7. Registro de errores (Media)

Hoy los errores solo se muestran en pantalla y se pierden al cerrar.

- Usar `tauri-plugin-log` para guardar un archivo de log en la carpeta de la app, con rotación (por ejemplo, 5 archivos de 1 MB).
- No registrar datos de pacientes (nombres, notas): solo el tipo de error y la operación.
- Botón "Abrir carpeta de logs" para poder enviarlos al pedir soporte.
- Mensajes de error en pantalla en lenguaje simple, sin texto técnico.

### 8. Actualizaciones automáticas (Media)

Hoy cada versión nueva se descarga a mano desde GitHub Actions.

- Publicar versiones como *Releases* de GitHub y usar `tauri-plugin-updater` para avisar que hay una nueva y aplicarla con un clic.
- Hacer una copia de seguridad automática antes de actualizar.
- Las migraciones deben aplicarse solas al abrir la versión nueva (ya ocurre).

### 9. Firma digital del instalador (Media)

Sin firma, Windows SmartScreen muestra "Windows protegió su PC" al instalar. Firmar el instalador con un certificado de firma de código evita la advertencia y garantiza que no fue modificado. Tiene un costo anual, así que puede quedar para más adelante.

### 10. Precisión de los montos (Media)

Los montos se guardan como `REAL` (número con decimales binarios), lo que puede producir diferencias de centavos al sumar muchos valores.

- Guardar los montos en centavos como `INTEGER` (con una migración nueva) o redondear siempre a 2 decimales al calcular.
- Pruebas que verifiquen totales con muchos montos.

### 11. Borrado seguro y papelera (Media)

Los turnos y gastos eliminados se borran definitivamente (`DELETE`).

- Papelera o "deshacer" por unos segundos después de eliminar.
- Registro de cambios (auditoría) básico para turnos y pagos: qué cambió y cuándo. Útil si hay que reconstruir qué se cobró.
- Definir un plazo de conservación de los datos de pacientes dados de baja (la historia clínica se conserva al menos 10 años según la Ley 26.529).

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

- Numerar versiones (0.1.0, 0.2.0…) y mostrar la versión en la app.
- Mantener un `CHANGELOG.md` en español y mostrar "Novedades" después de actualizar.

### 17. Funcionamiento sin conexión (Baja)

Ya cubierto: la app no necesita internet. Solo hay que preservarlo al sumar funciones nuevas; las actualizaciones (punto 8) deben ser opcionales y no bloquear el uso si no hay conexión.

## Orden sugerido

1. Integridad de la base (2) y copias de seguridad (1): son rápidas y evitan perder datos.
2. CSP y permisos (5).
3. Contraseña (3) y cifrado (4), juntos, porque la clave del cifrado sale de la contraseña.
4. Logs (7) y exportación (6).
5. Precisión de montos (10) y papelera (11).
6. Versionado (16), actualizaciones (8) y firma (9).
7. El resto según se necesite.
