"""Iteración 3 · Gestión de pagos — casos del plan de pruebas (CP-P01 … CP-P14)."""
import io
from datetime import timedelta

from sqlalchemy import text

from app.extensions import db
from app.services._sql import hoy as hoy_bogota


def _cobro(client, h):
    return client.get("/api/cobros?pendientes=true", headers=h).json["items"][0]


def _pagar(client, h, id_cobro, valor, medio="EFECTIVO", **extra):
    return client.post("/api/pagos", json={"id_cobro": id_cobro, "valor": valor, "medio": medio, **extra}, headers=h)


def test_cp_p01_consultar_cobros_pendientes(client, oper):
    r = client.get("/api/cobros?pendientes=true", headers=oper)
    assert r.status_code == 200 and r.json["total"] == 1
    c = r.json["items"][0]
    assert c["codigo"].startswith("COB-") and c["placa"] == "KTR482" and c["saldo"] == 300000


def test_cp_p02_filtrar_cobros_por_estado_y_busqueda(client, oper):
    assert client.get("/api/cobros?estado=EN_MORA", headers=oper).json["total"] == 0
    assert client.get("/api/cobros?q=ktr", headers=oper).json["total"] == 1
    assert client.get("/api/cobros?q=zzz", headers=oper).json["total"] == 0


def test_cp_p03_pago_parcial_genera_recibo_y_reduce_saldo(client, oper):
    c = _cobro(client, oper)
    r = _pagar(client, oper, c["id_cobro"], 100000)
    assert r.status_code == 201
    assert r.json["pago"]["numero_recibo"].startswith("REC-") and r.json["pago"]["recibido_por"] == "Operador"
    assert r.json["cobro"]["saldo"] == 200000 and r.json["cobro"]["estado"] != "AL_DIA"


def test_cp_p04_pago_total_deja_cobro_al_dia(client, oper):
    c = _cobro(client, oper)
    r = _pagar(client, oper, c["id_cobro"], 300000, "TRANSFERENCIA", referencia="TRX-001")
    assert r.status_code == 201 and r.json["cobro"]["estado"] == "AL_DIA" and r.json["cobro"]["saldo"] == 0
    assert r.json["pago"]["referencia"] == "TRX-001"


def test_cp_p05_pago_mayor_al_saldo_rechazado(client, oper):
    c = _cobro(client, oper)
    r = _pagar(client, oper, c["id_cobro"], 300001)
    assert r.status_code == 422 and "excede" in r.json["error"]


def test_cp_p06_cobro_ya_pagado_no_recibe_mas_pagos(client, oper):
    c = _cobro(client, oper)
    _pagar(client, oper, c["id_cobro"], 300000)
    r = _pagar(client, oper, c["id_cobro"], 1)
    assert r.status_code == 409 and r.json["error"] == "El cobro ya está pagado"


def test_cp_p07_validaciones_de_entrada(client, oper):
    c = _cobro(client, oper)
    manana = (hoy_bogota() + timedelta(days=1)).isoformat()
    assert _pagar(client, oper, c["id_cobro"], 1000, fecha_pago=manana).status_code == 422   # fecha futura
    assert _pagar(client, oper, c["id_cobro"], 0).status_code == 422                          # valor no positivo
    assert _pagar(client, oper, c["id_cobro"], 1000, "BITCOIN").status_code == 422            # medio inválido
    r = _pagar(client, oper, 9999, 1000)
    assert r.status_code == 404 and r.json["status"] == 404                                    # cobro inexistente


def test_cp_p08_pagos_requieren_sesion(client):
    assert client.get("/api/cobros").status_code == 401
    assert client.post("/api/pagos", json={"id_cobro": 1, "valor": 1, "medio": "EFECTIVO"}).status_code == 401


def test_cp_p09_mora_calculada_por_vencimiento(client, oper, app):
    db.session.execute(text("UPDATE cobro SET fecha_vencimiento = CURRENT_DATE - 1"))
    db.session.commit()
    r = client.get("/api/cobros?estado=EN_MORA", headers=oper)
    assert r.json["total"] == 1
    k = client.get("/api/pagos/kpis", headers=oper).json
    assert k["cobros_mora"] == 1 and k["saldo_mora"] == 300000


def test_cp_p10_indicadores_del_periodo(client, oper):
    c = _cobro(client, oper)
    _pagar(client, oper, c["id_cobro"], 150000)
    k = client.get("/api/pagos/kpis", headers=oper).json
    assert k["total"] == 300000 and k["pagado"] == 150000 and k["saldo"] == 150000
    assert k["porcentaje_pagado"] == 50.0
    assert client.get("/api/pagos/kpis?periodo=2026-13", headers=oper).status_code == 422


def test_cp_p11_historial_de_pagos_y_busqueda_por_recibo(client, oper):
    c = _cobro(client, oper)
    recibo = _pagar(client, oper, c["id_cobro"], 50000).json["pago"]["numero_recibo"]
    _pagar(client, oper, c["id_cobro"], 50000)
    r = client.get("/api/pagos", headers=oper)
    assert r.json["total"] == 2
    assert client.get(f"/api/pagos?q={recibo}", headers=oper).json["items"][0]["numero_recibo"] == recibo


def test_cp_p12_pagos_no_se_pueden_borrar(client, oper, app):
    c = _cobro(client, oper)
    _pagar(client, oper, c["id_cobro"], 1000)
    try:
        db.session.execute(text("DELETE FROM pago"))
        raise AssertionError("DELETE debió fallar")
    except AssertionError:
        raise
    except Exception:
        db.session.rollback()
    assert client.get("/api/pagos", headers=oper).json["total"] == 1


def test_cp_p13_soporte_de_pago(client, oper, app, tmp_path):
    app.config["UPLOAD_DIR"] = tmp_path
    malo = {"archivo": (io.BytesIO(b"x"), "virus.exe")}
    r = client.post("/api/archivos", data=malo, headers=oper, content_type="multipart/form-data")
    assert r.status_code == 422
    bueno = {"archivo": (io.BytesIO(b"%PDF-1.4"), "soporte.pdf")}
    r = client.post("/api/archivos", data=bueno, headers=oper, content_type="multipart/form-data")
    assert r.status_code == 201
    c = _cobro(client, oper)
    p = _pagar(client, oper, c["id_cobro"], 1000, "TRANSFERENCIA", soporte_url=r.json["url"]).json["pago"]
    assert p["soporte_url"] == r.json["url"]


def test_cp_p14_solo_admin_crea_mensualidad_y_genera_cobro(client, oper, admin, datos):
    body = {"id_usuario": datos["luis"].id_usuario, "placa": "ABC123",
            "id_celda": datos["celdas"]["A02"].id_celda, "fecha_inicio": hoy_bogota().isoformat()}
    assert client.post("/api/mensualidades", json=body, headers=oper).status_code == 403
    assert client.post("/api/mensualidades", json=body, headers=admin).status_code == 201
    assert client.get("/api/cobros?q=ABC123", headers=admin).json["total"] == 1
