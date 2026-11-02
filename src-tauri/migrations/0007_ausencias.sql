-- Ausencias y cancelaciones.
-- "aviso": en un turno ausente, si el paciente avisó que no venía ('con_aviso')
-- o directamente no vino ('sin_aviso'). En los demás estados queda NULL.
-- "cargo": lo que se cobra por esa ausencia, en centavos. NULL = no se cobra.
-- El saldo del paciente suma las sesiones realizadas y los cargos de ausencias
-- que no estén pagados.
ALTER TABLE turnos ADD COLUMN aviso TEXT CHECK (aviso IN ('con_aviso', 'sin_aviso'));
ALTER TABLE turnos ADD COLUMN cargo INTEGER CHECK (cargo >= 0);

-- Las ausencias anteriores a esta versión no tenían aviso ni cargo: se toman como
-- "sin aviso" y sin cobrar, así no cambia ningún saldo.
UPDATE turnos SET aviso = 'sin_aviso' WHERE estado = 'ausente';

-- Historial: el cambio de estado ahora dice si la ausencia fue avisada.
DROP TRIGGER historial_turno_estado;

CREATE TRIGGER historial_turno_estado AFTER UPDATE OF estado, aviso ON turnos
WHEN OLD.estado <> NEW.estado OR OLD.aviso IS NOT NEW.aviso BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    VALUES (NEW.id, NEW.paciente_id, 'estado',
            'Turno del ' || NEW.inicio || ': '
            || CASE WHEN OLD.estado = 'ausente' THEN 'ausente ' || REPLACE(COALESCE(OLD.aviso, 'sin_aviso'), '_', ' ') ELSE OLD.estado END
            || ' → '
            || CASE WHEN NEW.estado = 'ausente' THEN 'ausente ' || REPLACE(COALESCE(NEW.aviso, 'sin_aviso'), '_', ' ') ELSE NEW.estado END);
END;

CREATE TRIGGER historial_turno_cargo AFTER UPDATE OF cargo ON turnos
WHEN NEW.estado = 'ausente' AND OLD.cargo IS NOT NEW.cargo BEGIN
    INSERT INTO historial (turno_id, paciente_id, accion, detalle)
    VALUES (NEW.id, NEW.paciente_id, 'cargo',
            'Turno del ' || NEW.inicio || ': '
            || CASE WHEN NEW.cargo IS NULL THEN 'la ausencia no se cobra'
                    ELSE 'se cobra la ausencia (' || printf('%.2f', NEW.cargo / 100.0) || ')' END);
END;
