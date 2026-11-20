# Iteración 3 · Gestión de pagos

Artefactos de diseño de la Iteración 3. El `.svg` de cada diagrama es la fuente editable; el `.png`, la versión para el documento.

## Diagramas
| Archivo | Contenido |
|---|---|
| `diagramas/casos_uso` | Casos de uso de la gestión de pagos (Operador, Administrador; «include»/«extend») |
| `diagramas/secuencia_1` | Secuencia: inicio de sesión, Iteración 1 (entradas/salidas) e Iteración 2 (usuarios y celdas) |
| `diagramas/secuencia_2` | Secuencia: Iteración 3 (mensualidad → cobro → pago → comprobante → indicadores) |
| `diagramas/componentes` | Componentes del frontend Angular y del backend Flask, coloreados por iteración |

## Mockups
| Archivo | Historias |
|---|---|
| `mockups/mock_cobros_pago.png` | HU-P01 cobros pendientes · HU-P02 registrar pago · HU-P03 soporte · HU-P06 indicadores |
| `mockups/mock_error_saldo.png` | HU-P02 validación: valor mayor que el saldo |
| `mockups/mock_comprobante.png` | HU-P04 comprobante de pago (REC-xxx) |
| `mockups/mock_historial.png` | HU-P05 historial de pagos y exportación CSV |
| `mockups/mock_mensualidad.png` | HU-P07 nueva mensualidad con generación del cobro |

## Pruebas
Los casos `CP-P01` a `CP-P14` del plan de pruebas están automatizados en `backend/tests/test_iteracion3_pagos.py`:

```powershell
cd backend ; pytest -q tests/test_iteracion3_pagos.py   # 14 pruebas
```
