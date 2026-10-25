"""JWT + control de acceso por roles (RF8, RNF3)."""
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable

import bcrypt
import jwt
from flask import current_app, g, request

from app.errors import Forbidden, Unauthorized


def hash_clave(clave: str) -> str:
    return bcrypt.hashpw(clave.encode(), bcrypt.gensalt()).decode()


def verificar_clave(clave: str, hash_: str) -> bool:
    try:
        return bcrypt.checkpw(clave.encode(), hash_.encode())
    except ValueError:
        return False


def emitir_token(id_operador: int, rol: str, nombre: str) -> str:
    ahora = datetime.now(timezone.utc)
    payload = {
        "sub": str(id_operador), "rol": rol, "nombre": nombre,
        "iat": ahora, "exp": ahora + timedelta(hours=current_app.config["JWT_HORAS"]),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def _cargar_operador() -> None:
    cabecera = request.headers.get("Authorization", "")
    if not cabecera.startswith("Bearer "):
        raise Unauthorized()
    try:
        datos = jwt.decode(cabecera[7:], current_app.config["SECRET_KEY"], algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise Unauthorized("La sesión expiró")
    except jwt.PyJWTError:
        raise Unauthorized("Token inválido")
    g.operador = {"id": int(datos["sub"]), "rol": datos["rol"], "nombre": datos["nombre"]}


def login_required(fn: Callable) -> Callable:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        _cargar_operador()
        return fn(*args, **kwargs)
    return wrapper


def roles_required(*roles: str) -> Callable:
    def decorador(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            _cargar_operador()
            if g.operador["rol"] not in roles:
                raise Forbidden()
            return fn(*args, **kwargs)
        return wrapper
    return decorador
