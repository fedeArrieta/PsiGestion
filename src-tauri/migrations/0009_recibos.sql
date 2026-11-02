-- Recibos de pago (comprobantes simples, no son facturas).
-- Cada recibo guarda una copia de los datos con los que se emitió (profesional,
-- paciente, renglones), así se puede volver a generar el mismo PDF aunque
-- después cambien la ficha del paciente o los datos del profesional.
-- Los montos van en centavos, como en el resto de la base.

ALTER TABLE pacientes ADD COLUMN documento TEXT;

CREATE TABLE recibos (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    numero              INTEGER NOT NULL UNIQUE,
    fecha               TEXT NOT NULL,              -- AAAA-MM-DD
    paciente_id         INTEGER NOT NULL REFERENCES pacientes (id),
    paciente_nombre     TEXT NOT NULL,
    paciente_documento  TEXT,
    total               INTEGER NOT NULL,           -- centavos
    medio_pago          TEXT,
    -- JSON: [{ "turno_id", "fecha", "concepto", "importe" (centavos) }]
    items               TEXT NOT NULL,
    -- JSON con los datos del profesional al momento de emitirlo.
    emisor              TEXT NOT NULL,
    anulado_en          TEXT,
    motivo_anulacion    TEXT,
    creado_en           TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_recibos_paciente ON recibos (paciente_id, fecha);

-- Qué turnos cubre cada recibo. Sin clave foránea a turnos: un turno puede ir a la
-- papelera y volver con el mismo id.
CREATE TABLE recibo_turnos (
    recibo_id  INTEGER NOT NULL REFERENCES recibos (id),
    turno_id   INTEGER NOT NULL,
    PRIMARY KEY (recibo_id, turno_id)
);

CREATE INDEX idx_recibo_turnos_turno ON recibo_turnos (turno_id);

-- Un recibo emitido no se borra ni se modifica: solo se puede anular.
CREATE TRIGGER recibos_sin_borrar BEFORE DELETE ON recibos BEGIN
    SELECT RAISE(ABORT, 'Los recibos emitidos no se borran: se anulan.');
END;

CREATE TRIGGER recibos_sin_modificar BEFORE UPDATE ON recibos
WHEN NEW.numero IS NOT OLD.numero OR NEW.fecha IS NOT OLD.fecha OR NEW.paciente_id IS NOT OLD.paciente_id
  OR NEW.paciente_nombre IS NOT OLD.paciente_nombre OR NEW.paciente_documento IS NOT OLD.paciente_documento
  OR NEW.total IS NOT OLD.total OR NEW.medio_pago IS NOT OLD.medio_pago OR NEW.items IS NOT OLD.items
  OR NEW.emisor IS NOT OLD.emisor OR (OLD.anulado_en IS NOT NULL AND NEW.anulado_en IS NOT OLD.anulado_en)
BEGIN
    SELECT RAISE(ABORT, 'Un recibo emitido no se puede modificar: anulalo y emití uno nuevo.');
END;

CREATE TRIGGER recibo_turnos_sin_borrar BEFORE DELETE ON recibo_turnos BEGIN
    SELECT RAISE(ABORT, 'Los recibos emitidos no se borran: se anulan.');
END;

-- Historial: emisión y anulación quedan registradas en cada turno del recibo.
CREATE TRIGGER historial_recibo_emitido AFTER INSERT ON recibo_turnos BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    SELECT NEW.turno_id, r.paciente_id, 'recibo',
           'Recibo N° ' || printf('%08d', r.numero) || ' emitido (turno del ' || COALESCE(t.inicio, '?') || ')'
      FROM recibos r LEFT JOIN turnos t ON t.id = NEW.turno_id
     WHERE r.id = NEW.recibo_id;
END;

CREATE TRIGGER historial_recibo_anulado AFTER UPDATE OF anulado_en ON recibos
WHEN OLD.anulado_en IS NULL AND NEW.anulado_en IS NOT NULL BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    SELECT rt.turno_id, NEW.paciente_id, 'recibo anulado',
           'Recibo N° ' || printf('%08d', NEW.numero) || ' anulado' ||
           CASE WHEN NEW.motivo_anulacion IS NOT NULL THEN ': ' || NEW.motivo_anulacion ELSE '' END
      FROM recibo_turnos rt WHERE rt.recibo_id = NEW.id;
END;
