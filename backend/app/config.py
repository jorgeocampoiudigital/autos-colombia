import os


class Config:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "4ut0sC0l0mb14")
    SQLALCHEMY_DATABASE_URI: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/parqueadero",
    )
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:4200").split(",")
    JWT_HORAS: int = int(os.getenv("JWT_HORAS", "8"))
    
    DIAS_VENCIMIENTO_COBRO: int = 14 
    VALOR_MENSUALIDAD_DEFECTO: int = 300000


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI: str = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/parqueadero_test",
    )
