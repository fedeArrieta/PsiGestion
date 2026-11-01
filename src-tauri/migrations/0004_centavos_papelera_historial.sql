-- 1) Montos en centavos. Desde esta versión todas las columnas de montos guardan
--    centavos enteros (25000 pesos = 2500000), así las sumas son exactas.
--    La interfaz sigue trabajando en pesos: la conversión está en src/repositorio.ts.
UPDATE pacientes SET monto_sesion = CAST(ROUND(monto_sesion * 100) AS INTEGER);
UPDATE turnos    SET monto        = CAST(ROUND(monto * 100) AS INTEGER);
UPDATE gastos    SET monto        = CAST(ROUND(monto * 100) AS INTEGER);
UPDATE objetivos SET monto        = CAST(ROUND(monto * 100) AS INTEGER);

-- 2) Papelera: los turnos y gastos eliminados se guardan acá (como JSON) durante
--    30 días, para poder recuperarlos.
CREATE TABLE papelera (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo          TEXT NOT NULL CHECK (tipo IN ('turno', 'gasto')),
    registro_id   INTEGER NOT NULL,
    datos         TEXT NOT NULL,
    descripcion   TEXT NOT NULL,
    eliminado_en  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 3) Historial de cambios de turnos y pagos, lo completan los triggers.
CREATE TABLE historial (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha        TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    turno_id     INTEGER NOT NULL,
    paciente_id  INTEGER NOT NULL,
    accion       TEXT NOT NULL,
    detalle      TEXT NOT NULL
);

CREATE INDEX idx_historial_paciente ON historial (paciente_id, fecha);

CREATE TRIGGER historial_turno_creado AFTER INSERT ON turnos BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    VALUES (NEW.id, NEW.paciente_id, 'creado', 'Turno del ' || NEW.inicio || ' (' || NEW.estado || ')');
END;

CREATE TRIGGER historial_turno_estado AFTER UPDATE OF estado ON turnos WHEN OLD.estado <> NEW.estado BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    VALUES (NEW.id, NEW.paciente_id, 'estado', 'Turno del ' || NEW.inicio || ': ' || OLD.estado || ' → ' || NEW.estado);
END;

CREATE TRIGGER historial_turno_pago AFTER UPDATE OF pagado ON turnos WHEN OLD.pagado <> NEW.pagado BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    VALUES (NEW.id, NEW.paciente_id, CASE WHEN NEW.pagado THEN 'pagado' ELSE 'no pagado' END,
            'Turno del ' || NEW.inicio || ': ' || CASE WHEN NEW.pagado THEN 'marcado como pagado' ELSE 'pago anulado' END);
END;

CREATE TRIGGER historial_turno_monto AFTER UPDATE OF monto ON turnos WHEN OLD.monto <> NEW.monto BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    VALUES (NEW.id, NEW.paciente_id, 'monto',
            'Turno del ' || NEW.inicio || ': monto ' || printf('%.2f', OLD.monto / 100.0) || ' → ' || printf('%.2f', NEW.monto / 100.0));
END;

CREATE TRIGGER historial_turno_fecha AFTER UPDATE OF inicio ON turnos WHEN OLD.inicio <> NEW.inicio BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    VALUES (NEW.id, NEW.paciente_id, 'reprogramado', 'Turno movido del ' || OLD.inicio || ' al ' || NEW.inicio);
END;

CREATE TRIGGER historial_turno_eliminado AFTER DELETE ON turnos BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    VALUES (OLD.id, OLD.paciente_id, 'eliminado', 'Turno del ' || OLD.inicio || ' eliminado');
END;
