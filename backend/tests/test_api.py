from datetime import date, timedelta

from sqlalchemy import text

from app.extensions import db


def test_login_incorrecto_no_revela_cual_falla(client):
    r = client.post("/api/auth/login", json={"usuario": "admin", "clave": "mala"})
    assert r.status_code == 401 and r.json["error"] == "Usuario o contraseña incorrectos"
    r2 = client.post("/api/auth/login", json={"usuario": "nadie", "clave": "x"})
    assert r2.json == r.json


def test_clave_se_guarda_con_hash(app, datos):
    h = db.session.execute(text("SELECT clave_hash FROM operador WHERE usuario='admin'")).scalar()
    assert h.startswith("$2") and "Admin123" not in h


def test_endpoints_exigen_token(client):
    assert client.get("/api/celdas").status_code == 401
    assert client.get("/api/celdas", headers={"Authorization": "Bearer basura"}).status_code == 401


def test_operador_no_puede_acciones_de_admin(client, oper):
    assert client.post("/api/celdas/1/mantenimiento", json={"motivo": "x y z"}, headers=oper).status_code == 403


def test_entrada_asigna_celda_de_la_mensualidad_y_registra_operador(client, oper):
    r = client.post("/api/movimientos/entrada", json={"placa": " ktr-482 "}, headers=oper)   # RNF5 normaliza
    assert r.status_code == 201
    assert r.json["placa"] == "KTR482" and r.json["celda"] == "A01" and r.json["operador_entrada"] == "Operador"


def test_entrada_sin_mensualidad_vigente_rechazada(client, oper):               # RF2
    r = client.post("/api/movimientos/entrada", json={"placa": "ABC123"}, headers=oper)
    assert r.status_code == 409 and "mensualidad vigente" in r.json["error"]
    assert r.json["status"] == 409


def test_placa_inexistente(client, oper):
    assert client.post("/api/movimientos/entrada", json={"placa": "ZZZ999"}, headers=oper).status_code == 404


def test_segunda_entrada_misma_placa_rechazada(client, oper):                   # RF7
    client.post("/api/movimientos/entrada", json={"placa": "KTR482"}, headers=oper)
    r = client.post("/api/movimientos/entrada", json={"placa": "KTR482"}, headers=oper)
    assert r.status_code == 409 and "ya se encuentra" in r.json["error"]


def test_salida_sin_entrada_rechazada(client, oper):                            # RF7
    r = client.post("/api/movimientos/salida", json={"placa": "KTR482"}, headers=oper)
    assert r.status_code == 409 and "no ha ingresado" in r.json["error"]


def test_salida_libera_celda_y_queda_historial(client, oper, admin):            # RF4, RF5, RF6
    client.post("/api/movimientos/entrada", json={"placa": "KTR482"}, headers=oper)
    pres = client.get("/api/movimientos/presentes", headers=oper).json
    assert pres["total"] == 1
    celda = next(c for c in client.get("/api/celdas", headers=oper).json["celdas"] if c["codigo"] == "A01")
    assert celda["estado"] == "OCUPADA"
    r = client.post("/api/movimientos/salida", json={"placa": "KTR482"}, headers=admin)
    assert r.status_code == 200 and r.json["operador_salida"] == "Admin"
    assert client.get("/api/movimientos/presentes", headers=oper).json["total"] == 0
    celda = next(c for c in client.get("/api/celdas", headers=oper).json["celdas"] if c["codigo"] == "A01")
    assert celda["estado"] == "VACIA_ASIGNADA"          # vacía pero conserva la mensualidad
    h = client.get("/api/movimientos/historial?placa=ktr482", headers=oper).json
    assert [e["movimiento"] for e in h["items"]] == ["SALIDA", "ENTRADA"] and h["total"] == 2
    hoy = date.today().isoformat()
    assert client.get(f"/api/movimientos/historial?desde={hoy}&hasta={hoy}", headers=oper).json["total"] == 2
    ayer = (date.today() - timedelta(days=2)).isoformat()
    assert client.get(f"/api/movimientos/historial?hasta={ayer}", headers=oper).json["total"] == 0


