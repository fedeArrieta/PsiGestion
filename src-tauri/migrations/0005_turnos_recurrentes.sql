-- Turnos recurrentes ("todos los martes a las 10").
-- Una serie guarda el patrón; los turnos se generan como turnos comunes (con
-- serie_id) hasta unos meses adelante y la app los va extendiendo sola.
-- La fecha "desde" marca el día de la semana y el arranque de la frecuencia.
CREATE TABLE series (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id         INTEGER NOT NULL REFERENCES pacientes(id),
    desde               TEXT    NOT NULL,              -- AAAA-MM-DD, primera fecha del patrón
    hora                TEXT    NOT NULL,              -- HH:MM
    duracion_min        INTEGER NOT NULL DEFAULT 50,
    frecuencia_semanas  INTEGER NOT NULL DEFAULT 1 CHECK (frecuencia_semanas BETWEEN 1 AND 4),
    hasta               TEXT,                          -- AAAA-MM-DD inclusive; NULL = sin fin
    generada_hasta      TEXT    NOT NULL,              -- última fecha ya generada (inclusive)
    notas               TEXT,
    creado_en           TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_series_paciente ON series (paciente_id);

ALTER TABLE turnos ADD COLUMN serie_id INTEGER REFERENCES series(id);
CREATE INDEX idx_turnos_serie ON turnos (serie_id);

-- Feriados y vacaciones: en estos días no se generan turnos de las series.
CREATE TABLE no_laborables (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    desde        TEXT NOT NULL,                        -- AAAA-MM-DD
    hasta        TEXT NOT NULL,                        -- AAAA-MM-DD inclusive
    descripcion  TEXT NOT NULL,
    tipo         TEXT NOT NULL DEFAULT 'vacaciones' CHECK (tipo IN ('feriado', 'vacaciones')),
    CHECK (desde <= hasta)
);

CREATE INDEX idx_no_laborables_fechas ON no_laborables (desde, hasta);
