import os

# Clave solo para desarrollo y pruebas. En producción SECRET_KEY es obligatoria.
_CLAVE_DESARROLLO = "solo-desarrollo-autos-colombia-no-usar-en-produccion"
CLAVES_INSEGURAS = {"", "4ut0sC0l0mb14", _CLAVE_DESARROLLO, "cambia-esta-clave"}


class Config:
    SECRET_KEY: str = os.getenv("SECRET_KEY") or _CLAVE_DESARROLLO
    SQLALCHEMY_DATABASE_URI: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/parqueadero",
    )
    # Las vigencias usan CURRENT_DATE de PostgreSQL: se fija la zona de Colombia por conexión
    # para que coincida con la fecha que usa Python, sin depender de la configuración del servidor.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "connect_args": {"options": "-c timezone=America/Bogota"},
    }
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:4200").split(",")
    JWT_HORAS: int = int(os.getenv("JWT_HORAS", "8"))
    
    DIAS_VENCIMIENTO_COBRO: int = 14 
    VALOR_MENSUALIDAD_DEFECTO: int = 300000


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI: str = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/parqueadero_test",
    )


def config_por_entorno() -> type[Config]:
    """FLASK_ENV=production usa ProductionConfig; cualquier otro valor, desarrollo."""
    return ProductionConfig if os.getenv("FLASK_ENV") == "production" else DevelopmentConfig
