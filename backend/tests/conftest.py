"""Pruebas contra un Postgres real (las reglas críticas viven en la BD)."""
import os
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

from app import create_app
from app.auth import hash_clave
from app.config import TestingConfig
from app.extensions import db
from app.models import Celda, Cobro, MantenimientoCelda, Mensualidad, Operador, Sede, Usuario, Vehiculo

SCHEMA = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


@pytest.fixture()
def app():
    app = create_app(TestingConfig)
    with app.app_context():
        db.session.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
        db.session.commit()
        db.session.connection().connection.cursor().execute(SCHEMA.read_text(encoding="utf-8"))
        db.session.commit()
        yield app
        db.session.remove()


@pytest.fixture()
def datos(app):
    """Sede con celdas A01..A04 (A04 en mantenimiento) + moto M01; dos clientes y un admin/operador."""
    sede = Sede(nombre="Sede principal", ciudad="Bogotá")
    db.session.add(sede)
    db.session.flush()
    celdas = {}
    for cod, tipo in (("A01", "CARRO"), ("A02", "CARRO"), ("A03", "CARRO"), ("A04", "CARRO"), ("M01", "MOTO")):
        celdas[cod] = Celda(id_sede=sede.id_sede, codigo=cod, fila=cod[0], tipo=tipo)
        db.session.add(celdas[cod])
    admin = Operador(nombre="Admin", usuario="admin", clave_hash=hash_clave("Admin123*"), rol="ADMIN")
    oper = Operador(nombre="Operador", usuario="oper", clave_hash=hash_clave("Oper123*"), rol="OPERADOR")
    db.session.add_all([admin, oper])
    ana = Usuario(nombre="Ana Martínez", documento="111")
    luis = Usuario(nombre="Luis Pérez", documento="222")
    db.session.add_all([ana, luis])
    db.session.flush()
    db.session.add_all([
        Vehiculo(placa="KTR482", tipo="CARRO", id_usuario=ana.id_usuario),
        Vehiculo(placa="ABC123", tipo="CARRO", id_usuario=luis.id_usuario),   # sin mensualidad
        Vehiculo(placa="MOT123", tipo="MOTO", id_usuario=luis.id_usuario),
    ])
    db.session.flush()
    hoy = date.today()
    m = Mensualidad(id_usuario=ana.id_usuario, placa="KTR482", id_celda=celdas["A01"].id_celda,
                    fecha_inicio=hoy - timedelta(days=5), fecha_fin=hoy + timedelta(days=20), valor_mensual=300000)
    db.session.add(m)
    db.session.flush()
    db.session.add(Cobro(id_mensualidad=m.id_mensualidad, periodo_inicio=hoy - timedelta(days=5),
                         periodo_fin=hoy + timedelta(days=20), fecha_vencimiento=hoy + timedelta(days=3), valor=300000))
    db.session.add(MantenimientoCelda(id_celda=celdas["A04"].id_celda, motivo="Pintura"))
    db.session.commit()
    return {"celdas": celdas, "ana": ana, "luis": luis, "mensualidad": m}


@pytest.fixture()
def client(app, datos):
    return app.test_client()


def _token(client, usuario, clave):
    r = client.post("/api/auth/login", json={"usuario": usuario, "clave": clave})
    return {"Authorization": f"Bearer {r.json['token']}"}


@pytest.fixture()
def admin(client):
    return _token(client, "admin", "Admin123*")


@pytest.fixture()
def oper(client):
    return _token(client, "oper", "Oper123*")
