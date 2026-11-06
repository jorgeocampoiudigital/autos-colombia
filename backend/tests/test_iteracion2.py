"""Iteración 2 · Gestión de usuarios y gestión de celdas."""
import threading
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlalchemy import text

from app import create_app
from app.config import ProductionConfig
from app.extensions import db
from app.models import Operador
from app.services._sql import hoy as hoy_bogota


# ---------------------------------------------------------------- vehículos
def test_agregar_vehiculo_a_cliente_existente(client, oper, datos):
    r = client.post("/api/vehiculos", headers=oper,
                    json={"id_usuario": datos["ana"].id_usuario, "placa": "jkp-903", "tipo": "CARRO"})
    assert r.status_code == 201
    assert "JKP903" in [v["placa"] for v in r.json["vehiculos"]]


def test_vehiculo_cliente_inexistente(client, oper, datos):
    r = client.post("/api/vehiculos", headers=oper, json={"id_usuario": 9999, "placa": "JKP903"})
    assert r.status_code == 404


def test_vehiculo_placa_duplicada(client, oper, datos):
    r = client.post("/api/vehiculos", headers=oper,
                    json={"id_usuario": datos["ana"].id_usuario, "placa": "KTR482"})
    assert r.status_code == 409 and "placa" in r.json["error"]


@pytest.mark.parametrize("tipo,placa,ok", [
    ("CARRO", "XYZ789", True), ("CARRO", "12345", False), ("CARRO", "ABC12D", False),
    ("MOTO", "ABC12D", True), ("MOTO", "ABC12", True), ("MOTO", "ABC123", False), ("MOTO", "ZZZZZZZZ", False),
])
def test_formato_de_placa_segun_tipo(client, oper, datos, tipo, placa, ok):
    r = client.post("/api/vehiculos", headers=oper,
                    json={"id_usuario": datos["ana"].id_usuario, "placa": placa, "tipo": tipo})
    assert r.status_code == (201 if ok else 422)
    if not ok:
        assert "Placa inválida" in r.json["details"][0]["mensaje"]


# ---------------------------------------------------------------- clientes
def test_actualizar_cliente(client, oper, datos):
    r = client.patch(f"/api/clientes/{datos['ana'].id_usuario}", headers=oper, json={"telefono": "3001234567"})
    assert r.status_code == 200 and r.json["telefono"] == "3001234567"


def test_cliente_inactivo_no_ingresa_ni_recibe_mensualidad_ni_vehiculos(client, oper, admin, datos):
    ana, luis = datos["ana"].id_usuario, datos["luis"].id_usuario
    assert client.patch(f"/api/clientes/{ana}", headers=oper, json={"activo": False}).json["activo"] is False

    info = client.get("/api/movimientos/placa/KTR482", headers=oper).json
    assert info["puede_ingresar"] is False and "inactivo" in info["mensaje"]
    r = client.post("/api/movimientos/entrada", headers=oper, json={"placa": "KTR482"})
    assert r.status_code == 409 and "inactivo" in r.json["error"]
    r = client.post("/api/vehiculos", headers=oper, json={"id_usuario": ana, "placa": "JKP903"})
    assert r.status_code == 409

    client.patch(f"/api/clientes/{luis}", headers=oper, json={"activo": False})
    r = client.post("/api/mensualidades", headers=admin, json={
        "id_usuario": luis, "placa": "ABC123", "id_celda": datos["celdas"]["A02"].id_celda,
        "fecha_inicio": hoy_bogota().isoformat()})
    assert r.status_code == 409 and "inactivo" in r.json["error"]

    client.patch(f"/api/clientes/{ana}", headers=oper, json={"activo": True})
    assert client.post("/api/movimientos/entrada", headers=oper, json={"placa": "KTR482"}).status_code == 201


def test_cliente_inactivo_puede_registrar_salida(client, oper, datos):
    client.post("/api/movimientos/entrada", headers=oper, json={"placa": "KTR482"})
    client.patch(f"/api/clientes/{datos['ana'].id_usuario}", headers=oper, json={"activo": False})
    assert client.post("/api/movimientos/salida", headers=oper, json={"placa": "KTR482"}).status_code == 200


# ---------------------------------------------------------------- mensualidades y celdas
def test_mensualidad_rechaza_celda_de_otro_tipo_y_fuera_de_servicio(client, admin, datos):
    base = {"id_usuario": datos["luis"].id_usuario, "placa": "ABC123", "fecha_inicio": hoy_bogota().isoformat()}
    r = client.post("/api/mensualidades", headers=admin, json={**base, "id_celda": datos["celdas"]["M01"].id_celda})
    assert r.status_code == 409 and "no es apta" in r.json["error"]
    r = client.post("/api/mensualidades", headers=admin, json={**base, "id_celda": datos["celdas"]["A04"].id_celda})
    assert r.status_code == 409 and "fuera de servicio" in r.json["error"]


def test_mensualidad_deja_la_celda_vacia_asignada(client, admin, oper, datos):
    a02 = datos["celdas"]["A02"].id_celda
    client.post("/api/mensualidades", headers=admin, json={
        "id_usuario": datos["luis"].id_usuario, "placa": "ABC123", "id_celda": a02,
        "fecha_inicio": hoy_bogota().isoformat()})
    assert client.get(f"/api/celdas/{a02}", headers=oper).json["estado"] == "VACIA_ASIGNADA"


