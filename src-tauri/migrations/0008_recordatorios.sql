-- Recordatorios de turnos por WhatsApp o mail.
-- "recordatorio_en": cuándo se abrió el recordatorio de ese turno para enviarlo
-- (AAAA-MM-DDTHH:MM, hora local). NULL = todavía no se envió. Si el turno cambia
-- de día u hora, vuelve a NULL para que se avise de nuevo.
ALTER TABLE turnos ADD COLUMN recordatorio_en TEXT;
