"""Comandos: flask --app run init-db [--reset] | seed"""
from pathlib import Path

import click
from flask import Flask
from sqlalchemy import text

from app.extensions import db

SCHEMA = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def register_cli(app: Flask) -> None:
    @app.cli.command("init-db")
    @click.option("--reset", is_flag=True, help="Borra TODO el esquema public antes de crearlo")
    def init_db(reset: bool) -> None:
        if reset:
            db.session.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
            db.session.commit()
        
        db.session.connection().connection.cursor().execute(SCHEMA.read_text(encoding="utf-8"))
        db.session.commit()
        click.echo("Esquema creado.")

    @app.cli.command("seed")
    def seed_cmd() -> None:
        from app.seed import CLAVES, sembrar
        sembrar()
        click.echo("Datos de muestra cargados. Usuarios: " + ", ".join(f"{u} / {c}" for u, c in CLAVES.items()))
