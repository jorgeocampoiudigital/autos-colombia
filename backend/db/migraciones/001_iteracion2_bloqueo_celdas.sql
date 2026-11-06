-- =====================================================================
-- Iteración 2 · Migración para bases ya creadas con el esquema anterior.
-- No borra datos. Ejecutar una vez:
--   psql -h localhost -U postgres -d parqueadero -f db/migraciones/001_iteracion2_bloqueo_celdas.sql
-- (las bases nuevas ya lo traen en schema.sql)
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION validar_movimiento() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tipo_veh  tipo_vehiculo;
  v_tipo_cel  tipo_vehiculo;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Bloquea la celda: serializa esta entrada con un mantenimiento simultáneo
    PERFORM 1 FROM celda WHERE id_celda = NEW.id_celda FOR UPDATE;
    SELECT tipo INTO v_tipo_veh FROM vehiculo WHERE placa = NEW.placa;
    SELECT tipo INTO v_tipo_cel FROM celda    WHERE id_celda = NEW.id_celda;
    IF v_tipo_veh <> v_tipo_cel THEN
      RAISE EXCEPTION 'La celda no es apta para vehículos tipo %', v_tipo_veh;
    END IF;
    IF EXISTS (SELECT 1 FROM mantenimiento_celda
               WHERE id_celda = NEW.id_celda AND fecha_fin IS NULL) THEN
      RAISE EXCEPTION 'La celda está fuera de servicio';
    END IF;
    IF NEW.fecha_salida IS NOT NULL THEN
      RAISE EXCEPTION 'Una entrada no puede nacer con fecha de salida';
    END IF;
  ELSE
    IF OLD.fecha_salida IS NOT NULL THEN
      RAISE EXCEPTION 'Movimiento ya cerrado: no se puede modificar';
    END IF;
    IF NEW.placa <> OLD.placa OR NEW.id_celda <> OLD.id_celda
       OR NEW.fecha_entrada <> OLD.fecha_entrada
       OR NEW.id_operador_entrada <> OLD.id_operador_entrada THEN
      RAISE EXCEPTION 'Solo se permite registrar la salida';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Una celda con un vehículo dentro no puede pasar a mantenimiento
CREATE OR REPLACE FUNCTION validar_mantenimiento() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM celda WHERE id_celda = NEW.id_celda FOR UPDATE;
  IF NEW.fecha_fin IS NULL AND EXISTS (SELECT 1 FROM movimiento
             WHERE id_celda = NEW.id_celda AND fecha_salida IS NULL) THEN
    RAISE EXCEPTION 'No se puede deshabilitar una celda con un vehículo dentro';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_mantenimiento_validar BEFORE INSERT ON mantenimiento_celda
  FOR EACH ROW EXECUTE FUNCTION validar_mantenimiento();

COMMIT;
