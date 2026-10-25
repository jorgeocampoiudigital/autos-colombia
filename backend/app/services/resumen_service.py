from app.services import celda_service, cliente_service, movimiento_service, novedad_service, pago_service
from app.services._sql import escalar, filas, rango_dia


def resumen() -> dict:
    celdas = celda_service.listar()
    r = celdas["resumen"]
    total = celdas["total"]
    kp = pago_service.kpis()
    mov = movimiento_service.kpis_hoy()
    nov = novedad_service.kpis()
    ini, fin = rango_dia()
    est = filas("""SELECT s.estado_pago, count(*) AS n FROM mensualidad m
                   JOIN v_mensualidad_estado s USING (id_mensualidad)
                   WHERE m.cancelada_en IS NULL AND CURRENT_DATE BETWEEN m.fecha_inicio AND m.fecha_fin
                   GROUP BY 1""")
    est = {e["estado_pago"]: e["n"] for e in est}
    recientes = filas("""
        SELECT e.movimiento, e.placa, u.nombre AS cliente, c.codigo AS celda, e.fecha_hora, o.nombre AS registrado_por
        FROM v_historial_eventos e JOIN vehiculo v ON v.placa=e.placa JOIN usuario u ON u.id_usuario=v.id_usuario
        JOIN celda c ON c.id_celda=e.id_celda JOIN operador o ON o.id_operador=e.id_operador
        ORDER BY e.fecha_hora DESC LIMIT 4""")
    total_hoy = escalar("""SELECT (SELECT count(*) FROM movimiento WHERE fecha_entrada >= :a AND fecha_entrada < :b)
                              + (SELECT count(*) FROM movimiento WHERE fecha_salida >= :a AND fecha_salida < :b)""",
                        a=ini, b=fin)
    saldo_total = escalar("SELECT COALESCE(sum(saldo),0) FROM v_cobro_saldo WHERE saldo > 0")
    return {
        "ocupacion_fisica": {"ocupadas": r["OCUPADA"], "total": total,
                             "porcentaje": round(100 * r["OCUPADA"] / total, 1) if total else 0},
        "vehiculos_presentes": mov["presentes"], "entradas_hoy": mov["entradas_hoy"],
        "salidas_hoy": mov["salidas_hoy"],
        "mensualidades": {"activas": sum(est.values()), "al_dia": est.get("AL_DIA", 0),
                          "por_vencer": est.get("POR_VENCER", 0), "en_mora": est.get("EN_MORA", 0)},
        "saldo_pendiente": saldo_total, "saldo_mora": kp["saldo_mora"],
        "celdas": celdas,
        "atencion": {"mora": {"cantidad": estado_mora(est), "saldo": kp["saldo_mora"]},
                     "fuera_servicio": [c["codigo"] for c in celdas["fuera_servicio"]],
                     "novedades_abiertas": nov["abiertas"], "novedades_seguimiento": nov["seguimiento"]},
        "recaudo": {"recaudado": kp["pagado"], "porcentaje": kp["porcentaje_pagado"],
                    "cobros_pagados": kp["cobros_pagados"], "cobros": kp["cobros"]},
        "movimientos_recientes": {"items": recientes, "total_hoy": total_hoy},
    }


def estado_mora(est: dict) -> int:
    return est.get("EN_MORA", 0)
