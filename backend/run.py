"""Punto de entrada: `python run.py` (desarrollo) o `flask --app run <comando>`."""
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
