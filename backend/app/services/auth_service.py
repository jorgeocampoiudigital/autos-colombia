from datetime import datetime, timedelta, timezone
from math import ceil

from flask import current_app

from app.auth import emitir_token, hash_clave, verificar_clave
from app.errors import AppError, Unauthorized
from app.extensions import db
from app.models import Operador
from app.schemas import CambioClaveIn, LoginIn

_CREDENCIALES = "Usuario o contraseña incorrectos"
# Hash de relleno: si el usuario no existe igual se ejecuta bcrypt y la respuesta tarda lo mismo
_HASH_RELLENO = hash_clave("relleno-para-tiempo-constante")


def login(datos: LoginIn) -> dict:
    op = (db.session.query(Operador).filter_by(usuario=datos.usuario.strip().lower())
          .with_for_update().one_or_none())
    if op is None or not op.activo:
        verificar_clave(datos.clave, _HASH_RELLENO)
        raise Unauthorized(_CREDENCIALES)

    ahora = datetime.now(timezone.utc)
    if op.bloqueado_hasta and op.bloqueado_hasta > ahora:
        db.session.rollback()
        minutos = ceil((op.bloqueado_hasta - ahora).total_seconds() / 60)
        raise AppError(f"Usuario bloqueado por intentos fallidos. Intenta de nuevo en {minutos} min "
                       "o pide a un administrador que restablezca tu contraseña", 423)

    if not verificar_clave(datos.clave, op.clave_hash):
        op.intentos_fallidos += 1
        if op.intentos_fallidos >= current_app.config["MAX_INTENTOS_LOGIN"]:
            op.bloqueado_hasta = ahora + timedelta(minutes=current_app.config["MINUTOS_BLOQUEO"])
            op.intentos_fallidos = 0
        db.session.commit()
        raise Unauthorized(_CREDENCIALES)

    op.intentos_fallidos = 0
    op.bloqueado_hasta = None
    op.ultimo_acceso = ahora
    db.session.commit()
    return {"token": emitir_token(op.id_operador, op.rol, op.nombre), "operador": perfil(op)}


def cambiar_clave(id_operador: int, datos: CambioClaveIn) -> dict:
    op = db.session.get(Operador, id_operador)
    if not verificar_clave(datos.clave_actual, op.clave_hash):
        raise AppError("La contraseña actual no es correcta", 422)
    if datos.clave_nueva == datos.clave_actual:
        raise AppError("La nueva contraseña debe ser diferente de la actual", 422)
    op.clave_hash = hash_clave(datos.clave_nueva)
    op.debe_cambiar_clave = False
    db.session.commit()
    return perfil(op)


def perfil(op: Operador) -> dict:
    return {"id": op.id_operador, "nombre": op.nombre, "usuario": op.usuario, "rol": op.rol,
            "debe_cambiar_clave": op.debe_cambiar_clave}
