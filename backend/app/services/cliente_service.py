import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from flask import current_app

from app.errors import AppError, Conflict, NotFound
from app.extensions import db
from app.models import Celda, Cobro, Mensualidad, Usuario, Vehiculo
from app.schemas import ClienteIn, ClienteUpdateIn, MensualidadIn, VehiculoCreateIn, VehiculoIn
from app.services._sql import escalar, fila, filas, like, pagina

_VIGENTE = "m.cancelada_en IS NULL AND CURRENT_DATE BETWEEN m.fecha_inicio AND m.fecha_fin"


def kpis() -> dict:
    return {
        "clientes": escalar("SELECT count(*) FROM usuario"),
        "vehiculos": escalar("SELECT count(*) FROM vehiculo"),
        "mensualidades_activas": escalar(f"SELECT count(*) FROM mensualidad m WHERE {_VIGENTE}"),
    }


def listar(q: str | None, estado_pago: str | None, page: int, per_page: int) -> dict:
    page, per_page, off = pagina(page, per_page)
    p = {"q": like(q), "estado": estado_pago or None}
    base = f"""
    FROM usuario u
    LEFT JOIN LATERAL (
        SELECT m.* FROM mensualidad m
        WHERE m.id_usuario = u.id_usuario AND m.cancelada_en IS NULL
        ORDER BY (CURRENT_DATE BETWEEN m.fecha_inicio AND m.fecha_fin) DESC, m.fecha_fin DESC LIMIT 1
    ) m ON TRUE
    LEFT JOIN celda c ON c.id_celda = m.id_celda
    LEFT JOIN v_mensualidad_estado s ON s.id_mensualidad = m.id_mensualidad
    LEFT JOIN LATERAL (
        SELECT placa FROM vehiculo vv WHERE vv.id_usuario = u.id_usuario
        ORDER BY (vv.placa = m.placa) DESC, vv.placa LIMIT 1
    ) v ON TRUE
    WHERE (CAST(:q AS text) IS NULL OR u.nombre ILIKE :q OR u.documento ILIKE :q
           OR EXISTS (SELECT 1 FROM vehiculo x WHERE x.id_usuario = u.id_usuario AND x.placa ILIKE :q))
      AND (CAST(:estado AS text) IS NULL OR s.estado_pago = :estado)"""
    total = escalar("SELECT count(*) " + base, **p)
    items = filas(
        f"""SELECT u.id_usuario, u.nombre, u.tipo_documento, u.documento, u.telefono, u.activo,
                   v.placa, c.codigo AS celda, s.estado_pago
            {base} ORDER BY u.id_usuario LIMIT :lim OFFSET :off""", lim=per_page, off=off, **p)
    return {"total": total, "page": page, "per_page": per_page, "items": items}


def ficha(id_usuario: int) -> dict:
    u = fila("""SELECT id_usuario, nombre, tipo_documento, documento, telefono, email, direccion,
                       activo, created_at FROM usuario WHERE id_usuario = :i""", i=id_usuario)
    if not u:
        raise NotFound("Cliente no encontrado")
    vehs = filas(
        """SELECT v.placa, v.tipo, v.marca, v.linea, v.color, v.anio_modelo,
                  m.id_mensualidad, m.codigo AS mensualidad, c.codigo AS celda,
                  m.fecha_inicio, m.fecha_fin, m.valor_mensual, s.estado_pago, s.saldo
           FROM vehiculo v
           LEFT JOIN LATERAL (SELECT * FROM mensualidad mm WHERE mm.placa = v.placa AND mm.cancelada_en IS NULL
                              ORDER BY mm.fecha_fin DESC LIMIT 1) m ON TRUE
           LEFT JOIN celda c ON c.id_celda = m.id_celda
           LEFT JOIN v_mensualidad_estado s ON s.id_mensualidad = m.id_mensualidad
           WHERE v.id_usuario = :i ORDER BY v.placa""", i=id_usuario)
    return {**u, "vehiculos": vehs}


def listar_vehiculos(q: str | None, page: int, per_page: int) -> dict:
    page, per_page, off = pagina(page, per_page)
    p = {"q": like(q)}
    where = "(CAST(:q AS text) IS NULL OR v.placa ILIKE :q OR u.nombre ILIKE :q)"
    total = escalar(f"SELECT count(*) FROM vehiculo v JOIN usuario u USING (id_usuario) WHERE {where}", **p)
    items = filas(f"""
        SELECT v.placa, v.tipo, v.marca, v.linea, v.color, v.anio_modelo, u.id_usuario, u.nombre AS cliente,
               c.codigo AS celda, s.estado_pago
        FROM vehiculo v JOIN usuario u USING (id_usuario)
        LEFT JOIN mensualidad m ON m.placa = v.placa AND {_VIGENTE}
        LEFT JOIN celda c ON c.id_celda = m.id_celda
        LEFT JOIN v_mensualidad_estado s ON s.id_mensualidad = m.id_mensualidad
        WHERE {where} ORDER BY v.placa LIMIT :lim OFFSET :off""", lim=per_page, off=off, **p)
    return {"total": total, "page": page, "per_page": per_page, "items": items}


