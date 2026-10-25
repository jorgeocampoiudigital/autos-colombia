from app.auth import emitir_token, verificar_clave
from app.errors import Unauthorized
from app.extensions import db
from app.models import Operador
from app.schemas import LoginIn


def login(datos: LoginIn) -> dict:
    op = db.session.query(Operador).filter_by(usuario=datos.usuario).one_or_none()
    
    if op is None or not op.activo or not verificar_clave(datos.clave, op.clave_hash):
        raise Unauthorized("Usuario o contraseña incorrectos")
    return {"token": emitir_token(op.id_operador, op.rol, op.nombre), "operador": perfil(op)}


def perfil(op: Operador) -> dict:
    return {"id": op.id_operador, "nombre": op.nombre, "usuario": op.usuario, "rol": op.rol}
