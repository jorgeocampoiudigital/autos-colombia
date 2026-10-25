from datetime import date

from flask import Blueprint, g, jsonify, request

from app.auth import login_required
from app.errors import AppError
from app.routes._util import cuerpo, pag
from app.schemas import EntradaIn, SalidaIn, normalizar_placa
from app.services import movimiento_service as svc

movimiento_bp = Blueprint("movimientos", __name__)


def _fecha(nombre: str) -> date | None:
    v = request.args.get(nombre)
    if not v:
        return None
    try:
        return date.fromisoformat(v)
    except ValueError:
        raise AppError(f"{nombre} debe tener formato YYYY-MM-DD", 422)


@movimiento_bp.get("/placa/<placa>")
@login_required
def consultar_placa(placa: str):
    return jsonify(svc.consultar_placa(normalizar_placa(placa)))


@movimiento_bp.post("/entrada")
@login_required
def entrada():
    d = cuerpo(EntradaIn)
    return jsonify(svc.registrar_entrada(d.placa, d.id_celda, d.observacion, g.operador["id"])), 201


@movimiento_bp.post("/salida")
@login_required
def salida():
    d = cuerpo(SalidaIn)
    return jsonify(svc.registrar_salida(d.placa, d.observacion, g.operador["id"]))


@movimiento_bp.get("/presentes")
@login_required
def presentes():
    page, per = pag()
    return jsonify(svc.presentes(request.args.get("q"), request.args.get("celda"), page, per))


@movimiento_bp.get("/historial")
@login_required
def historial():
    page, per = pag()
    placa = request.args.get("placa")
    return jsonify(svc.historial(normalizar_placa(placa) if placa else None,
                                 _fecha("desde"), _fecha("hasta"), page, per))


@movimiento_bp.get("/kpis")
@login_required
def kpis():
    return jsonify(svc.kpis_hoy())
