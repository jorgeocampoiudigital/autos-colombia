import uuid
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from app.auth import login_required
from app.errors import AppError

archivo_bp = Blueprint("archivos", __name__)
_PERMITIDAS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


def _dir() -> Path:
    d = Path(current_app.config.get("UPLOAD_DIR", Path(current_app.root_path).parent / "uploads"))
    d.mkdir(parents=True, exist_ok=True)
    return d


@archivo_bp.post("")
@login_required
def subir():
    f = request.files.get("archivo")
    if not f or not f.filename:
        raise AppError("Adjunta un archivo en el campo 'archivo'", 422)
    ext = Path(f.filename).suffix.lower()
    if ext not in _PERMITIDAS:
        raise AppError("Formato no permitido (usa JPG, PNG, WEBP o PDF)", 422)
    nombre = f"{uuid.uuid4().hex}{ext}"
    f.save(_dir() / nombre)
    return jsonify({"nombre": Path(f.filename).name[:200], "url": f"/api/archivos/{nombre}",
                    "mime_type": f.mimetype}), 201


@archivo_bp.get("/<nombre>")
def descargar(nombre: str):
    # Sin Bearer (se abre desde <a>/<img>); la protección es el nombre no adivinable
    return send_from_directory(_dir(), nombre)
