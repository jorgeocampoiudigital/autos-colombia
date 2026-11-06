from flask import Blueprint, g, jsonify

from app.auth import login_required
from app.extensions import db
from app.models import Operador
from app.routes._util import cuerpo
from app.schemas import CambioClaveIn, LoginIn
from app.services import auth_service

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    return jsonify(auth_service.login(cuerpo(LoginIn)))


@auth_bp.get("/me")
@login_required
def me():
    return jsonify(auth_service.perfil(db.session.get(Operador, g.operador["id"])))


@auth_bp.post("/cambiar-clave")
@login_required
def cambiar_clave():
    return jsonify(auth_service.cambiar_clave(g.operador["id"], cuerpo(CambioClaveIn)))
