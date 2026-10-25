from flask import Blueprint, g, jsonify, request

from app.auth import login_required
from app.routes._util import cuerpo, pag
from app.schemas import NovedadEstadoIn, NovedadIn
from app.services import novedad_service as svc

novedad_bp = Blueprint("novedades", __name__)


@novedad_bp.get("")
@login_required
def listar():
    page, per = pag()
    return jsonify({**svc.listar(request.args.get("tab"), request.args.get("q"),
                                 request.args.get("periodo"), page, per), "kpis": svc.kpis()})


@novedad_bp.get("/kpis")
@login_required
def kpis():
    return jsonify(svc.kpis())


@novedad_bp.get("/<int:id_novedad>")
@login_required
def obtener(id_novedad: int):
    return jsonify(svc.obtener(id_novedad))


@novedad_bp.post("")
@login_required
def crear():
    return jsonify(svc.crear(cuerpo(NovedadIn), g.operador["id"])), 201


@novedad_bp.patch("/<int:id_novedad>/estado")
@login_required
def estado(id_novedad: int):
    return jsonify(svc.cambiar_estado(id_novedad, cuerpo(NovedadEstadoIn), g.operador["id"]))
