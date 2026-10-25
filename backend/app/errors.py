from flask import Flask, jsonify
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError, DBAPIError
from werkzeug.exceptions import HTTPException

from app.extensions import db


class AppError(Exception):
    """Error de negocio controlado."""

    def __init__(self, message: str, status: int = 400, details: object | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.details = details


class NotFound(AppError):
    def __init__(self, message: str = "Recurso no encontrado") -> None:
        super().__init__(message, 404)


class Conflict(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, 409)


class Unauthorized(AppError):
    def __init__(self, message: str = "No autenticado") -> None:
        super().__init__(message, 401)


class Forbidden(AppError):
    def __init__(self, message: str = "No tienes permisos para esta acción") -> None:
        super().__init__(message, 403)


def _resp(message: str, status: int, details: object | None = None):
    body: dict = {"error": message, "status": status}
    if details is not None:
        body["details"] = details
    return jsonify(body), status


_CONSTRAINTS: dict[str, str] = {
    "ux_movimiento_placa_abierta": "La placa ya se encuentra dentro del parqueadero",
    "ux_movimiento_celda_abierta": "La celda ya está ocupada por otro vehículo",
    "ex_mensualidad_celda": "La celda ya está asignada a otra mensualidad en ese periodo",
    "ex_mensualidad_placa": "El vehículo ya tiene una mensualidad en ese periodo",
    "usuario_documento_key": "Ya existe un cliente con ese documento",
    "vehiculo_pkey": "Ya existe un vehículo con esa placa",
    "ux_mantenimiento_activo": "La celda ya está fuera de servicio",
    "cobro_id_mensualidad_periodo_inicio_key": "Ya existe un cobro para ese periodo",
}


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(AppError)
    def _app_error(e: AppError):
        return _resp(e.message, e.status, e.details)

    @app.errorhandler(ValidationError)
    def _validation(e: ValidationError):
        detalles = [
            {"campo": ".".join(str(p) for p in err["loc"]), "mensaje": err["msg"]}
            for err in e.errors(include_url=False, include_context=False, include_input=False)
        ]
        return _resp("Datos inválidos", 422, detalles)

    @app.errorhandler(IntegrityError)
    def _integrity(e: IntegrityError):
        db.session.rollback()
        diag = getattr(e.orig, "diag", None)
        nombre = getattr(diag, "constraint_name", None)
        if nombre in _CONSTRAINTS:
            return _resp(_CONSTRAINTS[nombre], 409)
        return _resp("La operación viola una regla de integridad de los datos", 409)

    @app.errorhandler(DBAPIError)
    def _dbapi(e: DBAPIError):
        db.session.rollback()
        
        primary = getattr(getattr(e.orig, "diag", None), "message_primary", None)
        if primary:
            return _resp(primary, 409)
        app.logger.exception("Error de base de datos")
        return _resp("Error de base de datos", 500)

    @app.errorhandler(HTTPException)
    def _http(e: HTTPException):
        return _resp(e.description or e.name, e.code or 500)

    @app.errorhandler(Exception)
    def _unhandled(e: Exception):
        app.logger.exception("Error no controlado")
        return _resp("Error interno del servidor", 500)
