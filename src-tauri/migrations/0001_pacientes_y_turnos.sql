-- Pacientes: cada uno tiene su propio monto por sesión.
CREATE TABLE pacientes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT    NOT NULL,
    telefono      TEXT,
    email         TEXT,
    monto_sesion  REAL    NOT NULL DEFAULT 0,
    notas         TEXT,
    activo        INTEGER NOT NULL DEFAULT 1,
    creado_en     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Turnos de la agenda. "inicio" se guarda como fecha y hora local ISO (AAAA-MM-DDTHH:MM).
-- "monto" se copia del paciente al crear el turno, para que un cambio de tarifa
-- no altere las sesiones pasadas.
CREATE TABLE turnos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id   INTEGER NOT NULL REFERENCES pacientes(id),
    inicio        TEXT    NOT NULL,
    duracion_min  INTEGER NOT NULL DEFAULT 50,
    estado        TEXT    NOT NULL DEFAULT 'programado'
                  CHECK (estado IN ('programado', 'realizado', 'cancelado', 'ausente')),
    monto         REAL    NOT NULL DEFAULT 0,
    pagado        INTEGER NOT NULL DEFAULT 0,
    notas         TEXT,
    creado_en     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_turnos_inicio ON turnos (inicio);
CREATE INDEX idx_turnos_paciente ON turnos (paciente_id);
