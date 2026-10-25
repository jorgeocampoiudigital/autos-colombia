from flask import Blueprint, jsonify, request

from app.auth import login_required, roles_required
from app.routes._util import cuerpo, pag
from app.schemas import ClienteIn, ClienteUpdateIn, MensualidadIn, VehiculoCreateIn
from app.services import cliente_service as svc

cliente_bp = Blueprint("clientes", __name__)


@cliente_bp.get("/clientes")
@login_required
def listar():
    page, per = pag()
    return jsonify({**svc.listar(request.args.get("q"), request.args.get("estado_pago"), page, per),
                    "kpis": svc.kpis()})


@cliente_bp.get("/clientes/<int:id_usuario>")
@login_required
def ficha(id_usuario: int):
    return jsonify(svc.ficha(id_usuario))


@cliente_bp.post("/clientes")
@login_required
def crear():
    return jsonify(svc.crear(cuerpo(ClienteIn))), 201


@cliente_bp.patch("/clientes/<int:id_usuario>")
@login_required
def actualizar(id_usuario: int):
    return jsonify(svc.actualizar(id_usuario, cuerpo(ClienteUpdateIn)))


@cliente_bp.get("/vehiculos")
@login_required
def vehiculos():
    page, per = pag()
    return jsonify(svc.listar_vehiculos(request.args.get("q"), page, per))


@cliente_bp.post("/vehiculos")
@login_required
def crear_vehiculo():
    return jsonify(svc.crear_vehiculo(cuerpo(VehiculoCreateIn))), 201


@cliente_bp.get("/mensualidades")
@login_required
def mensualidades():
    page, per = pag()
    return jsonify(svc.listar_mensualidades(request.args.get("q"), page, per))


@cliente_bp.post("/mensualidades")
@roles_required("ADMIN")
def asignar():
    return jsonify(svc.asignar_mensualidad(cuerpo(MensualidadIn))), 201
