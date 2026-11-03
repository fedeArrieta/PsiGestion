# Novedades de PsiGestion

Cada versión lista lo que cambió, en español y pensado para quien usa la app.

## [0.9.1] - 2026-11-03

### Nuevo

- Feriados y vacaciones: al agregar uno a mano se elige el tipo (Feriado o Vacaciones). Para cambiar el tipo de uno ya cargado, tocá su etiqueta en la lista.
- Recordatorios: se aclara desde dónde salen los mensajes (tu WhatsApp y tu programa de correo de esta computadora).

### Corregido

- Generar un recibo (o el recibo de ejemplo) daba el error "Cannot assign to read only property 'toString'". Lo mismo pasaba al exportar un reporte en PDF.
- Las preguntas de confirmación (por ejemplo "¿Eliminar este turno?") no aparecían y la acción se hacía igual. Ahora se muestran y, si respondés No, no se hace nada.
- Si ocurre un error interno, la app ya no se cierra de golpe: queda anotado en el registro de errores para poder corregirlo.

## [0.9.0] - 2026-11-02

### Nuevo

- Sección "Reportes" en el menú, con los números de los últimos 12 meses o de cada año.
- Resumen del período: ingresos (sesiones y ausencias cobradas), gastos, ganancia neta, en cuántos meses se cumplió el objetivo, tasa de ausencias y pacientes atendidos.
- Gráficos mes a mes: ingresos y gastos, ganancia neta comparada con el objetivo mensual, tasa de ausencias y pacientes activos. Al pasar el mouse por un mes se ven los números exactos. El mes en curso se muestra más claro porque todavía puede cambiar.
- "Ver tabla" muestra los mismos números en una tabla, con el objetivo cumplido o no en cada mes.
- Exportar PDF: un reporte de dos hojas para el contador, con tus datos (nombre, matrícula y CUIT de Configuración → Recibos), el resumen, los gráficos y el detalle mes a mes.
- Exportar Excel: hojas con el resumen mensual (ingresos, cobrado, pendiente, gastos, ganancia neta, objetivo, recibos emitidos, ausencias y pacientes), los gastos y los recibos del período.

### Privacidad

- Los reportes y sus archivos llevan solo números, gastos y recibos: nunca notas ni datos clínicos. Los archivos exportados no están cifrados: guardalos en un lugar seguro.

## [0.8.0] - 2026-11-02

### Nuevo

- Recibos de pago en PDF: al marcar un pago en la ficha del paciente (una sesión o "Marcar todo pagado"), aparece "Emitir recibo". El recibo lleva tus datos, el nombre del paciente (y su DNI o CUIT si lo cargaste), la fecha, la forma de pago, el detalle de las sesiones con sus importes y el total en números y en letras.
- El PDF se guarda en Documentos\PsiGestion\Recibos (se puede cambiar) y se abre con un clic, o se muestra en la carpeta para adjuntarlo en un mail o en WhatsApp.
- Numeración correlativa: cada recibo tiene su número y no se repite. Si ya venías usando un talonario, podés elegir desde qué número seguir.
- En la ficha del paciente, la pestaña "Recibos" lista sus recibos y permite emitir uno con los pagos que todavía no tienen. En la lista de sesiones, el ícono de recibo muestra qué pagos ya tienen el suyo y abre el PDF.
- Configuración → Recibos: tus datos para el recibo (nombre, profesión, matrícula, CUIT, domicilio, teléfono y email), el concepto de cada sesión, el texto al pie ("Documento no válido como factura." por defecto), un recibo de ejemplo para ver cómo queda y la lista de todos los recibos emitidos.
- Ficha del paciente: nuevo campo "DNI o CUIT", opcional.
- La exportación a Excel suma una hoja con los recibos.

### Seguridad y privacidad

- Un recibo emitido no se borra ni se modifica: si hay un error se anula (queda guardado con la marca ANULADO) y sus pagos se pueden incluir en uno nuevo. La emisión y la anulación quedan en el historial de cambios.
- El recibo lleva solo fechas, concepto e importes: nunca notas ni datos clínicos. Es un comprobante de pago, no una factura electrónica.
- Los PDF no están cifrados: guardalos en un lugar seguro. Si se borran, se pueden volver a generar iguales desde la lista de recibos.

