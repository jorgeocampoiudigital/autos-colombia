"""Iteración 2 · Usuarios del sistema y roles (RFU-07, RFU-08, RFU-09, RNF-02, RN-07)."""
import threading
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.extensions import db
from app.models import Operador

CLAVE = "Temporal1*"


def _login(client, usuario: str, clave: str):
    return client.post("/api/auth/login", json={"usuario": usuario, "clave": clave})


def _h(r) -> dict:
    return {"Authorization": f"Bearer {r.json['token']}"}


def _id(usuario: str) -> int:
    return db.session.query(Operador).filter_by(usuario=usuario).one().id_operador


def _crear(client, admin, usuario="scardona", rol="OPERADOR"):
    return client.post("/api/usuarios", headers=admin,
                       json={"nombre": "Sara Cardona", "usuario": usuario, "rol": rol, "clave_temporal": CLAVE})


# ---------------------------------------------------------------- permisos
def test_solo_admin_gestiona_usuarios(client, oper, admin):
    assert client.get("/api/usuarios", headers=oper).status_code == 403
    assert _crear(client, oper).status_code == 403
    r = client.get("/api/usuarios", headers=admin)
    assert r.status_code == 200 and r.json["resumen"] == {"total": 2, "activos": 2, "administradores": 1}
    assert "clave_hash" not in r.json["items"][0]


# ---------------------------------------------------------------- alta y primer ingreso
def test_crear_usuario_obliga_a_cambiar_la_clave_temporal(client, admin):
    r = _crear(client, admin, usuario=" SCardona ")
    assert r.status_code == 201 and r.json["usuario"] == "scardona" and r.json["debe_cambiar_clave"] is True

    login = _login(client, "scardona", CLAVE)
    assert login.status_code == 200 and login.json["operador"]["debe_cambiar_clave"] is True
    h = _h(login)
    r = client.get("/api/clientes", headers=h)
    assert r.status_code == 403 and "contraseña temporal" in r.json["error"]
    assert client.get("/api/auth/me", headers=h).status_code == 200

    r = client.post("/api/auth/cambiar-clave", headers=h, json={"clave_actual": CLAVE, "clave_nueva": "Definitiva9#"})
    assert r.status_code == 200 and r.json["debe_cambiar_clave"] is False
    assert client.get("/api/clientes", headers=h).status_code == 200
    assert _login(client, "scardona", "Definitiva9#").status_code == 200


def test_usuario_duplicado_y_formato(client, admin):
    assert _crear(client, admin).status_code == 201
    r = _crear(client, admin, usuario="SCARDONA")
    assert r.status_code == 409 and "Ya existe" in r.json["error"]
    assert _crear(client, admin, usuario="sara cardona").status_code == 422
    assert _crear(client, admin, usuario="ab").status_code == 422


@pytest.mark.parametrize("clave,falta", [
    ("Corta1*", "mínimo 8"), ("sinmayuscula1*", "mayúscula"), ("SINMINUSCULA1*", "minúscula"),
    ("SinNumero**", "número"), ("SinSimbolo11", "símbolo"),
])
def test_politica_de_contrasenas(client, admin, clave, falta):
    r = client.post("/api/usuarios", headers=admin,
                    json={"nombre": "Sara", "usuario": "sara", "rol": "OPERADOR", "clave_temporal": clave})
    assert r.status_code == 422 and falta in r.json["details"][0]["mensaje"]


def test_cambiar_clave_valida_la_actual_y_que_sea_distinta(client, oper):
    r = client.post("/api/auth/cambiar-clave", headers=oper, json={"clave_actual": "mala", "clave_nueva": "Nueva123*"})
    assert r.status_code == 422 and "actual" in r.json["error"]
    r = client.post("/api/auth/cambiar-clave", headers=oper, json={"clave_actual": "Oper123*", "clave_nueva": "Oper123*"})
    assert r.status_code == 422 and "diferente" in r.json["error"]
    r = client.post("/api/auth/cambiar-clave", headers=oper, json={"clave_actual": "Oper123*", "clave_nueva": "debil"})
    assert r.status_code == 422


# ---------------------------------------------------------------- edición, rol y estado
def test_editar_nombre_y_rol(client, admin, oper):
    oid = _id("oper")
    r = client.patch(f"/api/usuarios/{oid}", headers=admin, json={"nombre": "Paula Rojas", "rol": "ADMIN"})
    assert r.status_code == 200 and r.json["rol"] == "ADMIN" and r.json["nombre"] == "Paula Rojas"
    assert client.get("/api/usuarios", headers=oper).status_code == 200   # el nuevo rol aplica de inmediato


def test_desactivar_usuario_le_quita_el_acceso(client, admin, oper):
    r = client.patch(f"/api/usuarios/{_id('oper')}", headers=admin, json={"activo": False})
    assert r.status_code == 200 and r.json["activo"] is False
    assert client.get("/api/clientes", headers=oper).status_code == 401
    assert _login(client, "oper", "Oper123*").status_code == 401
    client.patch(f"/api/usuarios/{_id('oper')}", headers=admin, json={"activo": True})
    assert _login(client, "oper", "Oper123*").status_code == 200