def test_habilitar_celda(client, admin, datos):
    a04 = datos["celdas"]["A04"].id_celda
    r = client.post(f"/api/celdas/{a04}/habilitar", headers=admin)
    assert r.status_code == 200 and r.json["estado"] == "DISPONIBLE"
    assert client.post(f"/api/celdas/{a04}/habilitar", headers=admin).status_code == 409
    assert client.post("/api/celdas/9999/habilitar", headers=admin).status_code == 404
    assert client.post("/api/celdas/9999/mantenimiento", headers=admin, json={"motivo": "Pintura"}).status_code == 404


def test_mapa_de_celdas_cuadra_con_el_resumen(client, oper, datos):
    r = client.get("/api/celdas", headers=oper).json
    assert sum(r["resumen"].values()) == r["total"] == len(r["celdas"])
    assert r["resumen"]["FUERA_SERVICIO"] == 1 and r["resumen"]["VACIA_ASIGNADA"] == 1


def test_bd_impide_mantenimiento_de_celda_ocupada(client, oper, datos):
    client.post("/api/movimientos/entrada", headers=oper, json={"placa": "KTR482"})
    with pytest.raises(Exception, match="vehículo dentro"):
        db.session.execute(text("INSERT INTO mantenimiento_celda(id_celda, motivo) VALUES (:i, 'x')"),
                           {"i": datos["celdas"]["A01"].id_celda})
    db.session.rollback()


def test_entrada_y_mantenimiento_simultaneos_se_serializan(app, datos):
    """Una entrada sin confirmar bloquea la celda; el mantenimiento espera y luego se rechaza."""
    a02 = datos["celdas"]["A02"].id_celda
    db.session.execute(text("""INSERT INTO mensualidad(id_usuario, placa, id_celda, fecha_inicio, fecha_fin, valor_mensual)
                               VALUES (:u, 'ABC123', :c, CURRENT_DATE, CURRENT_DATE + 10, 1000)"""),
                       {"u": datos["luis"].id_usuario, "c": a02})
    db.session.commit()
    op = db.session.query(Operador).filter_by(usuario="oper").one().id_operador

    engine = db.engine
    entrada = engine.connect()
    tx = entrada.begin()
    entrada.execute(text("INSERT INTO movimiento(placa, id_celda, id_operador_entrada) VALUES ('ABC123', :c, :o)"),
                    {"c": a02, "o": op})
    resultado: dict = {}

    def mantenimiento() -> None:
        with engine.connect() as c:
            try:
                with c.begin():
                    c.execute(text("SET lock_timeout = '5s'"))
                    c.execute(text("INSERT INTO mantenimiento_celda(id_celda, motivo) VALUES (:c, 'Pintura')"), {"c": a02})
                resultado["ok"] = True
            except Exception as e:  # noqa: BLE001
                resultado["error"] = str(e)

    hilo = threading.Thread(target=mantenimiento)
    hilo.start()
    hilo.join(0.5)
    assert hilo.is_alive(), "el mantenimiento debe esperar el bloqueo de la celda"
    tx.commit()
    entrada.close()
    hilo.join(10)
    assert "vehículo dentro" in resultado.get("error", "")


# ---------------------------------------------------------------- seguridad
def test_operador_desactivado_pierde_acceso_de_inmediato(client, oper, datos):
    assert client.get("/api/clientes", headers=oper).status_code == 200
    db.session.query(Operador).filter_by(usuario="oper").update({"activo": False})
    db.session.commit()
    r = client.get("/api/clientes", headers=oper)
    assert r.status_code == 401 and r.json["error"] == "La sesión ya no es válida"


def test_cambio_de_rol_aplica_sin_volver_a_iniciar_sesion(client, oper, datos):
    a03 = datos["celdas"]["A03"].id_celda
    assert client.post(f"/api/celdas/{a03}/mantenimiento", headers=oper, json={"motivo": "Pintura"}).status_code == 403
    db.session.query(Operador).filter_by(usuario="oper").update({"rol": "ADMIN"})
    db.session.commit()
    assert client.post(f"/api/celdas/{a03}/mantenimiento", headers=oper, json={"motivo": "Pintura"}).status_code == 201


def test_token_con_rol_falsificado_no_eleva_privilegios(client, app, datos):
    oper_id = db.session.query(Operador).filter_by(usuario="oper").one().id_operador
    tok = jwt.encode({"sub": str(oper_id), "rol": "ADMIN", "nombre": "x",
                      "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                     app.config["SECRET_KEY"], algorithm="HS256")
    r = client.post(f"/api/celdas/{datos['celdas']['A03'].id_celda}/mantenimiento",
                    headers={"Authorization": f"Bearer {tok}"}, json={"motivo": "Pintura"})
    assert r.status_code == 403


def test_token_vencido(client, app, datos):
    tok = jwt.encode({"sub": "1", "rol": "ADMIN", "nombre": "x",
                      "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
                     app.config["SECRET_KEY"], algorithm="HS256")
    r = client.get("/api/celdas", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401 and r.json["error"] == "La sesión expiró"


@pytest.mark.parametrize("clave", ["", "4ut0sC0l0mb14", "cambia-esta-clave", "corta"])
def test_produccion_exige_secret_key_fuerte(clave):
    class Prod(ProductionConfig):
        SECRET_KEY = clave
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app(Prod)


def test_produccion_arranca_con_clave_fuerte():
    class Prod(ProductionConfig):
        SECRET_KEY = "x" * 48
    assert create_app(Prod).config["DEBUG"] is False


# ---------------------------------------------------------------- zona horaria
def test_conexion_usa_hora_de_colombia(app):
    assert db.session.execute(text("SELECT current_setting('TimeZone')")).scalar() == "America/Bogota"
    assert db.session.execute(text("SELECT CURRENT_DATE")).scalar() == hoy_bogota()
