"""Datos de muestra"""
import calendar
import random
from datetime import datetime, timedelta, timezone

from app.auth import hash_clave
from app.extensions import db
from app.models import (Celda, Cobro, MantenimientoCelda, Mensualidad, Movimiento, Novedad,
                        NovedadHistorial, Operador, Pago, Sede, Usuario, Vehiculo)
from app.services._sql import TZ, hoy

CLAVES = {"jperez": "Admin123*", "projas": "Operador123*"}

DISPONIBLES = {"A08", "B08", "C04", "D04", "D08", "D10"}
FUERA = {"D11", "D12"}
VACIAS = {"A03", "A05", "A11", "B05", "B10", "C06", "C12", "D06"}

NOMBRADOS = {
    1: ("Ana Martínez", "52418762", "KTR482", "A01", "Chevrolet", "Onix", "Blanco", 2022),
    2: ("Carlos López", "79625410", "FXL219", "A02", "Mazda", "2", "Rojo", 2020),
    3: ("Laura Gómez", "1032458719", "JPN563", "A03", "Renault", "Sandero", "Gris", 2021),
    4: ("Diego Ramírez", "80157324", "MZU704", "A04", "Kia", "Picanto", "Azul", 2023),
    5: ("María Torres", "51892603", "WER851", "A05", "Renault", "Logan", "Negro", 2019),
    6: ("Santiago Ruiz", "1026483957", "BVC326", "B04", "Toyota", "Yaris", "Plata", 2022),
    7: ("Jorge Fernández", "79318652", "RSD647", "C02", "Chevrolet", "Spark", "Blanco", 2018),
    13: ("Valentina Díaz", "1018629405", "GHT918", "B01", "Mazda", "3", "Gris", 2021),
    18: ("Andrés Moreno", "80412398", "NPK392", None, "Nissan", "March", "Rojo", 2017),
    24: ("Patricia Castro", "52987410", "DSJ835", None, "Hyundai", "i10", "Blanco", 2020),
    30: ("Camila Ríos", "1020345671", "CRX301", None, "Suzuki", "Swift", "Naranja", 2022),
    31: ("Paula Herrera", "52144876", "PHR310", None, "Kia", "Rio", "Negro", 2021),
    32: ("Ramón Vargas", "79845120", "RVG320", None, "Renault", "Duster", "Verde", 2019),
}
NOMBRES = ["Luis", "Marta", "Julio", "Sandra", "Felipe", "Natalia", "Camilo", "Daniela", "Héctor", "Liliana",
           "Mauricio", "Gloria", "Iván", "Adriana", "Oscar", "Paola", "Sergio", "Claudia", "Álvaro", "Mónica"]
APELLIDOS = ["Rojas", "Herrera", "Quintero", "Mejía", "Cardona", "Ospina", "Giraldo", "Restrepo", "Zapata",
             "Arango", "Londoño", "Pineda", "Salazar", "Cortés", "Vélez", "Muñoz", "Bedoya", "Ruiz"]
MARCAS = [("Chevrolet", "Sail"), ("Renault", "Kwid"), ("Mazda", "CX-30"), ("Toyota", "Corolla"),
          ("Kia", "Sportage"), ("Hyundai", "Tucson"), ("Nissan", "Versa"), ("Ford", "Fiesta")]
COLORES = ["Blanco", "Negro", "Gris", "Rojo", "Azul", "Plata"]
POR_VENCER = {5, 13, 20, 27, 36}
EN_MORA = {2: 10, 18: 15, 24: 13}   # idx -> días de atraso


