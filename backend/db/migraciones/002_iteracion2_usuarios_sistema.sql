-- =====================================================================
-- Iteración 2 · Usuarios del sistema: cambio de clave obligatorio, bloqueo por
-- intentos fallidos, último acceso y regla "siempre un ADMIN activo".
-- No borra datos y se puede ejecutar más de una vez:
--   psql -h localhost -U postgres -d parqueadero -f db/migraciones/002_iteracion2_usuarios_sistema.sql
-- =====================================================================
BEGIN;

ALTER TABLE operador
  ADD COLUMN IF NOT EXISTS debe_cambiar_clave BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS intentos_fallidos  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_acceso      TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION exigir_admin_activo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('operador_admin_activo'));
  IF EXISTS (SELECT 1 FROM operador)
     AND NOT EXISTS (SELECT 1 FROM operador WHERE rol = 'ADMIN' AND activo) THEN
    RAISE EXCEPTION 'Debe quedar al menos un administrador activo';
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trg_operador_admin_activo AFTER UPDATE OF rol, activo ON operador
  FOR EACH STATEMENT EXECUTE FUNCTION exigir_admin_activo();

COMMIT;
