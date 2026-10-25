"""Contratos de entrada (Pydantic v2). Se validan en el borde de cada ruta."""
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, StringConstraints

TipoVehiculo = Literal["CARRO", "MOTO"]
TipoDocumento = Literal["CC", "CE", "NIT", "PAS"]
MedioPago = Literal["TRANSFERENCIA", "EFECTIVO", "TARJETA", "OTRO"]
TipoNovedad = Literal["OBSERVACION", "DANO", "OBJETO_OLVIDADO", "INCIDENTE", "OTRO"]
EstadoNovedad = Literal["ABIERTA", "SEGUIMIENTO", "CERRADA"]


def normalizar_placa(valor: object) -> str:
    """RNF5: mayúsculas y sin espacios ni guiones."""
    return re.sub(r"[\s\-]", "", str(valor or "")).upper()


Placa = Annotated[
    str,
    BeforeValidator(normalizar_placa),
    StringConstraints(pattern=r"^[A-Z0-9]{5,8}$"),
]
Texto = Annotated[str, StringConstraints(strip_whitespace=True)]


class Base(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginIn(Base):
    usuario: str = Field(min_length=1, max_length=30)
    clave: str = Field(min_length=1, max_length=100)


class EntradaIn(Base):
    placa: Placa
    id_celda: int | None = None
    observacion: str | None = Field(default=None, max_length=200)


class SalidaIn(Base):
    placa: Placa
    observacion: str | None = Field(default=None, max_length=200)


class VehiculoIn(Base):
    placa: Placa
    tipo: TipoVehiculo = "CARRO"
    marca: str | None = Field(default=None, max_length=50)
    linea: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=30)
    anio_modelo: int | None = Field(default=None, ge=1950, le=2100)


class VehiculoCreateIn(VehiculoIn):
    id_usuario: int


class ClienteIn(Base):
    nombre: str = Field(min_length=2, max_length=100)
    tipo_documento: TipoDocumento = "CC"
    documento: str = Field(min_length=3, max_length=20, pattern=r"^[0-9A-Za-z.\-]+$")
    telefono: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    direccion: str | None = Field(default=None, max_length=200)
    vehiculos: list[VehiculoIn] = []


class ClienteUpdateIn(Base):
    nombre: str | None = Field(default=None, min_length=2, max_length=100)
    telefono: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    direccion: str | None = Field(default=None, max_length=200)
    activo: bool | None = None


class MensualidadIn(Base):
    id_usuario: int
    placa: Placa
    id_celda: int
    fecha_inicio: date
    fecha_fin: date | None = None          # por defecto: fin del mes de inicio
    valor_mensual: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)


class PagoIn(Base):
    id_cobro: int
    valor: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    fecha_pago: date | None = None
    medio: MedioPago
    referencia: str | None = Field(default=None, max_length=60)
    soporte_url: str | None = Field(default=None, max_length=500)


class EvidenciaIn(Base):
    nombre: str = Field(max_length=200)
    url: str = Field(max_length=500)
    mime_type: str | None = Field(default=None, max_length=100)


class NovedadIn(Base):
    placa: Placa
    tipo: TipoNovedad = "OBSERVACION"
    titulo: str | None = Field(default=None, max_length=120)
    descripcion: str = Field(min_length=5, max_length=2000)
    fecha_hora: datetime | None = None
    evidencias: list[EvidenciaIn] = []


class NovedadEstadoIn(Base):
    estado: EstadoNovedad
    comentario: str | None = Field(default=None, max_length=300)


class MantenimientoIn(Base):
    motivo: str = Field(min_length=3, max_length=200)
