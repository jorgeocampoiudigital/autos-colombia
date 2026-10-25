from datetime import datetime, timezone

from sqlalchemy import select

from app.errors import AppError, NotFound
from app.extensions import db
from app.models import Movimiento, Novedad, NovedadEvidencia, NovedadHistorial, Vehiculo
from app.schemas import NovedadEstadoIn, NovedadIn
from app.services._sql import escalar, fila, filas, like, pagina

_SEL = """
SELECT n.id_novedad, n.codigo, n.placa, n.tipo, n.titulo, n.descripcion, n.estado, n.fecha_hora,
       n.fecha_cierre, o.nombre AS responsable, u.nombre AS cliente,
       COALESCE(mc.codigo, ca.codigo) AS celda
FROM novedad n
JOIN operador o USING (id_operador)
JOIN vehiculo v ON v.placa = n.placa JOIN usuario u ON u.id_usuario = v.id_usuario
LEFT JOIN movimiento mv ON mv.id_movimiento = n.id_movimiento
LEFT JOIN celda mc ON mc.id_celda = mv.id_celda
LEFT JOIN mensualidad ms ON ms.placa = n.placa AND ms.cancelada_en IS NULL
     AND CURRENT_DATE BETWEEN ms.fecha_inicio AND ms.fecha_fin
LEFT JOIN celda ca ON ca.id_celda = ms.id_celda
"""


def kpis() -> dict:
    return {
        "abiertas": escalar("SELECT count(*) FROM novedad WHERE estado <> 'CERRADA'"),
        "seguimiento": escalar("SELECT count(*) FROM novedad WHERE estado = 'SEGUIMIENTO'"),
        "cerradas_mes": escalar("""SELECT count(*) FROM novedad WHERE estado = 'CERRADA'
            AND date_trunc('month', fecha_cierre) = date_trunc('month', now())"""),
    }


def listar(tab: str | None, q: str | None, periodo: str | None, page: int, per_page: int) -> dict:
    page, per_page, off = pagina(page, per_page)
    p = {"q": like(q), "tab": tab or "todas", "periodo": periodo or None}
    where = ("(CAST(:q AS text) IS NULL OR n.placa ILIKE :q OR o.nombre ILIKE :q OR n.descripcion ILIKE :q "
             "OR n.titulo ILIKE :q OR n.codigo ILIKE :q) "
             "AND (:tab = 'todas' OR (:tab = 'abiertas' AND n.estado <> 'CERRADA') "
             "OR (:tab = 'cerradas' AND n.estado = 'CERRADA')) "
             "AND (CAST(:periodo AS text) IS NULL OR to_char(n.fecha_hora, 'YYYY-MM') = :periodo)")
    total = escalar(f"SELECT count(*) FROM novedad n JOIN operador o USING (id_operador) WHERE {where}", **p)
    conteos = fila("""SELECT count(*) AS todas, count(*) FILTER (WHERE estado <> 'CERRADA') AS abiertas,
                      count(*) FILTER (WHERE estado = 'CERRADA') AS cerradas FROM novedad
                      WHERE (CAST(:periodo AS text) IS NULL OR to_char(fecha_hora, 'YYYY-MM') = :periodo)""",
                   periodo=p["periodo"])
    items = filas(_SEL + f" WHERE {where} ORDER BY n.fecha_hora DESC LIMIT :lim OFFSET :off",
                  lim=per_page, off=off, **p)
    return {"total": total, "page": page, "per_page": per_page, "conteos": conteos, "items": items}


def obtener(id_novedad: int) -> dict:
    n = fila(_SEL + " WHERE n.id_novedad = :i", i=id_novedad)
    if not n:
        raise NotFound("Novedad no encontrada")
    n["evidencias"] = filas("SELECT nombre, url, mime_type FROM novedad_evidencia WHERE id_novedad=:i ORDER BY id_evidencia", i=id_novedad)
    n["historial"] = filas("""SELECT h.estado, h.comentario, h.created_at, o.nombre AS operador
                              FROM novedad_historial h JOIN operador o USING (id_operador)
                              WHERE h.id_novedad=:i ORDER BY h.id_historial""", i=id_novedad)
    return n


def crear(datos: NovedadIn, id_operador: int) -> dict:
    if not db.session.get(Vehiculo, datos.placa):
        raise NotFound("La placa no está registrada")
    
    mov = db.session.scalar(select(Movimiento.id_movimiento).where(
        Movimiento.placa == datos.placa, Movimiento.fecha_salida.is_(None)))
    titulo = datos.titulo or (datos.descripcion[:60].rstrip() + ("…" if len(datos.descripcion) > 60 else ""))
    n = Novedad(placa=datos.placa, id_movimiento=mov, tipo=datos.tipo, titulo=titulo,
                descripcion=datos.descripcion, id_operador=id_operador,
                fecha_hora=datos.fecha_hora or datetime.now(timezone.utc))
    db.session.add(n)
    db.session.flush()
    for ev in datos.evidencias:
        db.session.add(NovedadEvidencia(id_novedad=n.id_novedad, **ev.model_dump()))
    db.session.add(NovedadHistorial(id_novedad=n.id_novedad, estado="ABIERTA",
                                    comentario="Novedad registrada", id_operador=id_operador))
    db.session.commit()
    return obtener(n.id_novedad)


_TRANSICIONES = {"ABIERTA": {"SEGUIMIENTO", "CERRADA"}, "SEGUIMIENTO": {"ABIERTA", "CERRADA"},
                 "CERRADA": set()}


def cambiar_estado(id_novedad: int, datos: NovedadEstadoIn, id_operador: int) -> dict:
    n = db.session.get(Novedad, id_novedad)
    if not n:
        raise NotFound("Novedad no encontrada")
    if datos.estado == n.estado:
        raise AppError("La novedad ya tiene ese estado", 409)
    if datos.estado not in _TRANSICIONES[n.estado]:
        raise AppError("Una novedad cerrada no se puede reabrir", 409)
    n.estado = datos.estado
    n.fecha_cierre = datetime.now(timezone.utc) if datos.estado == "CERRADA" else None
    db.session.add(NovedadHistorial(id_novedad=id_novedad, estado=datos.estado,
                                    comentario=datos.comentario, id_operador=id_operador))
    db.session.commit()
    return obtener(id_novedad)
