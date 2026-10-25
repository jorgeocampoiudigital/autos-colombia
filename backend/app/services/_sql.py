"""Helpers de lectura SQL (consultas sobre vistas)."""
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.extensions import db

TZ = ZoneInfo("America/Bogota")


def filas(sql: str, **params: Any) -> list[dict[str, Any]]:
    return [dict(r) for r in db.session.execute(text(sql), params).mappings().all()]


def fila(sql: str, **params: Any) -> dict[str, Any] | None:
    r = db.session.execute(text(sql), params).mappings().first()
    return dict(r) if r else None


def escalar(sql: str, **params: Any) -> Any:
    return db.session.execute(text(sql), params).scalar()


def hoy() -> date:
    return datetime.now(TZ).date()


def rango_dia(dia: date | None = None) -> tuple[datetime, datetime]:
    d = dia or hoy()
    ini = datetime.combine(d, time.min, tzinfo=TZ)
    return ini, ini + timedelta(days=1)


def pagina(page: int, per_page: int) -> tuple[int, int, int]:
    page = max(page, 1)
    per_page = min(max(per_page, 1), 100)
    return page, per_page, (page - 1) * per_page


def like(q: str | None) -> str | None:
    return f"%{q.strip()}%" if q and q.strip() else None
