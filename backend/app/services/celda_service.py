from app.errors import Conflict, NotFound
from app.extensions import db
from app.models import Celda, MantenimientoCelda
from app.services._sql import fila, filas

_BASE = """
SELECT e.id_celda, e.codigo, e.fila, e.tipo, e.estado, e.placa_presente,
       m.codigo AS mensualidad, m.id_mensualidad, m.placa AS placa_asignada, u.nombre AS cliente
FROM v_celda_estado e
LEFT JOIN mensualidad m ON m.id_mensualidad = e.id_mensualidad_vigente
LEFT JOIN usuario u ON u.id_usuario = m.id_usuario
"""


def listar() -> dict:
    celdas = filas(_BASE + " ORDER BY e.codigo")
    conteo = {"OCUPADA": 0, "VACIA_ASIGNADA": 0, "DISPONIBLE": 0, "FUERA_SERVICIO": 0}
    for c in celdas:
        conteo[c["estado"]] += 1
    fuera = filas(
        """SELECT c.id_celda, c.codigo, mc.motivo, mc.fecha_inicio
           FROM mantenimiento_celda mc JOIN celda c USING (id_celda)
           WHERE mc.fecha_fin IS NULL ORDER BY c.codigo""")
    return {"total": len(celdas), "resumen": conteo, "celdas": celdas, "fuera_servicio": fuera}


def detalle(id_celda: int) -> dict:
    c = fila(_BASE + " WHERE e.id_celda = :id", id=id_celda)
    if not c:
        raise NotFound("Celda no encontrada")
    mens = None
    if c["id_mensualidad"]:
        mens = fila(
            """SELECT m.id_mensualidad, m.codigo, m.id_usuario, u.nombre AS cliente, m.placa,
                      m.fecha_inicio, m.fecha_fin, m.valor_mensual, s.estado_pago, s.saldo
               FROM mensualidad m JOIN usuario u USING (id_usuario)
               LEFT JOIN v_mensualidad_estado s USING (id_mensualidad)
               WHERE m.id_mensualidad = :id""", id=c["id_mensualidad"])
    ultimo = fila(
        """SELECT * FROM (
             SELECT 'ENTRADA' AS movimiento, fecha_entrada AS fecha_hora, placa FROM movimiento WHERE id_celda=:id
             UNION ALL
             SELECT 'SALIDA', fecha_salida, placa FROM movimiento WHERE id_celda=:id AND fecha_salida IS NOT NULL
           ) t ORDER BY fecha_hora DESC LIMIT 1""", id=id_celda)
    mant = fila("SELECT motivo, fecha_inicio FROM mantenimiento_celda WHERE id_celda=:id AND fecha_fin IS NULL",
                id=id_celda)
    return {
        **c,
        "ocupacion_fisica": "OCUPADA" if c["placa_presente"] else "VACIA",
        "asignacion_mensual": "ASIGNADA" if mens else "SIN_ASIGNACION",
        "mensualidad_relacionada": mens,
        "ultimo_movimiento": ultimo,
        "mantenimiento": mant,
    }


def poner_en_mantenimiento(id_celda: int, motivo: str) -> dict:
    celda = db.session.get(Celda, id_celda)
    if not celda:
        raise NotFound("Celda no encontrada")
    est = fila("SELECT estado FROM v_celda_estado WHERE id_celda=:id", id=id_celda)
    if est and est["estado"] == "OCUPADA":
        raise Conflict("No se puede deshabilitar una celda con un vehículo dentro")
    db.session.add(MantenimientoCelda(id_celda=id_celda, motivo=motivo))
    db.session.commit()
    return detalle(id_celda)


def habilitar(id_celda: int) -> dict:
    m = (db.session.query(MantenimientoCelda)
         .filter_by(id_celda=id_celda, fecha_fin=None).one_or_none())
    if not m:
        raise Conflict("La celda no está fuera de servicio")
    from sqlalchemy import func
    m.fecha_fin = func.current_date()
    db.session.commit()
    return detalle(id_celda)
