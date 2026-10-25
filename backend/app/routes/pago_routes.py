from flask import Blueprint, g, jsonify, request

from app.auth import login_required
from app.routes._util import cuerpo, pag
from app.schemas import PagoIn
from app.services import pago_service as svc

pago_bp = Blueprint("pagos", __name__)


@pago_bp.get("/pagos/kpis")
@login_required
def kpis():
    return jsonify(svc.kpis(request.args.get("periodo")))


@pago_bp.get("/cobros")
@login_required
def cobros():
    page, per = pag()
    return jsonify(svc.listar_cobros(
        request.args.get("q"), request.args.get("estado"), request.args.get("periodo"),
        request.args.get("pendientes", "false").lower() == "true", page, per))


@pago_bp.get("/cobros/<int:id_cobro>")
@login_required
def cobro(id_cobro: int):
    return jsonify(svc.obtener_cobro(id_cobro))


@pago_bp.get("/pagos")
@login_required
def pagos():
    page, per = pag()
    return jsonify(svc.listar_pagos(request.args.get("q"), request.args.get("periodo"), page, per))


@pago_bp.post("/pagos")
@login_required
def registrar():
    return jsonify(svc.registrar_pago(cuerpo(PagoIn), g.operador["id"])), 201
