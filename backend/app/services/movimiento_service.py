"""Entradas y salidas (RF1-RF8)."""
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.errors import AppError, Conflict, NotFound
from app.extensions import db
from app.models import Celda, Movimiento, Vehiculo
from app.services._sql import escalar, fila, filas, hoy, like, pagina, rango_dia


def _mensualidad_vigente(placa: str) -> dict | None:
    return fila(
        """SELECT m.id_mensualidad, m.codigo, m.id_celda, m.fecha_fin, c.codigo AS celda,
                  s.estado_pago, s.saldo
           FROM mensualidad m JOIN celda c USING (id_celda)
           LEFT JOIN v_mensualidad_estado s USING (id_mensualidad)
           WHERE m.placa = :p AND m.cancelada_en IS NULL
             AND CURRENT_DATE BETWEEN m.fecha_inicio AND m.fecha_fin""", p=placa)


def _celda_libre_para(tipo: str, mens: dict | None) -> dict | None:
    """RF3: celda asignada a la mensualidad si está utilizable; si no, la primera DISPONIBLE del tipo."""
    if mens:
        c = fila("SELECT id_celda, codigo, estado FROM v_celda_estado WHERE id_celda=:i", i=mens["id_celda"])
        if c and c["estado"] in ("VACIA_ASIGNADA", "DISPONIBLE"):
            return {"id_celda": c["id_celda"], "codigo": c["codigo"], "asignada": True}
    c = fila("SELECT id_celda, codigo FROM v_celda_estado WHERE estado='DISPONIBLE' AND tipo=:t "
             "ORDER BY codigo LIMIT 1", t=tipo)
    return {**c, "asignada": False} if c else None


def consultar_placa(placa: str) -> dict:
    v = fila(
        """SELECT v.placa, v.tipo, v.marca, v.linea, v.color, v.anio_modelo,
                  u.id_usuario, u.nombre AS cliente
           FROM vehiculo v JOIN usuario u USING (id_usuario) WHERE v.placa = :p""", p=placa)
    if not v:
        return {"placa": placa, "registrada": False, "puede_ingresar": False,
                "mensaje": "La placa no está registrada"}
    mov = fila("""SELECT m.id_movimiento, m.fecha_entrada, c.codigo AS celda
                  FROM movimiento m JOIN celda c USING (id_celda)
                  WHERE m.placa=:p AND m.fecha_salida IS NULL""", p=placa)
    mens = _mensualidad_vigente(placa)
    sugerida = None if mov else _celda_libre_para(v["tipo"], mens)
    if mov:
        mensaje = f"El vehículo ya está dentro ({mov['celda']})"
    elif not mens:
        mensaje = "Sin mensualidad vigente: no puede ingresar"
    elif not sugerida:
        mensaje = "No hay celdas disponibles para este tipo de vehículo"
    elif sugerida["asignada"]:
        mensaje = f"{sugerida['codigo']} está vacía. Conserva su asignación mensual a {v['cliente']}."
    else:
        mensaje = f"Su celda asignada no está disponible; se sugiere {sugerida['codigo']}"
    return {
        "placa": placa, "registrada": True, "vehiculo": v, "cliente": v["cliente"],
        "mensualidad": mens, "presente": mov is not None, "movimiento_abierto": mov,
        "celda_sugerida": sugerida, "mensaje": mensaje,
        "puede_ingresar": bool(mens) and mov is None and sugerida is not None,
    }


# ---- escritura ----
def registrar_entrada(placa: str, id_celda: int | None, observacion: str | None, id_operador: int) -> dict:
    veh = db.session.get(Vehiculo, placa)
    if not veh:
        raise NotFound("La placa no está registrada")
    
    mens = _mensualidad_vigente(placa)
    if not mens:
        raise Conflict("El vehículo no tiene una mensualidad vigente")
    
    if db.session.scalar(select(Movimiento.id_movimiento).where(
            Movimiento.placa == placa, Movimiento.fecha_salida.is_(None))):
        raise Conflict("La placa ya se encuentra dentro del parqueadero")

    if id_celda is not None:                       # selección manual (RF3)
        celda = db.session.get(Celda, id_celda)
        if not celda:
            raise NotFound("Celda no encontrada")
        if celda.tipo != veh.tipo:
            raise Conflict(f"La celda {celda.codigo} no es apta para {veh.tipo.lower()}s")
        estado = fila("SELECT estado FROM v_celda_estado WHERE id_celda=:i", i=id_celda)["estado"]
        if estado in ("OCUPADA", "FUERA_SERVICIO"):
            razon = "está fuera de servicio" if estado == "FUERA_SERVICIO" else "está ocupada"
            raise Conflict(f"La celda {celda.codigo} {razon}")
        if estado == "VACIA_ASIGNADA" and id_celda != mens["id_celda"]:
            raise Conflict(f"La celda {celda.codigo} está asignada a otra mensualidad")
        elegida = id_celda
    else:                                          # asignación automática (RF3)
        sug = _celda_libre_para(veh.tipo, mens)
        if not sug:
            raise Conflict("No hay celdas disponibles para este tipo de vehículo")
        elegida = sug["id_celda"]

    mov = Movimiento(placa=placa, id_celda=elegida, id_operador_entrada=id_operador,
                     fecha_entrada=datetime.now(timezone.utc), observacion=observacion)
    db.session.add(mov)
    db.session.commit()   # IntegrityError/trigger -> manejadores globales (409)
    return obtener(mov.id_movimiento)


