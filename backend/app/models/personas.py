from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models._tipos import RolOperador, TipoDocumento, TipoVehiculo


class Usuario(db.Model):
    """Cliente del parqueadero."""
    __tablename__ = "usuario"

    id_usuario: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    tipo_documento: Mapped[str] = mapped_column(TipoDocumento, default="CC")
    documento: Mapped[str] = mapped_column(String(20), unique=True)
    telefono: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(120))
    direccion: Mapped[str | None] = mapped_column(String(200))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    vehiculos: Mapped[list[Vehiculo]] = relationship(back_populates="usuario")


class Vehiculo(db.Model):
    __tablename__ = "vehiculo"

    placa: Mapped[str] = mapped_column(String(10), primary_key=True)
    tipo: Mapped[str] = mapped_column(TipoVehiculo)
    marca: Mapped[str | None] = mapped_column(String(50))
    linea: Mapped[str | None] = mapped_column(String(50))
    color: Mapped[str | None] = mapped_column(String(30))
    anio_modelo: Mapped[int | None] = mapped_column(SmallInteger)
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id_usuario"))

    usuario: Mapped[Usuario] = relationship(back_populates="vehiculos")


class Operador(db.Model):
    __tablename__ = "operador"

    id_operador: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    usuario: Mapped[str] = mapped_column(String(30), unique=True)
    clave_hash: Mapped[str] = mapped_column(String(255))
    rol: Mapped[str] = mapped_column(RolOperador)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
