"""Fábrica de la aplicación Flask."""
from datetime import date, datetime
from decimal import Decimal

from flask import Flask
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS

from app.config import Config, DevelopmentConfig
from app.errors import register_error_handlers
from app.extensions import db


class JSONProvider(DefaultJSONProvider):
    """Decimal -> número (COP son enteros); fechas en ISO-8601 (no RFC 822)."""

    @staticmethod
    def default(o):  # type: ignore[override]
        if isinstance(o, Decimal):
            return int(o) if o == o.to_integral_value() else float(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return DefaultJSONProvider.default(o)


def create_app(config_class: type[Config] = DevelopmentConfig) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB por carga
    app.json = JSONProvider(app)
    app.json.ensure_ascii = False

    db.init_app(app)

    # CORS estricto: solo el origen de Angular
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        allow_headers=["Content-Type", "Authorization"],
    )

    from app.routes.archivo_routes import archivo_bp
    from app.routes.auth_routes import auth_bp
    from app.routes.celda_routes import celda_bp
    from app.routes.cliente_routes import cliente_bp
    from app.routes.movimiento_routes import movimiento_bp
    from app.routes.novedad_routes import novedad_bp
    from app.routes.pago_routes import pago_bp
    from app.routes.resumen_routes import resumen_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(resumen_bp, url_prefix="/api/resumen")
    app.register_blueprint(movimiento_bp, url_prefix="/api/movimientos")
    app.register_blueprint(cliente_bp, url_prefix="/api")
    app.register_blueprint(celda_bp, url_prefix="/api/celdas")
    app.register_blueprint(pago_bp, url_prefix="/api")
    app.register_blueprint(novedad_bp, url_prefix="/api/novedades")
    app.register_blueprint(archivo_bp, url_prefix="/api/archivos")

    register_error_handlers(app)

    from app.cli import register_cli
    register_cli(app)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    return app
