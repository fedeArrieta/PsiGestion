-- Gastos del mes. "mes" es AAAA-MM. "fijo" marca los gastos que se repiten
-- todos los meses (alquiler, supervisión, etc.) para poder copiarlos al mes siguiente.
CREATE TABLE gastos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mes          TEXT    NOT NULL,
    descripcion  TEXT    NOT NULL,
    monto        REAL    NOT NULL CHECK (monto >= 0),
    fijo         INTEGER NOT NULL DEFAULT 0,
    creado_en    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_gastos_mes ON gastos (mes);

-- Objetivo de ganancia mensual. Si un mes no tiene objetivo propio,
-- se usa el del último mes anterior que lo tenga.
CREATE TABLE objetivos (
    mes    TEXT PRIMARY KEY,
    monto  REAL NOT NULL CHECK (monto >= 0)
);