def registrar_salida(placa: str, observacion: str | None, id_operador: int) -> dict:
    mov = db.session.scalar(select(Movimiento).where(
        Movimiento.placa == placa, Movimiento.fecha_salida.is_(None)).with_for_update())
    if not mov:   # RF7
        raise Conflict("La placa no ha ingresado al parqueadero")
    mov.fecha_salida = datetime.now(timezone.utc)
    mov.id_operador_salida = id_operador
    if observacion:
        mov.observacion = observacion
    db.session.commit()
    return obtener(mov.id_movimiento)


# ---- lectura ----
def obtener(id_movimiento: int) -> dict:
    r = fila(_SELECT + " WHERE m.id_movimiento = :i", i=id_movimiento)
    if not r:
        raise NotFound("Movimiento no encontrado")
    return r


_SELECT = """
SELECT m.id_movimiento, m.placa, v.tipo, u.nombre AS cliente, c.codigo AS celda,
       m.fecha_entrada, m.fecha_salida, m.observacion,
       oe.nombre AS operador_entrada, os.nombre AS operador_salida,
       s.estado_pago
FROM movimiento m
JOIN vehiculo v ON v.placa = m.placa
JOIN usuario u ON u.id_usuario = v.id_usuario
JOIN celda c ON c.id_celda = m.id_celda
JOIN operador oe ON oe.id_operador = m.id_operador_entrada
LEFT JOIN operador os ON os.id_operador = m.id_operador_salida
LEFT JOIN mensualidad mn ON mn.placa = m.placa AND mn.cancelada_en IS NULL
     AND CURRENT_DATE BETWEEN mn.fecha_inicio AND mn.fecha_fin
LEFT JOIN v_mensualidad_estado s ON s.id_mensualidad = mn.id_mensualidad
"""


def presentes(q: str | None, celda: str | None, page: int, per_page: int) -> dict:
    page, per_page, off = pagina(page, per_page)
    where = "m.fecha_salida IS NULL AND (CAST(:q AS text) IS NULL OR m.placa ILIKE :q OR u.nombre ILIKE :q) " \
            "AND (CAST(:celda AS text) IS NULL OR c.codigo = :celda)"
    p = {"q": like(q), "celda": celda or None}
    total = escalar(f"""SELECT count(*) FROM movimiento m JOIN vehiculo v ON v.placa=m.placa
                        JOIN usuario u ON u.id_usuario=v.id_usuario JOIN celda c ON c.id_celda=m.id_celda
                        WHERE {where}""", **p)
    items = filas(_SELECT + f" WHERE {where} ORDER BY m.fecha_entrada DESC LIMIT :lim OFFSET :off",
                  lim=per_page, off=off, **p)
    return {"total": total, "page": page, "per_page": per_page, "items": items}


def historial(placa: str | None, desde: date | None, hasta: date | None, page: int, per_page: int) -> dict:
    """RF6: eventos Entrada/Salida filtrables por placa y rango de fechas."""
    page, per_page, off = pagina(page, per_page)
    ini = rango_dia(desde)[0] if desde else None
    fin = rango_dia(hasta)[1] if hasta else None
    p = {"placa": placa or None, "ini": ini, "fin": fin}
    where = ("(CAST(:placa AS text) IS NULL OR e.placa = :placa) "
             "AND (CAST(:ini AS timestamptz) IS NULL OR e.fecha_hora >= :ini) "
             "AND (CAST(:fin AS timestamptz) IS NULL OR e.fecha_hora < :fin)")
    total = escalar(f"SELECT count(*) FROM v_historial_eventos e WHERE {where}", **p)
    items = filas(f"""
        SELECT e.id_movimiento, e.fecha_hora, e.placa, e.movimiento, c.codigo AS celda,
               o.nombre AS responsable, e.observacion, u.nombre AS cliente
        FROM v_historial_eventos e
        JOIN celda c ON c.id_celda = e.id_celda
        JOIN operador o ON o.id_operador = e.id_operador
        JOIN vehiculo v ON v.placa = e.placa JOIN usuario u ON u.id_usuario = v.id_usuario
        WHERE {where} ORDER BY e.fecha_hora DESC, e.movimiento DESC LIMIT :lim OFFSET :off""",
        lim=per_page, off=off, **p)
    return {"total": total, "page": page, "per_page": per_page, "items": items}


def kpis_hoy() -> dict:
    ini, fin = rango_dia(hoy())
    return {
        "entradas_hoy": escalar("SELECT count(*) FROM movimiento WHERE fecha_entrada >= :a AND fecha_entrada < :b", a=ini, b=fin),
        "salidas_hoy": escalar("SELECT count(*) FROM movimiento WHERE fecha_salida >= :a AND fecha_salida < :b", a=ini, b=fin),
        "presentes": escalar("SELECT count(*) FROM movimiento WHERE fecha_salida IS NULL"),
    }
