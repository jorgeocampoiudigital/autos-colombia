from flask import Blueprint, g, jsonify, request

from app.auth import roles_required
from app.routes._util import cuerpo
from app.schemas import OperadorIn, OperadorUpdateIn, RestablecerClaveIn
from app.services import usuario_service as svc

usuario_bp = Blueprint("usuarios", __name__)


@usuario_bp.get("")
@roles_required("ADMIN")
def listar():
    return jsonify(svc.listar(request.args.get("q"), request.args.get("rol")))


@usuario_bp.post("")
@roles_required("ADMIN")
def crear():
    return jsonify(svc.crear(cuerpo(OperadorIn))), 201


@usuario_bp.patch("/<int:id_operador>")
@roles_required("ADMIN")
def actualizar(id_operador: int):
    return jsonify(svc.actualizar(id_operador, cuerpo(OperadorUpdateIn), g.operador["id"]))


@usuario_bp.post("/<int:id_operador>/restablecer-clave")
@roles_required("ADMIN")
def restablecer_clave(id_operador: int):
    return jsonify(svc.restablecer_clave(id_operador, cuerpo(RestablecerClaveIn)))


@usuario_bp.post("/<int:id_operador>/desbloquear")
@roles_required("ADMIN")
def desbloquear(id_operador: int):
    return jsonify(svc.desbloquear(id_operador))