## [0.7.0] - 2026-11-02

### Nuevo

- Recordatorios de turnos: la sección "Recordatorios" del menú muestra los turnos de mañana (o del día que elijas) y, para cada uno, el mensaje ya escrito. El botón "WhatsApp" lo abre en WhatsApp (en la aplicación o en WhatsApp Web) listo para enviar, y "Mail" lo abre en tu programa de correo con el asunto completo. También se puede copiar el mensaje para pegarlo en otro lado.
- La app recuerda qué recordatorios ya enviaste ("Enviado" con la hora) y el menú muestra cuántos turnos de mañana todavía no tienen el suyo. Si un turno cambia de día u hora, vuelve a quedar sin enviar.
- El mensaje se puede editar: texto, asunto del mail y datos que se completan solos ({nombre}, {dia}, {fecha}, {hora} y {profesional}), con una vista previa.
- Los turnos cancelados y las ausencias avisadas no aparecen; los turnos recurrentes sí, como cualquier otro turno.
- Los teléfonos se pasan solos al formato de WhatsApp (por ejemplo, 011 15 1234-5678 → +54 9 11 1234-5678). Si falta la característica, la app avisa para corregirlo en la ficha del paciente.

### Privacidad

- Los mensajes llevan solo el nombre del paciente, el día y la hora: nunca notas ni datos clínicos. No se manda nada solo; siempre lo revisás y lo enviás vos. La app solo tiene permiso para abrir enlaces de WhatsApp (wa.me) y de correo.

## [0.6.0] - 2026-11-02

### Nuevo

- Ausencias con y sin aviso: en el turno, el estado ahora distingue "Ausente con aviso" (el paciente avisó que no venía) de "Ausente sin aviso". "Cancelado" queda para los turnos que cancelás vos, y no se cobran.
- Cobro opcional de las ausencias: al marcar una ausencia se puede elegir "Cobrar la sesión" y cuánto. Lo que se cobra se suma al saldo del paciente, a "Marcar todo pagado" y a lo ganado del mes en Inicio y Finanzas.
- Política de cobro (Configuración → Ausencias): cuánto proponer cobrar en cada tipo de ausencia (nada, 25 %, 50 %, 75 % o la sesión completa). Por defecto: sin aviso se cobra completa y con aviso no se cobra. Es solo la sugerencia: en cada turno se puede cambiar.
- Una ausencia avisada deja libre el horario: no cuenta como superposición al agendar otro turno o una serie en ese horario. En la agenda se ve con borde punteado.
- En los turnos recurrentes, marcar una ausencia cambia solo ese turno: la serie sigue igual y la ausencia se conserva si después se modifica la serie.
- El diario clínico del paciente muestra las ausencias en la línea de tiempo, junto a las notas.
- Finanzas muestra cuántas ausencias y cancelaciones hubo en el mes y cuánto se cobra por ausencias. La ficha impresa, el historial de cambios y la exportación a Excel también incluyen el tipo de ausencia y el cobro.

### Cambios

- Las ausencias cargadas antes de esta versión quedan como "Ausente sin aviso" y sin cobrar, así no cambia ningún saldo.

## [0.5.0] - 2026-11-02

### Nuevo

- Diario clínico de cada paciente: en la ficha del paciente, la pestaña "Diario clínico" muestra todas sus notas de la más nueva a la más vieja, con el texto completo, un buscador y el botón "Nueva nota". Cada nota puede quedar vinculada a una sesión de la agenda.
- Sección "Notas clínicas" en el menú para buscar en las notas de todos los pacientes; desde cada resultado se abre la nota o el diario del paciente.
- Plantillas para empezar la nota: "Sesión" (motivo de consulta, observaciones y tareas), "Primera entrevista" y "Nota libre". Si se cambia de plantilla no se pierde lo escrito.
- La búsqueda no distingue mayúsculas ni tildes y resalta las palabras encontradas.
- Desde un turno de la agenda, el botón "Nota de la sesión" abre (o crea) la nota de ese turno. En la ficha del paciente, cada sesión tiene un ícono para ver o escribir su nota.
- Cada vez que se modifica una nota se guarda la versión anterior, que se puede consultar desde la misma nota.
- Las notas eliminadas van a la papelera durante 30 días y se pueden recuperar (o deshacer en el momento).

