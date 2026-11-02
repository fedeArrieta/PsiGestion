-- Notas clínicas: la evolución del paciente sesión por sesión.
-- Quedan dentro de la base cifrada (SQLCipher), igual que el resto de los datos;
-- no se exportan a Excel ni se escriben en el registro de errores.
CREATE TABLE notas_clinicas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id    INTEGER NOT NULL REFERENCES pacientes(id),
    -- Sesión a la que corresponde, si hay. Sin clave foránea a propósito: si el turno
    -- va a la papelera y se restaura (con el mismo id), la nota sigue vinculada.
    turno_id       INTEGER,
    fecha          TEXT    NOT NULL,                     -- AAAA-MM-DD
    plantilla      TEXT    NOT NULL DEFAULT 'sesion',
    -- Lista JSON de secciones: [{"titulo": "Motivo de consulta", "texto": "…"}, …]
    secciones      TEXT    NOT NULL CHECK (json_valid(secciones)),
    creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    modificado_en  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_notas_paciente ON notas_clinicas (paciente_id, fecha);
-- Una nota por sesión.
CREATE UNIQUE INDEX idx_notas_turno ON notas_clinicas (turno_id) WHERE turno_id IS NOT NULL;

-- Versiones anteriores de cada nota: al modificarla se guarda cómo estaba.
CREATE TABLE notas_versiones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nota_id      INTEGER NOT NULL,
    fecha        TEXT    NOT NULL,
    plantilla    TEXT    NOT NULL,
    secciones    TEXT    NOT NULL,
    guardada_en  TEXT    NOT NULL                        -- cuándo se había guardado esa versión
);

CREATE INDEX idx_notas_versiones_nota ON notas_versiones (nota_id, id);

CREATE TRIGGER notas_version_anterior AFTER UPDATE OF secciones, fecha, plantilla ON notas_clinicas
WHEN OLD.secciones IS NOT NEW.secciones OR OLD.fecha IS NOT NEW.fecha OR OLD.plantilla IS NOT NEW.plantilla
BEGIN
    INSERT INTO notas_versiones (nota_id, fecha, plantilla, secciones, guardada_en)
    VALUES (OLD.id, OLD.fecha, OLD.plantilla, OLD.secciones, OLD.modificado_en);
END;

-- La papelera ahora también guarda notas. SQLite no permite cambiar un CHECK,
-- así que se rehace la tabla con los mismos datos.
CREATE TABLE papelera_nueva (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo          TEXT NOT NULL CHECK (tipo IN ('turno', 'gasto', 'nota')),
    registro_id   INTEGER NOT NULL,
    datos         TEXT NOT NULL,
    descripcion   TEXT NOT NULL,
    eliminado_en  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
INSERT INTO papelera_nueva (id, tipo, registro_id, datos, descripcion, eliminado_en)
    SELECT id, tipo, registro_id, datos, descripcion, eliminado_en FROM papelera;
DROP TABLE papelera;
ALTER TABLE papelera_nueva RENAME TO papelera;