def test_admin_no_puede_desactivarse_ni_quitarse_el_rol(client, admin):
    aid = _id("admin")
    r = client.patch(f"/api/usuarios/{aid}", headers=admin, json={"activo": False})
    assert r.status_code == 409 and "propio" in r.json["error"]
    assert client.patch(f"/api/usuarios/{aid}", headers=admin, json={"rol": "OPERADOR"}).status_code == 409
    assert client.patch(f"/api/usuarios/{aid}", headers=admin, json={"nombre": "Admin General"}).status_code == 200


def test_siempre_queda_un_admin_activo(client, admin):
    """Aunque se salte la API, la BD rechaza dejar el sistema sin administradores."""
    with pytest.raises(Exception, match="al menos un administrador activo"):
        db.session.execute(text("UPDATE operador SET activo = FALSE WHERE rol = 'ADMIN'"))
    db.session.rollback()

    _crear(client, admin, usuario="admin2", rol="ADMIN")
    db.session.execute(text("UPDATE operador SET activo = FALSE WHERE usuario = 'admin2'"))
    db.session.commit()
    assert db.session.execute(text("SELECT count(*) FROM operador WHERE rol='ADMIN' AND activo")).scalar() == 1


def test_dos_admins_no_pueden_desactivarse_mutuamente_a_la_vez(app, client, admin):
    _crear(client, admin, usuario="admin2", rol="ADMIN")
    db.session.remove()
    engine = db.engine
    a = engine.connect()
    tx = a.begin()
    a.execute(text("UPDATE operador SET activo = FALSE WHERE usuario = 'admin'"))
    resultado: dict = {}

    def otro() -> None:
        with engine.connect() as c:
            try:
                with c.begin():
                    c.execute(text("SET lock_timeout = '5s'"))
                    c.execute(text("UPDATE operador SET activo = FALSE WHERE usuario = 'admin2'"))
                resultado["ok"] = True
            except Exception as e:  # noqa: BLE001
                resultado["error"] = str(e)

    hilo = threading.Thread(target=otro)
    hilo.start()
    hilo.join(0.5)
    tx.commit()
    a.close()
    hilo.join(10)
    assert "al menos un administrador activo" in resultado.get("error", "")


# ---------------------------------------------------------------- bloqueo por intentos fallidos
def test_bloqueo_tras_cinco_intentos_y_restablecimiento(client, admin):
    for _ in range(5):
        assert _login(client, "oper", "mala").status_code == 401
    r = _login(client, "oper", "Oper123*")
    assert r.status_code == 423 and "bloqueado" in r.json["error"]
    fila = next(u for u in client.get("/api/usuarios", headers=admin).json["items"] if u["usuario"] == "oper")
    assert fila["bloqueado"] is True

    r = client.post(f"/api/usuarios/{_id('oper')}/restablecer-clave", headers=admin, json={"clave_temporal": CLAVE})
    assert r.status_code == 200 and r.json["bloqueado"] is False and r.json["debe_cambiar_clave"] is True
    assert _login(client, "oper", "Oper123*").status_code == 401          # la clave anterior ya no sirve
    assert _login(client, "oper", CLAVE).json["operador"]["debe_cambiar_clave"] is True


def test_login_exitoso_reinicia_el_contador(client):
    for _ in range(4):
        _login(client, "oper", "mala")
    assert _login(client, "oper", "Oper123*").status_code == 200
    for _ in range(4):
        _login(client, "oper", "mala")
    assert _login(client, "oper", "Oper123*").status_code == 200


def test_desbloquear_y_bloqueo_vencido(client, admin):
    db.session.query(Operador).filter_by(usuario="oper").update(
        {"bloqueado_hasta": datetime.now(timezone.utc) + timedelta(minutes=10)})
    db.session.commit()
    assert _login(client, "oper", "Oper123*").status_code == 423
    assert client.post(f"/api/usuarios/{_id('oper')}/desbloquear", headers=admin).json["bloqueado"] is False
    assert _login(client, "oper", "Oper123*").status_code == 200

    db.session.query(Operador).filter_by(usuario="oper").update(
        {"bloqueado_hasta": datetime.now(timezone.utc) - timedelta(minutes=1)})
    db.session.commit()
    assert _login(client, "oper", "Oper123*").status_code == 200


def test_usuario_inexistente_no_revela_nada_ni_se_bloquea(client):
    respuestas = {_login(client, "nadie", "x").json["error"] for _ in range(6)}
    assert respuestas == {"Usuario o contraseña incorrectos"}


def test_registra_ultimo_acceso(client, admin):
    fila = next(u for u in client.get("/api/usuarios", headers=admin).json["items"] if u["usuario"] == "admin")
    assert fila["ultimo_acceso"] is not None


def test_usuario_inexistente_404(client, admin):
    assert client.patch("/api/usuarios/9999", headers=admin, json={"nombre": "X Y"}).status_code == 404
    assert client.post("/api/usuarios/9999/desbloquear", headers=admin).status_code == 404
