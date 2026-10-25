from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (BigInteger, Computed, Date, DateTime, ForeignKey, Numeric, String,
                        Text, func)
from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db
from app.models._tipos import EstadoNovedad, MedioPago, TipoNovedad, TipoVehiculo


class Sede(db.Model):
    __tablename__ = "sede"
    id_sede: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)
    ciudad: Mapped[str] = mapped_column(String(100))


class Celda(db.Model):
    __tablename__ = "celda"
    id_celda: Mapped[int] = mapped_column(primary_key=True)
    id_sede: Mapped[int] = mapped_column(ForeignKey("sede.id_sede"))
    codigo: Mapped[str] = mapped_column(String(10))
    fila: Mapped[str] = mapped_column(String(1))
    tipo: Mapped[str] = mapped_column(TipoVehiculo)


class MantenimientoCelda(db.Model):
    __tablename__ = "mantenimiento_celda"
    id_mantenimiento: Mapped[int] = mapped_column(primary_key=True)
    id_celda: Mapped[int] = mapped_column(ForeignKey("celda.id_celda"))
    motivo: Mapped[str] = mapped_column(String(200))
    fecha_inicio: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    fecha_fin: Mapped[date | None] = mapped_column(Date)


class Mensualidad(db.Model):
    __tablename__ = "mensualidad"
    id_mensualidad: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(
        String(12), Computed("'MEN-' || lpad(id_mensualidad::text, 3, '0')", persisted=True))
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id_usuario"))
    placa: Mapped[str] = mapped_column(ForeignKey("vehiculo.placa"))
    id_celda: Mapped[int] = mapped_column(ForeignKey("celda.id_celda"))
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    valor_mensual: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    cancelada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Cobro(db.Model):
    __tablename__ = "cobro"
    id_cobro: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(
        String(12), Computed("'COB-' || lpad(id_cobro::text, 3, '0')", persisted=True))
    id_mensualidad: Mapped[int] = mapped_column(ForeignKey("mensualidad.id_mensualidad"))
    periodo_inicio: Mapped[date] = mapped_column(Date)
    periodo_fin: Mapped[date] = mapped_column(Date)
    fecha_vencimiento: Mapped[date] = mapped_column(Date)
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Pago(db.Model):
    __tablename__ = "pago"
    id_pago: Mapped[int] = mapped_column(primary_key=True)
    numero_recibo: Mapped[str] = mapped_column(
        String(12), Computed("'REC-' || lpad(id_pago::text, 3, '0')", persisted=True))
    id_cobro: Mapped[int] = mapped_column(ForeignKey("cobro.id_cobro"))
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    fecha_pago: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    medio: Mapped[str] = mapped_column(MedioPago)
    referencia: Mapped[str | None] = mapped_column(String(60))
    soporte_url: Mapped[str | None] = mapped_column(String(500))
    id_operador: Mapped[int] = mapped_column(ForeignKey("operador.id_operador"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Movimiento(db.Model):
    __tablename__ = "movimiento"
    id_movimiento: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    placa: Mapped[str] = mapped_column(ForeignKey("vehiculo.placa"))
    id_celda: Mapped[int] = mapped_column(ForeignKey("celda.id_celda"))
    id_operador_entrada: Mapped[int] = mapped_column(ForeignKey("operador.id_operador"))
    id_operador_salida: Mapped[int | None] = mapped_column(ForeignKey("operador.id_operador"))
    fecha_entrada: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    fecha_salida: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observacion: Mapped[str | None] = mapped_column(String(200))


class Novedad(db.Model):
    __tablename__ = "novedad"
    id_novedad: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(
        String(12), Computed("'NOV-' || lpad(id_novedad::text, 3, '0')", persisted=True))
    placa: Mapped[str] = mapped_column(ForeignKey("vehiculo.placa"))
    id_movimiento: Mapped[int | None] = mapped_column(ForeignKey("movimiento.id_movimiento"))
    tipo: Mapped[str] = mapped_column(TipoNovedad, default="OBSERVACION")
    titulo: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(EstadoNovedad, default="ABIERTA")
    id_operador: Mapped[int] = mapped_column(ForeignKey("operador.id_operador"))
    fecha_hora: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    fecha_cierre: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NovedadEvidencia(db.Model):
    __tablename__ = "novedad_evidencia"
    id_evidencia: Mapped[int] = mapped_column(primary_key=True)
    id_novedad: Mapped[int] = mapped_column(ForeignKey("novedad.id_novedad"))
    nombre: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str | None] = mapped_column(String(100))


class NovedadHistorial(db.Model):
    __tablename__ = "novedad_historial"
    id_historial: Mapped[int] = mapped_column(primary_key=True)
    id_novedad: Mapped[int] = mapped_column(ForeignKey("novedad.id_novedad"))
    estado: Mapped[str] = mapped_column(EstadoNovedad)
    comentario: Mapped[str | None] = mapped_column(String(300))
    id_operador: Mapped[int] = mapped_column(ForeignKey("operador.id_operador"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
