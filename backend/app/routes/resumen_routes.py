from flask import Blueprint, jsonify

from app.auth import login_required
from app.services import resumen_service

resumen_bp = Blueprint("resumen", __name__)


@resumen_bp.get("")
@login_required
def resumen():
    return jsonify(resumen_service.resumen())
