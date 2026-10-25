from flask import Blueprint, jsonify

from app.auth import login_required, roles_required
from app.routes._util import cuerpo
from app.schemas import MantenimientoIn
from app.services import celda_service as svc

celda_bp = Blueprint("celdas", __name__)


@celda_bp.get("")
@login_required
def listar():
    return jsonify(svc.listar())


@celda_bp.get("/<int:id_celda>")
@login_required
def detalle(id_celda: int):
    return jsonify(svc.detalle(id_celda))


@celda_bp.post("/<int:id_celda>/mantenimiento")
@roles_required("ADMIN")
def mantenimiento(id_celda: int):
    return jsonify(svc.poner_en_mantenimiento(id_celda, cuerpo(MantenimientoIn).motivo)), 201


@celda_bp.post("/<int:id_celda>/habilitar")
@roles_required("ADMIN")
def habilitar(id_celda: int):
    return jsonify(svc.habilitar(id_celda))