### Privacidad

- Las notas se guardan dentro de la base cifrada con tu contraseña y entran en las copias de seguridad (también cifradas). No se incluyen en la exportación a Excel ni se escriben en el registro de errores, y la papelera solo muestra paciente y fecha, nunca el contenido.

## [0.4.0] - 2026-11-02

### Nuevo

- Turnos recurrentes: al crear un turno se puede elegir que se repita todas las semanas o cada 2, 3 o 4 semanas, sin fecha de fin o hasta una fecha. La app agenda los turnos de los próximos seis meses y va agregando los siguientes sola.
- Antes de guardar, la ventana muestra cuántos turnos se van a agendar, cuáles caen en feriados o vacaciones y cuáles se superponen con otros turnos.
- En un turno que es parte de una serie se elige si el cambio es "Solo este turno" o "Este y los siguientes" (día, hora, duración, frecuencia, paciente o notas). También se puede terminar la serie desde ese turno; los turnos que se quitan van a la papelera.
- Feriados y vacaciones (botón en la Agenda): en esos días no se agendan los turnos recurrentes. Se pueden cargar de una vez los feriados nacionales del año. Si después se borra un período, sus turnos recurrentes vuelven a la agenda.
- La agenda marca los días feriados o de vacaciones y muestra un ícono en los turnos recurrentes.

## [0.3.1] - 2026-11-02

### Correcciones

- Actualizar desde el aviso de la app ya no falla con "No se ha podido cerrar PsiGestion": la app cierra la base y se cierra del todo antes de que corra el instalador, sin dejar un proceso abierto en segundo plano.

## [0.3.0] - 2026-11-01

### Nuevo

- Diseño nuevo con la identidad de PsiGestion: verde salvia y verde bosque, tipografía Plus Jakarta Sans e íconos en todo el menú.
- Pantalla de Inicio: saludo con tu nombre, turnos de hoy, pacientes activos, ingresos del mes comparados con el mes anterior, saldo por cobrar, próximos turnos y avance del objetivo.
- Tema claro y oscuro: por defecto sigue a Windows; se puede fijar desde el menú.
- Logo e ícono de la app nuevos.

### Mejoras

- Colores de estado en la agenda: verde programado, naranja realizado sin cobrar, azul pagado, rojo ausente y gris cancelado.

## [0.2.1] - 2026-11-01

### Mejoras

- Primera actualización automática: sirve para comprobar que el aviso de actualización funciona de punta a punta.

## [0.2.0] - 2026-11-01

### Nuevo

- Aviso de actualización: la app avisa cuando hay una versión nueva y se actualiza con un clic. Antes de instalar hace una copia de seguridad.
- La versión instalada se ve abajo en el menú, junto con estas novedades.
- Papelera: lo que se elimina se puede deshacer en el momento o restaurar durante 30 días.
- Historial de cambios de cada turno: creación, estado, pago, monto, reprogramación y eliminación.
- Contraseña para abrir la app y bloqueo automático después de un rato sin uso.
- Los datos y las copias de seguridad están cifrados.
- Copias de seguridad automáticas diarias y restauración desde la app.
- Exportación a Excel e impresión de la ficha del paciente.
- Registro de errores para diagnosticar problemas, sin datos de pacientes.

### Mejoras

- Los montos se guardan en centavos, así que los totales no tienen errores de redondeo.
- Chequeo de integridad de la base al abrir.

## [0.1.0] - 2026-10-31

### Nuevo

- Agenda semanal de turnos de 50 minutos, de 8 a 21.
- Pacientes, tarifas, pagos y saldo pendiente.
- Finanzas del mes: ingresos, gastos y objetivo de ganancia.