def test_celda_manual_valida_tipo_estado_y_asignacion(client, oper, datos):     # RF3
    c = datos["celdas"]
    
    r = client.post("/api/movimientos/entrada", json={"placa": "KTR482", "id_celda": c["A04"].id_celda}, headers=oper)
    assert r.status_code == 409 and "fuera de servicio" in r.json["error"]
    
    r = client.post("/api/movimientos/entrada", json={"placa": "KTR482", "id_celda": c["M01"].id_celda}, headers=oper)
    assert r.status_code == 409 and "no es apta" in r.json["error"]
    
    r = client.post("/api/movimientos/entrada", json={"placa": "KTR482", "id_celda": c["A02"].id_celda}, headers=oper)
    assert r.status_code == 201 and r.json["celda"] == "A02"


def test_celda_ocupada_no_admite_segundo_vehiculo(client, oper, datos):
    client.post("/api/movimientos/entrada", json={"placa": "KTR482"}, headers=oper)
    mens = datos["mensualidad"]
    
    r = client.post("/api/mensualidades", json={
        "id_usuario": datos["luis"].id_usuario, "placa": "ABC123", "id_celda": datos["celdas"]["A02"].id_celda,
        "fecha_inicio": date.today().isoformat()}, headers=oper)
    assert r.status_code == 403   # solo ADMIN asigna
    r = client.post("/api/movimientos/entrada", json={"placa": "KTR482", "id_celda": datos["celdas"]["A01"].id_celda}, headers=oper)
    assert r.status_code == 409


def test_movimientos_no_se_pueden_borrar_ni_alterar(client, oper, app):
    client.post("/api/movimientos/entrada", json={"placa": "KTR482"}, headers=oper)
    client.post("/api/movimientos/salida", json={"placa": "KTR482"}, headers=oper)
    for sql in ("DELETE FROM movimiento", "UPDATE movimiento SET observacion='x'", "TRUNCATE movimiento"):
        try:
            db.session.execute(text(sql))
            raise AssertionError(f"{sql} debió fallar")
        except AssertionError:
            raise
        except Exception:
            db.session.rollback()


def test_placa_minuscula_rechazada_por_la_bd(app, datos):
    try:
        db.session.execute(text("INSERT INTO vehiculo(placa,tipo,id_usuario) VALUES ('abc 12','CARRO',1)"))
        raise AssertionError
    except AssertionError:
        raise
    except Exception:
        db.session.rollback()


def test_asignar_mensualidad_crea_cobro_y_rechaza_solapes(client, admin, datos):
    body = {"id_usuario": datos["luis"].id_usuario, "placa": "ABC123",
            "id_celda": datos["celdas"]["A02"].id_celda, "fecha_inicio": date.today().isoformat()}
    r = client.post("/api/mensualidades", json=body, headers=admin)
    assert r.status_code == 201 and r.json["codigo"].startswith("MEN-") and r.json["valor_mensual"] == 300000
    
    r = client.post("/api/mensualidades", json={**body, "placa": "MOT123"}, headers=admin)
    assert r.status_code == 409
    
    r = client.post("/api/mensualidades", json={**body, "id_usuario": datos["ana"].id_usuario,
                                                "id_celda": datos["celdas"]["A03"].id_celda}, headers=admin)
    assert r.status_code == 422
    cobros = client.get("/api/cobros?pendientes=true", headers=admin).json
    assert cobros["total"] == 2


def test_pago_parcial_total_y_exceso(client, oper):
    cobro = client.get("/api/cobros?pendientes=true", headers=oper).json["items"][0]
    assert cobro["estado"] == "POR_VENCER" and cobro["saldo"] == 300000
    r = client.post("/api/pagos", json={"id_cobro": cobro["id_cobro"], "valor": 100000, "medio": "EFECTIVO"}, headers=oper)
    assert r.status_code == 201 and r.json["pago"]["numero_recibo"].startswith("REC-")
    assert r.json["cobro"]["saldo"] == 200000
    r = client.post("/api/pagos", json={"id_cobro": cobro["id_cobro"], "valor": 250000, "medio": "EFECTIVO"}, headers=oper)
    assert r.status_code == 422 and "excede" in r.json["error"]
    r = client.post("/api/pagos", json={"id_cobro": cobro["id_cobro"], "valor": 200000, "medio": "TRANSFERENCIA",
                                        "referencia": "TRX-1"}, headers=oper)
    assert r.json["cobro"]["estado"] == "AL_DIA"
    r = client.post("/api/pagos", json={"id_cobro": cobro["id_cobro"], "valor": 1, "medio": "EFECTIVO"}, headers=oper)
    assert r.status_code == 409
    k = client.get("/api/pagos/kpis", headers=oper).json
    assert k["pagado"] == 300000 and k["saldo"] == 0
    assert client.post("/api/pagos", json={"id_cobro": cobro["id_cobro"], "valor": -5, "medio": "EFECTIVO"},
                       headers=oper).status_code == 422


