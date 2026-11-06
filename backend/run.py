"""Punto de entrada: `python run.py` (desarrollo) o `flask --app run <comando>`."""
import os

from app import create_app
from app.config import config_por_entorno

app = create_app(config_por_entorno())

if __name__ == "__main__":
    # Por defecto solo escucha en esta máquina: el depurador de Flask no debe quedar expuesto en la red.
    app.run(host=os.getenv("FLASK_HOST", "127.0.0.1"), port=int(os.getenv("FLASK_PORT", "5000")))
