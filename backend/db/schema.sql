-- =====================================================================
-- Autos Colombia · Esquema PostgreSQL 14+
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- exclusión de rangos solapados
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- crypt()/gen_salt() para el seed

-- ---------------------------------------------------------------------
-- Tipos enumerados (ENUM de MySQL -> CREATE TYPE)
-- ---------------------------------------------------------------------
CREATE TYPE tipo_vehiculo   AS ENUM ('CARRO', 'MOTO');
CREATE TYPE rol_operador    AS ENUM ('ADMIN', 'OPERADOR');
CREATE TYPE tipo_documento  AS ENUM ('CC', 'CE', 'NIT', 'PAS');
CREATE TYPE medio_pago      AS ENUM ('TRANSFERENCIA', 'EFECTIVO', 'TARJETA', 'OTRO');
CREATE TYPE tipo_novedad    AS ENUM ('OBSERVACION', 'DANO', 'OBJETO_OLVIDADO', 'INCIDENTE', 'OTRO');
CREATE TYPE estado_novedad  AS ENUM ('ABIERTA', 'SEGUIMIENTO', 'CERRADA');

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION bloquear_borrado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No se permite borrar registros de %', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

-- ---------------------------------------------------------------------
-- sede
-- ---------------------------------------------------------------------
CREATE TABLE sede (
  id_sede  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre   VARCHAR(100) NOT NULL UNIQUE,
  ciudad   VARCHAR(100) NOT NULL
);

-- ---------------------------------------------------------------------
-- usuario (cliente)
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
  id_usuario      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL,
  tipo_documento  tipo_documento NOT NULL DEFAULT 'CC',
  documento       VARCHAR(20)  NOT NULL UNIQUE,
  telefono        VARCHAR(20),
  email           VARCHAR(120),
  direccion       VARCHAR(200),
  activo          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_usuario_updated BEFORE UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- operador (login + roles)