def test_mora_no_bloquea_la_entrada(client, oper, app):
    db.session.execute(text("UPDATE cobro SET fecha_vencimiento = CURRENT_DATE - 5"))
    db.session.commit()
    assert client.get("/api/cobros", headers=oper).json["items"][0]["estado"] == "EN_MORA"
    assert client.post("/api/movimientos/entrada", json={"placa": "KTR482"}, headers=oper).status_code == 201


def test_mantenimiento_solo_si_no_esta_ocupada(client, admin, oper, datos):
    client.post("/api/movimientos/entrada", json={"placa": "KTR482"}, headers=oper)
    r = client.post(f"/api/celdas/{datos['celdas']['A01'].id_celda}/mantenimiento", json={"motivo": "Pintura"}, headers=admin)
    assert r.status_code == 409
    r = client.post(f"/api/celdas/{datos['celdas']['A03'].id_celda}/mantenimiento", json={"motivo": "Pintura"}, headers=admin)
    assert r.status_code == 201 and r.json["estado"] == "FUERA_SERVICIO"
    r = client.post(f"/api/celdas/{datos['celdas']['A03'].id_celda}/habilitar", headers=admin)
    assert r.json["estado"] == "DISPONIBLE"


def test_crear_cliente_con_vehiculo_y_duplicados(client, oper):
    body = {"nombre": "Nuevo Cliente", "documento": "999", "email": "n@ejemplo.co",
            "vehiculos": [{"placa": "nue 001", "tipo": "CARRO", "marca": "Kia"}]}
    r = client.post("/api/clientes", json=body, headers=oper)
    assert r.status_code == 201 and r.json["vehiculos"][0]["placa"] == "NUE001"
    r = client.post("/api/clientes", json=body, headers=oper)
    assert r.status_code == 409
    r = client.post("/api/clientes", json={**body, "documento": "1000", "email": "no-es-correo"}, headers=oper)
    assert r.status_code == 422 and r.json["details"][0]["campo"] == "email"
    r = client.post("/api/clientes", json={"nombre": "x", "documento": "1", "inventado": 1}, headers=oper)
    assert r.status_code == 422


def test_novedad_ciclo_de_vida(client, oper):
    client.post("/api/movimientos/entrada", json={"placa": "KTR482"}, headers=oper)
    r = client.post("/api/novedades", json={"placa": "ktr482", "tipo": "DANO",
                                            "descripcion": "Rayón en puerta posterior"}, headers=oper)
    assert r.status_code == 201 and r.json["estado"] == "ABIERTA" and r.json["celda"] == "A01"
    nid = r.json["id_novedad"]
    assert client.get("/api/novedades/kpis", headers=oper).json["abiertas"] == 1
    r = client.patch(f"/api/novedades/{nid}/estado", json={"estado": "SEGUIMIENTO"}, headers=oper)
    assert r.json["estado"] == "SEGUIMIENTO"
    r = client.patch(f"/api/novedades/{nid}/estado", json={"estado": "CERRADA", "comentario": "Resuelta"}, headers=oper)
    assert r.json["estado"] == "CERRADA" and r.json["fecha_cierre"] and len(r.json["historial"]) == 3
    assert client.patch(f"/api/novedades/{nid}/estado", json={"estado": "ABIERTA"}, headers=oper).status_code == 409


def test_formato_de_error_uniforme(client, oper):
    r = client.get("/api/no-existe", headers=oper)
    assert r.status_code == 404 and set(r.json) == {"error", "status"}