def sembrar() -> None:
    rnd = random.Random(7)
    ahora = datetime.now(timezone.utc)
    h = hoy()
    ini_mes = h.replace(day=1)
    fin_mes = h.replace(day=calendar.monthrange(h.year, h.month)[1])

    sede = Sede(nombre="Sede principal", ciudad="Bogotá")
    db.session.add(sede)
    db.session.flush()

    celdas: dict[str, Celda] = {}
    for fila in "ABCD":
        for n in range(1, 13):
            c = Celda(id_sede=sede.id_sede, codigo=f"{fila}{n:02d}", fila=fila, tipo="CARRO")
            db.session.add(c)
            celdas[c.codigo] = c
    db.session.flush()
    db.session.add(MantenimientoCelda(id_celda=celdas["D11"].id_celda, motivo="Demarcación del piso",
                                      fecha_inicio=h - timedelta(days=1)))
    db.session.add(MantenimientoCelda(id_celda=celdas["D12"].id_celda, motivo="Revisión de filtración",
                                      fecha_inicio=h))

    ops = {}
    for usuario, nombre, rol in (("jperez", "Julián Pérez", "ADMIN"), ("projas", "Paola Rojas", "OPERADOR")):
        ops[usuario] = Operador(nombre=nombre, usuario=usuario, clave_hash=hash_clave(CLAVES[usuario]), rol=rol)
        db.session.add(ops[usuario])
    db.session.flush()
    op_list = [ops["jperez"], ops["projas"]]

    asignables = sorted(c for c in celdas if c not in DISPONIBLES | FUERA)
    usadas = {v[3] for v in NOMBRADOS.values() if v[3]}
    libres = iter(c for c in asignables if c not in usadas)
    placas_usadas = {v[2] for v in NOMBRADOS.values()}
    clientes: dict[int, tuple[Usuario, Vehiculo, str]] = {}
    for idx in range(1, 41):
        if idx in NOMBRADOS:
            nombre, doc, placa, celda, marca, linea, color, anio = NOMBRADOS[idx]
        else:
            nombre = f"{NOMBRES[idx % len(NOMBRES)]} {APELLIDOS[(idx * 3) % len(APELLIDOS)]}"
            doc = str(10000000 + idx * 1234567 % 80000000)
            while True:
                placa = "".join(rnd.choices("ABCDEFGHJKLMNPRSTUVWXYZ", k=3)) + f"{rnd.randint(100, 999)}"
                if placa not in placas_usadas:
                    placas_usadas.add(placa)
                    break
            celda = None
            marca, linea = MARCAS[idx % len(MARCAS)]
            color, anio = COLORES[idx % len(COLORES)], 2016 + idx % 9
        celda = celda or next(libres)
        u = Usuario(nombre=nombre, documento=doc, telefono=f"3{rnd.randint(0, 2)}{rnd.randint(1000000, 9999999)}",
                    email=f"{nombre.split()[0].lower()}.{nombre.split()[-1].lower()}@ejemplo.co".replace("á", "a")
                    .replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u"),
                    direccion="Calle 72 # 15-20, Bogotá" if idx == 1 else f"Carrera {10 + idx} # {20 + idx}-{idx}, Bogotá",
                    created_at=ahora - timedelta(days=60 - idx))
        db.session.add(u)
        db.session.flush()
        v = Vehiculo(placa=placa, tipo="CARRO", marca=marca, linea=linea, color=color, anio_modelo=anio,
                     id_usuario=u.id_usuario)
        db.session.add(v)
        clientes[idx] = (u, v, celda)
    for idx in (8, 9, 10):   # 3 vehículos adicionales (43 en total) sin mensualidad
        while True:
            placa = "".join(rnd.choices("ABCDEFGHJKLMNPRSTUVWXYZ", k=3)) + f"{rnd.randint(100, 999)}"
            if placa not in placas_usadas:
                placas_usadas.add(placa)
                break
        db.session.add(Vehiculo(placa=placa, tipo="CARRO", marca="Renault", linea="Stepway", color="Gris",
                                anio_modelo=2020, id_usuario=clientes[idx][0].id_usuario))
    db.session.flush()

    for idx in range(1, 41):
        u, v, celda = clientes[idx]
        m = Mensualidad(id_usuario=u.id_usuario, placa=v.placa, id_celda=celdas[celda].id_celda,
                        fecha_inicio=ini_mes, fecha_fin=fin_mes, valor_mensual=300000)
        db.session.add(m)
        db.session.flush()
        if idx in EN_MORA:
            venc = h - timedelta(days=EN_MORA[idx])
        elif idx in POR_VENCER:
            venc = h + timedelta(days=2 + idx % 5)
        else:
            venc = ini_mes + timedelta(days=14)
        cb = Cobro(id_mensualidad=m.id_mensualidad, periodo_inicio=ini_mes, periodo_fin=fin_mes,
                   fecha_vencimiento=venc, valor=300000)
        db.session.add(cb)
        db.session.flush()
        if idx not in EN_MORA and idx not in POR_VENCER:   # 32 pagados
            medio = ("TRANSFERENCIA", "EFECTIVO")[idx % 2]
            db.session.add(Pago(
                id_cobro=cb.id_cobro, valor=300000, medio=medio, id_operador=op_list[idx % 2].id_operador,
                fecha_pago=ini_mes + timedelta(days=idx % max(h.day, 1)) if ini_mes + timedelta(days=idx % max(h.day, 1)) <= h else h,
                referencia=f"TRX-{h:%y%m%d}-{idx:03d}" if medio == "TRANSFERENCIA" else None))
    db.session.flush()

    min_hoy = max(int((datetime.now(TZ) - datetime.now(TZ).replace(hour=0, minute=0, second=0)).total_seconds() // 60), 30)
    presentes_hoy = 0
    for idx in range(1, 41):
        u, v, celda = clientes[idx]
        cid = celdas[celda].id_celda
        op = op_list[idx % 2].id_operador
        if celda in VACIAS:
            salida = ahora - timedelta(minutes=rnd.randint(5, max(min_hoy - 5, 6)))
            mov = Movimiento(placa=v.placa, id_celda=cid, id_operador_entrada=op,
                             fecha_entrada=salida - timedelta(hours=rnd.randint(3, 20)),
                             observacion="Salida registrada")
            db.session.add(mov)
            db.session.flush()   # el trigger solo admite cerrar una estadía ya abierta
            mov.fecha_salida = salida
            mov.id_operador_salida = op_list[(idx + 1) % 2].id_operador
            db.session.flush()
        else:
            if presentes_hoy < 18:
                entrada = ahora - timedelta(minutes=rnd.randint(5, max(min_hoy - 5, 6)))
                presentes_hoy += 1
            else:
                entrada = ahora - timedelta(hours=rnd.randint(26, 48))
            db.session.add(Movimiento(placa=v.placa, id_celda=cid, id_operador_entrada=op,
                                      fecha_entrada=entrada, observacion="Sin novedades"))
    db.session.flush()

    placa = lambda i: clientes[i][1].placa  # noqa: E731
    mov_mzu = db.session.query(Movimiento).filter_by(placa=placa(4), fecha_salida=None).one_or_none()
    data = [
        (3, "OBSERVACION", "Verificación de vidrio lateral", "Se verifica el vidrio lateral izquierdo a solicitud del cliente.", "CERRADA", "projas", 15),
        (1, "OBSERVACION", "Entrega de documento al cliente", "Se entrega copia de la tarjeta de propiedad al cliente.", "CERRADA", "jperez", 13),
        (13, "OBSERVACION", "Luz interior encendida", "Se encuentra la luz interior encendida; se avisa al cliente.", "ABIERTA", "projas", 10),
        (6, "OBJETO_OLVIDADO", "Objeto olvidado en el vehículo", "Cliente reporta objeto olvidado en el asiento trasero.", "CERRADA", "jperez", 9),
        (2, "INCIDENTE", "Control remoto no responde", "El control remoto de la puerta no responde; el cliente solicita seguimiento.", "SEGUIMIENTO", "projas", 8),
        (4, "DANO", "Rayón en puerta posterior",
         "Se observa un rayón superficial en la puerta posterior derecha durante el ingreso. Se informa al cliente y se deja registro para seguimiento.", "ABIERTA", "jperez", 0),
    ]
    for idx, tipo, titulo, desc, estado, op, dias in data:
        fecha = ahora - timedelta(days=dias, minutes=0 if dias else 90)
        n = Novedad(placa=placa(idx), tipo=tipo, titulo=titulo, descripcion=desc, estado=estado,
                    id_operador=ops[op].id_operador, fecha_hora=fecha,
                    id_movimiento=mov_mzu.id_movimiento if (mov_mzu and idx == 4) else None,
                    fecha_cierre=ahora - timedelta(hours=1) if estado == "CERRADA" else None)
        db.session.add(n)
        db.session.flush()
        db.session.add(NovedadHistorial(id_novedad=n.id_novedad, estado="ABIERTA", comentario="Novedad registrada",
                                        id_operador=ops[op].id_operador, created_at=fecha))
        if estado != "ABIERTA":
            db.session.add(NovedadHistorial(id_novedad=n.id_novedad, estado=estado, id_operador=ops[op].id_operador,
                                            comentario="Seguimiento" if estado == "SEGUIMIENTO" else "Gestión documentada"))
    db.session.commit()
