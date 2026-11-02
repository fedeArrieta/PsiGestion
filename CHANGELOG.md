# Novedades de PsiGestion

Cada versión lista lo que cambió, en español y pensado para quien usa la app.

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