def _nuevo_vehiculo(datos: VehiculoIn, id_usuario: int) -> Vehiculo:
    return Vehiculo(**datos.model_dump(), id_usuario=id_usuario)


def crear(datos: ClienteIn) -> dict:
    u = Usuario(**datos.model_dump(exclude={"vehiculos"}))
    db.session.add(u)
    db.session.flush()
    for v in datos.vehiculos:
        db.session.add(_nuevo_vehiculo(v, u.id_usuario))
    db.session.commit()
    return ficha(u.id_usuario)


def actualizar(id_usuario: int, datos: ClienteUpdateIn) -> dict:
    u = db.session.get(Usuario, id_usuario)
    if not u:
        raise NotFound("Cliente no encontrado")
    for k, v in datos.model_dump(exclude_unset=True).items():
        setattr(u, k, v)
    u.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return ficha(id_usuario)


def crear_vehiculo(datos: VehiculoCreateIn) -> dict:
    if not db.session.get(Usuario, datos.id_usuario):
        raise NotFound("Cliente no encontrado")
    db.session.add(_nuevo_vehiculo(datos, datos.id_usuario))
    db.session.commit()
    return ficha(datos.id_usuario)


# ---- mensualidades ----
def asignar_mensualidad(datos: MensualidadIn) -> dict:
    veh = db.session.get(Vehiculo, datos.placa)
    if not veh or veh.id_usuario != datos.id_usuario:
        raise AppError("El vehículo no pertenece a ese cliente", 422)
    celda = db.session.get(Celda, datos.id_celda)
    if not celda:
        raise NotFound("Celda no encontrada")
    if celda.tipo != veh.tipo:
        raise Conflict(f"La celda {celda.codigo} no es apta para {veh.tipo.lower()}s")
    if fila("SELECT 1 FROM mantenimiento_celda WHERE id_celda=:i AND fecha_fin IS NULL", i=celda.id_celda):
        raise Conflict(f"La celda {celda.codigo} está fuera de servicio")
    ini = datos.fecha_inicio
    fin = datos.fecha_fin or date(ini.year, ini.month, calendar.monthrange(ini.year, ini.month)[1])
    if fin < ini:
        raise AppError("La fecha final no puede ser anterior a la inicial", 422)
    valor = datos.valor_mensual or Decimal(current_app.config["VALOR_MENSUALIDAD_DEFECTO"])

    m = Mensualidad(id_usuario=datos.id_usuario, placa=datos.placa, id_celda=datos.id_celda,
                    fecha_inicio=ini, fecha_fin=fin, valor_mensual=valor)
    db.session.add(m)
    db.session.flush()   # el solapamiento lo rechaza la restricción EXCLUDE (-> 409)
    db.session.add(Cobro(
        id_mensualidad=m.id_mensualidad, periodo_inicio=ini, periodo_fin=fin, valor=valor,
        fecha_vencimiento=ini + timedelta(days=current_app.config["DIAS_VENCIMIENTO_COBRO"])))
    db.session.commit()
    return obtener_mensualidad(m.id_mensualidad)


def obtener_mensualidad(id_mensualidad: int) -> dict:
    r = fila(_MENS + " WHERE m.id_mensualidad = :i", i=id_mensualidad)
    if not r:
        raise NotFound("Mensualidad no encontrada")
    return r


_MENS = f"""
SELECT m.id_mensualidad, m.codigo, m.id_usuario, u.nombre AS cliente, m.placa, c.codigo AS celda,
       m.fecha_inicio, m.fecha_fin, m.valor_mensual, m.cancelada_en,
       (CURRENT_DATE BETWEEN m.fecha_inicio AND m.fecha_fin AND m.cancelada_en IS NULL) AS vigente,
       s.estado_pago, s.saldo
FROM mensualidad m JOIN usuario u USING (id_usuario) JOIN celda c USING (id_celda)
LEFT JOIN v_mensualidad_estado s USING (id_mensualidad)
"""


def listar_mensualidades(q: str | None, page: int, per_page: int) -> dict:
    page, per_page, off = pagina(page, per_page)
    p = {"q": like(q)}
    where = "(CAST(:q AS text) IS NULL OR u.nombre ILIKE :q OR m.placa ILIKE :q OR m.codigo ILIKE :q)"
    total = escalar(f"SELECT count(*) FROM mensualidad m JOIN usuario u USING (id_usuario) WHERE {where}", **p)
    items = filas(_MENS + f" WHERE {where} ORDER BY m.id_mensualidad LIMIT :lim OFFSET :off",
                  lim=per_page, off=off, **p)
    return {"total": total, "page": page, "per_page": per_page, "items": items}
