# Autos Colombia · Gestión de parqueadero

Aplicación web para un parqueadero por mensualidad: entradas/salidas, clientes y vehículos, celdas, cobros/pagos y novedades.

```
backend/db/schema.sql      Esquema PostgreSQL (fuente de verdad de las reglas de integridad)
backend/db/migraciones/    Scripts para actualizar bases ya creadas sin perder datos
backend/                   Flask + SQLAlchemy + Pydantic (blueprints → servicios → BD)
frontend/                  Angular 18 standalone · signals · control flow @if/@for · rutas lazy
```

## Puesta en marcha

Los comandos están en PowerShell (Windows). Requisitos: Python 3.11+, Node.js 18.19+ o 20+ y PostgreSQL 14+.

### 1. Base de datos y backend
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
createdb -U postgres parqueadero
cd backend ; pip install -r requirements.txt
cp .env.example .env                    # ajusta DATABASE_URL y SECRET_KEY (ver abajo)
python -c "import secrets; print(secrets.token_urlsafe(48))"   # copia el resultado en SECRET_KEY
Get-Content .env | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { $name, $value = $_ -split '=', 2; if ($name) { [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process") } }
python -m flask --app run init-db       # --reset borra y recrea el esquema public
python -m flask --app run seed          # datos de muestra
python run.py                           # http://localhost:5000
```
Usuarios de muestra: `jperez / Admin123*` (ADMIN) · `projas / Operador123*` (OPERADOR). **Cámbialos fuera de desarrollo.**

### 2. Frontend
```powershell
cd frontend ; npm install ; npm start   # http://localhost:4200
```
La URL de la API está en `src/environments/environment.ts`. CORS solo permite `http://localhost:4200` (`CORS_ORIGINS`).

### 3. Pruebas
```powershell
createdb -U postgres parqueadero_test
$env:TEST_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/parqueadero_test"
cd backend ; pytest -q                  # 50 pruebas contra PostgreSQL real
```
Las pruebas borran y recrean el esquema de `parqueadero_test` en cada caso; no las apuntes a la base de desarrollo.

### Actualizar una base creada antes de la Iteración 2
Si ya tienes datos y no quieres ejecutar `init-db --reset`, aplica la migración (no borra datos y se puede ejecutar más de una vez):
```powershell
psql -h localhost -U postgres -d parqueadero -f db/migraciones/001_iteracion2_bloqueo_celdas.sql
```

## Configuración (`backend/.env`)
| Variable | Uso | Por defecto |
|---|---|---|
| `FLASK_ENV` | `production` activa `ProductionConfig` (sin modo debug); cualquier otro valor usa desarrollo | `development` |
| `SECRET_KEY` | Firma de los tokens JWT. **Obligatoria en producción**: mínimo 32 caracteres y distinta de la de ejemplo, o la app no arranca | clave solo para desarrollo |
| `DATABASE_URL` | Conexión a PostgreSQL | `postgresql+psycopg://postgres:postgres@localhost:5432/parqueadero` |
| `TEST_DATABASE_URL` | Base usada por `pytest` | `…/parqueadero_test` |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma | `http://localhost:4200` |
| `JWT_HORAS` | Duración de la sesión | `8` |
| `FLASK_HOST` / `FLASK_PORT` | Interfaz y puerto de `python run.py`. Por defecto solo escucha en esta máquina | `127.0.0.1` / `5000` |

Cada conexión a la base fija la zona horaria `America/Bogota`, de modo que `CURRENT_DATE` (vigencias, mora) coincide con la fecha de Colombia aunque el servidor PostgreSQL esté en UTC.

## Reglas de negocio y dónde se imponen
| Requisito | Dónde |
|---|---|
| Una placa no entra dos veces / no sale sin entrar | índice único parcial `ux_movimiento_placa_abierta` + validación en servicio |
| Una celda no aloja dos vehículos | índice único parcial `ux_movimiento_celda_abierta` |
| Mensualidad vigente para entrar | `movimiento_service.registrar_entrada` (la mora **no** bloquea) |
| Celda automática o manual | asignada a la mensualidad → primera `DISPONIBLE` del tipo; manual validada (tipo, estado, asignación) |
| Login, hash y roles | JWT + bcrypt; `ADMIN` gestiona celdas y asigna mensualidades |
| Rol y estado del operador vigentes | se leen de la BD en cada petición: desactivar o cambiar el rol aplica sin esperar a que venza el token |
| Placa normalizada y con formato por tipo | Pydantic: carro `AAA999`, moto `AAA99` / `AAA99A`; `CHECK` en `vehiculo` (mayúsculas, 5–8 caracteres) |
| Cliente inactivo | no ingresa ni recibe vehículos o mensualidades nuevas; sí puede registrar la salida |
| Celda ocupada no pasa a mantenimiento | `celda_service` + trigger `validar_mantenimiento`; `SELECT … FOR UPDATE` sobre la celda serializa mantenimiento y entradas |
| Celda fuera de servicio no se asigna | `mensualidad`: validación en servicio · `movimiento`: trigger `validar_movimiento` |
| Movimientos sin borrar ni alterar | triggers `bloquear_borrado` / `validar_movimiento` |
| Mensualidades sin solapes | `EXCLUDE USING gist` por celda y por placa |
| Pago ≤ saldo, sin pagos concurrentes de más | `SELECT … FOR UPDATE` sobre el cobro |

El estado de una celda (Ocupada / Vacía asignada / Disponible / Fuera de servicio), la vigencia de una mensualidad y la mora de un cobro **se calculan** (vistas `v_celda_estado`, `v_cobro_saldo`, `v_mensualidad_estado`); no se guardan.

## API (prefijo `/api`, Bearer JWT salvo login)
`POST auth/login` · `GET auth/me` · `GET resumen` ·
`GET movimientos/placa/<placa>` · `POST movimientos/entrada|salida` · `GET movimientos/presentes|historial|kpis` ·
`GET/POST clientes` · `GET/PATCH clientes/<id>` (incluye `activo`) · `GET/POST vehiculos` · `GET/POST mensualidades` (POST: ADMIN) ·
`GET celdas` · `GET celdas/<id>` · `POST celdas/<id>/mantenimiento|habilitar` (ADMIN) ·
`GET cobros` · `GET pagos` · `GET pagos/kpis` · `POST pagos` ·
`GET/POST novedades` · `GET novedades/<id>` · `PATCH novedades/<id>/estado` · `POST archivos`

Errores: siempre `{ "error": "mensaje", "status": 409 }` (más `details` en validaciones 422).
Códigos: `401` sin sesión o sesión inválida · `403` sin permiso · `404` no existe · `409` regla de negocio · `422` datos inválidos · `503` base de datos no disponible.

## Iteraciones
| Iteración | Alcance | Estado |
|---|---|---|
| 1 | Entrada y salida de vehículos | Entregada |
| 2 | Gestión de usuarios (clientes, vehículos, mensualidades, acceso por rol) y gestión de celdas | En curso · pendiente: administración de usuarios del sistema (alta, rol, activar/desactivar operadores) |
| 3 | Gestión de pagos (y novedades) | Ya implementada en el código; se documenta y prueba en la Iteración 3 |
