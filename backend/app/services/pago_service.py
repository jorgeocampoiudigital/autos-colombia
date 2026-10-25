"""Cobros (lo que se debe) y pagos (lo recibido)."""
from datetime import date

from app.errors import AppError, NotFound
from app.extensions import db
from app.models import Cobro, Pago
from app.schemas import PagoIn
from app.services._sql import escalar, fila, filas, hoy, like, pagina


def _periodo(periodo: str | None) -> tuple[date, date]:
    """'YYYY-MM' -> [primer día, primer día del mes siguiente)."""
    base = hoy().replace(day=1)
    if periodo:
        try:
            y, m = (int(x) for x in periodo.split("-"))
            base = date(y, m, 1)
        except ValueError:
            raise AppError("periodo debe tener formato YYYY-MM", 422)
    nxt = date(base.year + (base.month == 12), base.month % 12 + 1, 1)
    return base, nxt


def kpis(periodo: str | None = None) -> dict:
    ini, fin = _periodo(periodo)
    r = fila("""
        SELECT count(*) AS cobros, COALESCE(sum(valor), 0) AS total,
               COALESCE(sum(pagado), 0) AS pagado, COALESCE(sum(saldo), 0) AS saldo,
               count(*) FILTER (WHERE saldo <= 0) AS cobros_pagados,
               count(*) FILTER (WHERE saldo > 0) AS cobros_pendientes,
               COALESCE(sum(saldo) FILTER (WHERE estado = 'EN_MORA'), 0) AS saldo_mora,
               count(*) FILTER (WHERE estado = 'EN_MORA') AS cobros_mora
        FROM v_cobro_saldo WHERE periodo_inicio >= :a AND periodo_inicio < :b""", a=ini, b=fin)
    r["porcentaje_pagado"] = round(100 * r["pagado"] / r["total"], 1) if r["total"] else 0
    r["periodo"] = ini.strftime("%Y-%m")
    return r


_COBRO = """
SELECT c.id_cobro, c.codigo, c.periodo_inicio, c.periodo_fin, c.fecha_vencimiento, c.valor,
       c.pagado, c.saldo, c.estado, m.codigo AS mensualidad, m.placa, u.nombre AS cliente,
       u.id_usuario, ce.codigo AS celda
FROM v_cobro_saldo c
JOIN mensualidad m USING (id_mensualidad) JOIN usuario u USING (id_usuario)
JOIN celda ce ON ce.id_celda = m.id_celda
"""


def listar_cobros(q: str | None, estado: str | None, periodo: str | None, solo_pendientes: bool,
                  page: int, per_page: int) -> dict:
    page, per_page, off = pagina(page, per_page)
    ini, fin = _periodo(periodo)
    p = {"q": like(q), "estado": estado or None, "a": ini, "b": fin}
    where = ("c.periodo_inicio >= :a AND c.periodo_inicio < :b "
             "AND (CAST(:q AS text) IS NULL OR u.nombre ILIKE :q OR m.placa ILIKE :q OR c.codigo ILIKE :q) "
             "AND (CAST(:estado AS text) IS NULL OR c.estado = :estado)")
    if solo_pendientes:
        where += " AND c.saldo > 0"
    total = escalar(f"""SELECT count(*) FROM v_cobro_saldo c JOIN mensualidad m USING (id_mensualidad)
                        JOIN usuario u USING (id_usuario) WHERE {where}""", **p)
    
    items = filas(_COBRO + f""" WHERE {where}
        ORDER BY (c.estado = 'EN_MORA') DESC, c.fecha_vencimiento, c.id_cobro LIMIT :lim OFFSET :off""",
        lim=per_page, off=off, **p)
    return {"total": total, "page": page, "per_page": per_page, "items": items}


def obtener_cobro(id_cobro: int) -> dict:
    r = fila(_COBRO + " WHERE c.id_cobro = :i", i=id_cobro)
    if not r:
        raise NotFound("Cobro no encontrado")
    return r


def registrar_pago(datos: PagoIn, id_operador: int) -> dict:
    
    cobro = db.session.query(Cobro).filter_by(id_cobro=datos.id_cobro).with_for_update().one_or_none()
    if not cobro:
        raise NotFound("Cobro no encontrado")
    saldo = fila("SELECT saldo FROM v_cobro_saldo WHERE id_cobro=:i", i=datos.id_cobro)["saldo"]
    if saldo <= 0:
        raise AppError("El cobro ya está pagado", 409)
    if datos.valor > saldo:
        raise AppError(f"El valor excede el saldo pendiente ({int(saldo):,} COP)".replace(",", "."), 422)
    if datos.fecha_pago and datos.fecha_pago > hoy():
        raise AppError("La fecha del pago no puede ser futura", 422)
    pago = Pago(id_cobro=datos.id_cobro, valor=datos.valor, fecha_pago=datos.fecha_pago or hoy(),
                medio=datos.medio, referencia=datos.referencia, soporte_url=datos.soporte_url,
                id_operador=id_operador)
    db.session.add(pago)
    db.session.commit()
    return {"pago": obtener_pago(pago.id_pago), "cobro": obtener_cobro(datos.id_cobro)}


_PAGO = """
SELECT p.id_pago, p.numero_recibo, p.fecha_pago, p.valor, p.medio, p.referencia, p.soporte_url,
       cb.codigo AS cobro, u.nombre AS cliente, m.placa, o.nombre AS recibido_por, p.created_at
FROM pago p JOIN cobro cb USING (id_cobro) JOIN mensualidad m USING (id_mensualidad)
JOIN usuario u USING (id_usuario) JOIN operador o USING (id_operador)
"""


def obtener_pago(id_pago: int) -> dict:
    return fila(_PAGO + " WHERE p.id_pago = :i", i=id_pago) or {}


def listar_pagos(q: str | None, periodo: str | None, page: int, per_page: int) -> dict:
    page, per_page, off = pagina(page, per_page)
    ini, fin = _periodo(periodo)
    p = {"q": like(q), "a": ini, "b": fin}
    where = ("p.fecha_pago >= :a AND p.fecha_pago < :b "
             "AND (CAST(:q AS text) IS NULL OR u.nombre ILIKE :q OR m.placa ILIKE :q OR p.numero_recibo ILIKE :q)")
    total = escalar(f"""SELECT count(*) FROM pago p JOIN cobro cb USING (id_cobro)
                        JOIN mensualidad m USING (id_mensualidad) JOIN usuario u USING (id_usuario)
                        WHERE {where}""", **p)
    items = filas(_PAGO + f" WHERE {where} ORDER BY p.fecha_pago DESC, p.id_pago DESC LIMIT :lim OFFSET :off",
                  lim=per_page, off=off, **p)
    return {"total": total, "page": page, "per_page": per_page, "items": items}
