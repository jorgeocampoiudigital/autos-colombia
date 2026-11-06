"""Administración de usuarios del sistema (operadores y administradores)."""
from datetime import datetime, timezone

from app.auth import hash_clave
from app.errors import Conflict, NotFound
from app.extensions import db
from app.models import Operador
from app.schemas import OperadorIn, OperadorUpdateIn, RestablecerClaveIn


def _fila(op: Operador) -> dict:
    ahora = datetime.now(timezone.utc)
    return {
        "id": op.id_operador, "nombre": op.nombre, "usuario": op.usuario, "rol": op.rol,
        "activo": op.activo, "bloqueado": bool(op.bloqueado_hasta and op.bloqueado_hasta > ahora),
        "bloqueado_hasta": op.bloqueado_hasta, "debe_cambiar_clave": op.debe_cambiar_clave,
        "ultimo_acceso": op.ultimo_acceso, "created_at": op.created_at,
    }


def _obtener(id_operador: int) -> Operador:
    op = db.session.get(Operador, id_operador)
    if not op:
        raise NotFound("Usuario no encontrado")
    return op


def listar(q: str | None, rol: str | None) -> dict:
    consulta = db.session.query(Operador)
    if q and q.strip():
        patron = f"%{q.strip()}%"
        consulta = consulta.filter(Operador.nombre.ilike(patron) | Operador.usuario.ilike(patron))
    if rol in ("ADMIN", "OPERADOR"):
        consulta = consulta.filter(Operador.rol == rol)
    items = [_fila(op) for op in consulta.order_by(Operador.activo.desc(), Operador.nombre).all()]
    todos = db.session.query(Operador).all()
    resumen = {
        "total": len(todos),
        "activos": sum(1 for o in todos if o.activo),
        "administradores": sum(1 for o in todos if o.activo and o.rol == "ADMIN"),
    }
    return {"items": items, "resumen": resumen}


def crear(datos: OperadorIn) -> dict:
    if db.session.query(Operador.id_operador).filter_by(usuario=datos.usuario).first():
        raise Conflict("Ya existe un usuario con ese nombre de usuario")
    op = Operador(nombre=datos.nombre, usuario=datos.usuario, rol=datos.rol,
                  clave_hash=hash_clave(datos.clave_temporal), debe_cambiar_clave=True)
    db.session.add(op)
    db.session.commit()
    return _fila(op)


def actualizar(id_operador: int, datos: OperadorUpdateIn, id_actual: int) -> dict:
    op = _obtener(id_operador)
    cambios = datos.model_dump(exclude_unset=True, exclude_none=True)
    if id_operador == id_actual and (cambios.get("activo") is False or cambios.get("rol", op.rol) != op.rol):
        raise Conflict("No puedes desactivarte ni cambiar tu propio rol; pídeselo a otro administrador")
    for campo, valor in cambios.items():
        setattr(op, campo, valor)
    db.session.commit()       # el trigger exige que quede al menos un ADMIN activo (-> 409)
    return _fila(op)


def restablecer_clave(id_operador: int, datos: RestablecerClaveIn) -> dict:
    """Asigna una contraseña temporal, obliga a cambiarla y levanta el bloqueo."""
    op = _obtener(id_operador)
    op.clave_hash = hash_clave(datos.clave_temporal)
    op.debe_cambiar_clave = True
    op.intentos_fallidos = 0
    op.bloqueado_hasta = None
    db.session.commit()
    return _fila(op)


def desbloquear(id_operador: int) -> dict:
    op = _obtener(id_operador)
    op.intentos_fallidos = 0
    op.bloqueado_hasta = None
    db.session.commit()
    return _fila(op)
