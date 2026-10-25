# Autos Colombia · Gestión de parqueadero

Aplicación web para un parqueadero por mensualidad: entradas/salidas, clientes y vehículos, celdas, cobros/pagos y novedades.

```
backend/db/schema.sql   Esquema PostgreSQL (fuente de verdad de las reglas de integridad)
backend/           Flask + SQLAlchemy + Pydantic (blueprints → servicios → BD)
frontend/          Angular 18 standalone · signals · control flow @if/@for · rutas lazy
```

## Puesta en marcha

### 1. Base de datos
```bash
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
createdb -U postgres parqueadero
cd backend ; pip install -r requirements.txt
cp .env.example .env                    # ajusta DATABASE_URL
Get-Content .env | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { $name, $value = $_ -split '=', 2; if ($name) { [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process") } }
python -m flask --app app init-db
python -m flask --app run seed          # datos de muestra
python run.py                           # http://localhost:5000
```
Usuarios de muestra: `jperez / Admin123*` (ADMIN) · `projas / Operador123*` (OPERADOR).

### 2. Frontend
```bash
cd frontend ; npm install ; npm start   # http://localhost:4200
```
La URL de la API está en `src/environments/environment.ts`. CORS solo permite `http://localhost:4200` (`CORS_ORIGINS`).

### 3. Pruebas
```bash
createdb -U postgres parqueadero_test
TEST_DATABASE_URL=postgresql+psycopg://postgres@localhost/parqueadero_test pytest -q
```

## Reglas de negocio y dónde se imponen
| Requisito | Dónde |
|---|---|
| Una placa no entra dos veces / no sale sin entrar | índice único parcial `ux_movimiento_placa_abierta` + validación en servicio |
| Una celda no aloja dos vehículos | índice único parcial `ux_movimiento_celda_abierta` |
| Mensualidad vigente para entrar | `movimiento_service.registrar_entrada` (la mora **no** bloquea) |
| Celda automática o manual | asignada a la mensualidad → primera `DISPONIBLE` del tipo; manual validada (tipo, estado, asignación) |
| Login, hash y roles | JWT + bcrypt; `ADMIN` gestiona celdas y asigna mensualidades |
| Placa normalizada, sin borrar movimientos | `CHECK` en `vehiculo`, triggers `bloquear_borrado` / `validar_movimiento` |
| Mensualidades sin solapes | `EXCLUDE USING gist` por celda y por placa |
| Pago ≤ saldo, sin pagos concurrentes de más | `SELECT … FOR UPDATE` sobre el cobro |

El estado de una celda (Ocupada / Vacía asignada / Disponible / Fuera de servicio), la vigencia de una mensualidad y la mora de un cobro **se calculan** (vistas `v_celda_estado`, `v_cobro_saldo`, `v_mensualidad_estado`); no se guardan.

## API (prefijo `/api`, Bearer JWT salvo login)
`POST auth/login` · `GET auth/me` · `GET resumen` ·
`GET movimientos/placa/<placa>` · `POST movimientos/entrada|salida` · `GET movimientos/presentes|historial|kpis` ·
`GET/POST clientes` · `GET/PATCH clientes/<id>` · `GET/POST vehiculos` · `GET/POST mensualidades` (POST: ADMIN) ·
`GET celdas` · `GET celdas/<id>` · `POST celdas/<id>/mantenimiento|habilitar` (ADMIN) ·
`GET cobros` · `GET pagos` · `GET pagos/kpis` · `POST pagos` ·
`GET/POST novedades` · `GET novedades/<id>` · `PATCH novedades/<id>/estado` · `POST archivos`

Errores: siempre `{ "error": "mensaje", "status": 409 }` (más `details` en validaciones 422).