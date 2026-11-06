"""Contratos de entrada (Pydantic v2). Se validan en el borde de cada ruta."""
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, StringConstraints,
                      ValidationInfo, field_validator)

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
# Formato de placas particulares en Colombia según el tipo de vehículo.
FORMATO_PLACA: dict[str, tuple[re.Pattern[str], str]] = {
    "CARRO": (re.compile(r"^[A-Z]{3}[0-9]{3}$"), "3 letras y 3 números (ej. ABC123)"),
    "MOTO": (re.compile(r"^[A-Z]{3}[0-9]{2}[A-Z]?$"), "3 letras, 2 números y opcionalmente 1 letra (ej. ABC12D)"),
}
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
    tipo: TipoVehiculo = "CARRO"            # antes que placa: el validador de placa lo necesita
    placa: Placa
    marca: str | None = Field(default=None, max_length=50)
    linea: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=30)
    anio_modelo: int | None = Field(default=None, ge=1950, le=2100)

    @field_validator("placa")
    @classmethod
    def placa_segun_tipo(cls, placa: str, info: ValidationInfo) -> str:
        tipo = info.data.get("tipo")
        if tipo in FORMATO_PLACA:
            patron, ayuda = FORMATO_PLACA[tipo]
            if not patron.match(placa):
                raise ValueError(f"Placa inválida para {tipo.lower()}: debe tener {ayuda}")
        return placa


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