-- ---------------------------------------------------------------------
CREATE TABLE operador (
  id_operador  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre       VARCHAR(100) NOT NULL,
  usuario      VARCHAR(30)  NOT NULL UNIQUE,
  clave_hash   VARCHAR(255) NOT NULL,
  rol          rol_operador NOT NULL,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- vehiculo
-- ---------------------------------------------------------------------
CREATE TABLE vehiculo (
  placa        VARCHAR(10)    PRIMARY KEY,
  tipo         tipo_vehiculo  NOT NULL,
  marca        VARCHAR(50),
  linea        VARCHAR(50),
  color        VARCHAR(30),
  anio_modelo  SMALLINT CHECK (anio_modelo BETWEEN 1950 AND 2100),
  id_usuario   INT NOT NULL REFERENCES usuario(id_usuario),
  CONSTRAINT ck_vehiculo_placa_normalizada
    CHECK (placa = upper(placa) AND placa ~ '^[A-Z0-9]{5,8}$')
);
CREATE INDEX ix_vehiculo_usuario ON vehiculo(id_usuario);

-- ---------------------------------------------------------------------
-- celda
-- ---------------------------------------------------------------------
CREATE TABLE celda (
  id_celda  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_sede   INT NOT NULL REFERENCES sede(id_sede),
  codigo    VARCHAR(10)   NOT NULL,
  fila      CHAR(1)       NOT NULL,
  tipo      tipo_vehiculo NOT NULL,
  UNIQUE (id_sede, codigo)
);

-- Mantenimiento = "Fuera de servicio"
CREATE TABLE mantenimiento_celda (
  id_mantenimiento INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_celda     INT NOT NULL REFERENCES celda(id_celda),
  motivo       VARCHAR(200) NOT NULL,
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin    DATE,
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE UNIQUE INDEX ux_mantenimiento_activo
  ON mantenimiento_celda(id_celda) WHERE fecha_fin IS NULL;

-- ---------------------------------------------------------------------
-- mensualidad (contrato: usuario + vehículo + celda + vigencia + valor)
-- ---------------------------------------------------------------------
CREATE TABLE mensualidad (
  id_mensualidad  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          VARCHAR(12) GENERATED ALWAYS AS
                    ('MEN-' || lpad(id_mensualidad::text, 3, '0')) STORED UNIQUE,
  id_usuario      INT NOT NULL REFERENCES usuario(id_usuario),
  placa           VARCHAR(10) NOT NULL REFERENCES vehiculo(placa),
  id_celda        INT NOT NULL REFERENCES celda(id_celda),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  valor_mensual   NUMERIC(12,2) NOT NULL CHECK (valor_mensual > 0),
  cancelada_en    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin >= fecha_inicio),

  CONSTRAINT ex_mensualidad_celda EXCLUDE USING gist
    (id_celda WITH =, daterange(fecha_inicio, fecha_fin, '[]') WITH &&)
    WHERE (cancelada_en IS NULL),

  CONSTRAINT ex_mensualidad_placa EXCLUDE USING gist
    (placa WITH =, daterange(fecha_inicio, fecha_fin, '[]') WITH &&)
    WHERE (cancelada_en IS NULL)
);
CREATE INDEX ix_mensualidad_usuario ON mensualidad(id_usuario);
CREATE INDEX ix_mensualidad_placa_fechas ON mensualidad(placa, fecha_fin);

-- ---------------------------------------------------------------------
-- cobro
-- ---------------------------------------------------------------------
CREATE TABLE cobro (
  id_cobro          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo            VARCHAR(12) GENERATED ALWAYS AS
                      ('COB-' || lpad(id_cobro::text, 3, '0')) STORED UNIQUE,
  id_mensualidad    INT NOT NULL REFERENCES mensualidad(id_mensualidad),
  periodo_inicio    DATE NOT NULL,
  periodo_fin       DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  valor             NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (periodo_fin >= periodo_inicio),
  UNIQUE (id_mensualidad, periodo_inicio)
);
CREATE INDEX ix_cobro_vencimiento ON cobro(fecha_vencimiento);

CREATE TABLE pago (
  id_pago        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_recibo  VARCHAR(12) GENERATED ALWAYS AS
                   ('REC-' || lpad(id_pago::text, 3, '0')) STORED UNIQUE,
  id_cobro       INT NOT NULL REFERENCES cobro(id_cobro),
  valor          NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  fecha_pago     DATE NOT NULL DEFAULT CURRENT_DATE,
  medio          medio_pago NOT NULL,
  referencia     VARCHAR(60),
  soporte_url    VARCHAR(500),
  id_operador    INT NOT NULL REFERENCES operador(id_operador),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_pago_cobro ON pago(id_cobro);
CREATE TRIGGER trg_pago_nodelete BEFORE DELETE OR TRUNCATE ON pago
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_borrado();

-- ---------------------------------------------------------------------
-- movimiento (entrada/salida)
-- ---------------------------------------------------------------------
CREATE TABLE movimiento (
  id_movimiento       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  placa               VARCHAR(10) NOT NULL REFERENCES vehiculo(placa),
  id_celda            INT NOT NULL REFERENCES celda(id_celda),
  id_operador_entrada INT NOT NULL REFERENCES operador(id_operador),
  id_operador_salida  INT REFERENCES operador(id_operador),
  fecha_entrada       TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_salida        TIMESTAMPTZ,
  observacion         VARCHAR(200),
  CHECK (fecha_salida IS NULL OR fecha_salida >= fecha_entrada),

  CHECK ((fecha_salida IS NULL) = (id_operador_salida IS NULL))
);

CREATE UNIQUE INDEX ux_movimiento_placa_abierta
  ON movimiento(placa) WHERE fecha_salida IS NULL;

CREATE UNIQUE INDEX ux_movimiento_celda_abierta
  ON movimiento(id_celda) WHERE fecha_salida IS NULL;
CREATE INDEX ix_movimiento_placa_fecha ON movimiento(placa, fecha_entrada DESC);
CREATE INDEX ix_movimiento_entrada ON movimiento(fecha_entrada DESC);

CREATE OR REPLACE FUNCTION validar_movimiento() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tipo_veh  tipo_vehiculo;
  v_tipo_cel  tipo_vehiculo;
BEGIN
  IF TG_OP = 'INSERT' THEN
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
CREATE TRIGGER trg_movimiento_validar BEFORE INSERT OR UPDATE ON movimiento
  FOR EACH ROW EXECUTE FUNCTION validar_movimiento();
CREATE TRIGGER trg_movimiento_nodelete BEFORE DELETE ON movimiento
  FOR EACH ROW EXECUTE FUNCTION bloquear_borrado();
CREATE TRIGGER trg_movimiento_notruncate BEFORE TRUNCATE ON movimiento
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_borrado();

-- ---------------------------------------------------------------------
-- novedad ( evidencias + historial de estados)
-- ---------------------------------------------------------------------
CREATE TABLE novedad (
  id_novedad     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo         VARCHAR(12) GENERATED ALWAYS AS
                   ('NOV-' || lpad(id_novedad::text, 3, '0')) STORED UNIQUE,
  placa          VARCHAR(10) NOT NULL REFERENCES vehiculo(placa),
  id_movimiento  BIGINT REFERENCES movimiento(id_movimiento),
  tipo           tipo_novedad NOT NULL DEFAULT 'OBSERVACION',
  titulo         VARCHAR(120) NOT NULL,
  descripcion    TEXT NOT NULL,
  estado         estado_novedad NOT NULL DEFAULT 'ABIERTA',
  id_operador    INT NOT NULL REFERENCES operador(id_operador),
  fecha_hora     TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_cierre   TIMESTAMPTZ,
  CHECK ((estado = 'CERRADA') = (fecha_cierre IS NOT NULL))
);
CREATE INDEX ix_novedad_placa ON novedad(placa, fecha_hora DESC);
CREATE INDEX ix_novedad_estado ON novedad(estado);
CREATE TRIGGER trg_novedad_nodelete BEFORE DELETE OR TRUNCATE ON novedad
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_borrado();

CREATE TABLE novedad_evidencia (
  id_evidencia  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_novedad    INT NOT NULL REFERENCES novedad(id_novedad),
  nombre        VARCHAR(200) NOT NULL,
  url           VARCHAR(500) NOT NULL,
  mime_type     VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE novedad_historial (
  id_historial  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_novedad    INT NOT NULL REFERENCES novedad(id_novedad),
  estado        estado_novedad NOT NULL,
  comentario    VARCHAR(300),
  id_operador   INT NOT NULL REFERENCES operador(id_operador),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- VISTAS
-- =====================================================================

-- Estado de cada celda
CREATE VIEW v_celda_estado AS
SELECT
  c.id_celda, c.id_sede, c.codigo, c.fila, c.tipo,
  m.placa            AS placa_presente,
  mn.id_mensualidad  AS id_mensualidad_vigente,
  CASE
    WHEN mc.id_mantenimiento IS NOT NULL THEN 'FUERA_SERVICIO'
    WHEN m.id_movimiento     IS NOT NULL THEN 'OCUPADA'
    WHEN mn.id_mensualidad   IS NOT NULL THEN 'VACIA_ASIGNADA'
    ELSE 'DISPONIBLE'
  END AS estado
FROM celda c
LEFT JOIN mantenimiento_celda mc
       ON mc.id_celda = c.id_celda AND mc.fecha_fin IS NULL
LEFT JOIN movimiento m
       ON m.id_celda = c.id_celda AND m.fecha_salida IS NULL
LEFT JOIN mensualidad mn
       ON mn.id_celda = c.id_celda AND mn.cancelada_en IS NULL
      AND CURRENT_DATE BETWEEN mn.fecha_inicio AND mn.fecha_fin;

-- Cobros con saldo y estado calculado (Al día / Por vencer / En mora)
CREATE VIEW v_cobro_saldo AS
SELECT
  cb.id_cobro, cb.codigo, cb.id_mensualidad, cb.periodo_inicio, cb.periodo_fin,
  cb.fecha_vencimiento, cb.valor,
  COALESCE(p.pagado, 0)              AS pagado,
  cb.valor - COALESCE(p.pagado, 0)   AS saldo,
  CASE
    WHEN cb.valor - COALESCE(p.pagado, 0) <= 0              THEN 'AL_DIA'
    WHEN cb.fecha_vencimiento < CURRENT_DATE                THEN 'EN_MORA'
    WHEN cb.fecha_vencimiento <= CURRENT_DATE + 7           THEN 'POR_VENCER'
    ELSE 'PENDIENTE'
  END AS estado
FROM cobro cb
LEFT JOIN LATERAL (SELECT sum(valor) AS pagado FROM pago WHERE id_cobro = cb.id_cobro) p ON TRUE;

-- Vehículos dentro del parqueadero
CREATE VIEW v_vehiculos_presentes AS
SELECT m.id_movimiento, m.placa, v.tipo, u.nombre AS cliente,
       ce.codigo AS celda, m.fecha_entrada
FROM movimiento m
JOIN vehiculo v ON v.placa = m.placa
JOIN usuario  u ON u.id_usuario = v.id_usuario
JOIN celda   ce ON ce.id_celda = m.id_celda
WHERE m.fecha_salida IS NULL;

-- Historial como eventos Entrada/Salida
CREATE VIEW v_historial_eventos AS
SELECT id_movimiento, placa, id_celda, 'ENTRADA'::text AS movimiento,
       fecha_entrada AS fecha_hora, id_operador_entrada AS id_operador, observacion
FROM movimiento
UNION ALL
SELECT id_movimiento, placa, id_celda, 'SALIDA',
       fecha_salida, id_operador_salida, observacion
FROM movimiento WHERE fecha_salida IS NOT NULL;

-- Estado de pago por mensualidad (Al día / Por vencer / En mora) y saldo
CREATE VIEW v_mensualidad_estado AS
SELECT id_mensualidad,
       CASE WHEN bool_or(estado = 'EN_MORA')    THEN 'EN_MORA'
            WHEN bool_or(estado = 'POR_VENCER') THEN 'POR_VENCER'
            ELSE 'AL_DIA' END AS estado_pago,
       COALESCE(sum(saldo), 0) AS saldo
FROM v_cobro_saldo
GROUP BY id_mensualidad;
