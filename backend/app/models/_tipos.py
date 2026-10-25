from sqlalchemy.dialects.postgresql import ENUM


def _enum(name: str, *values: str) -> ENUM:
    return ENUM(*values, name=name, create_type=False)


TipoVehiculo = _enum("tipo_vehiculo", "CARRO", "MOTO")
RolOperador = _enum("rol_operador", "ADMIN", "OPERADOR")
TipoDocumento = _enum("tipo_documento", "CC", "CE", "NIT", "PAS")
MedioPago = _enum("medio_pago", "TRANSFERENCIA", "EFECTIVO", "TARJETA", "OTRO")
TipoNovedad = _enum("tipo_novedad", "OBSERVACION", "DANO", "OBJETO_OLVIDADO", "INCIDENTE", "OTRO")
EstadoNovedad = _enum("estado_novedad", "ABIERTA", "SEGUIMIENTO", "CERRADA")
