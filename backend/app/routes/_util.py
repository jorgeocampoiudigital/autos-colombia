from typing import TypeVar

from flask import request
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


def cuerpo(modelo: type[T]) -> T:
    """Valida el JSON de entrada con Pydantic (errores -> 422 vía manejador global)."""
    return modelo.model_validate(request.get_json(silent=True) or {})


def pag() -> tuple[int, int]:
    return request.args.get("page", 1, type=int), request.args.get("per_page", 10, type=int)
