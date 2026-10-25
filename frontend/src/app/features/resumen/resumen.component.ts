import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResumenService } from '../../core/api/resumen.service';
import { Resumen } from '../../core/models';
import { cop, copSolo, descargarCsv, hora } from '../../core/formato';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { LeyendaCeldasComponent } from '../../shared/leyenda-celdas.component';
import { MapaCeldasComponent } from '../../shared/mapa-celdas.component';
import { BadgeComponent } from '../../shared/badge.component';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [RouterLink, IconComponent, MapaCeldasComponent, LeyendaCeldasComponent, BadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <div class="page-head">
        <div><h1>Resumen operativo</h1><p>Una mirada a tu parqueadero, en tiempo real.</p></div>
        <div class="acciones">
          <button type="button" class="btn btn-outline" (click)="exportar()" [disabled]="!d()"><app-icon name="download" />Exportar reporte</button>
          <a class="btn btn-primary" routerLink="/entradas-salidas"><app-icon name="plus" />Registrar entrada</a>
        </div>
      </div>

      @if (d(); as r) {
        <div class="kpis c4">
          <div class="card kpi-money">
            <div class="l">Ocupación física <app-icon name="pie" class="ok" /></div>
            <div class="v">{{ r.ocupacion_fisica.porcentaje.toString().replace('.', ',') }} %</div>
            <div class="s">{{ r.ocupacion_fisica.ocupadas }} de {{ r.ocupacion_fisica.total }} celdas ocupadas</div>
          </div>
          <div class="card kpi-money">
            <div class="l">Vehículos presentes <app-icon name="car" class="ok" /></div>
            <div class="v">{{ r.vehiculos_presentes }}</div>
            <div class="s">{{ r.entradas_hoy }} entradas · {{ r.salidas_hoy }} salidas hoy</div>
          </div>
          <div class="card kpi-money">
            <div class="l">Mensualidades activas <app-icon name="calendar" class="ok" /></div>
            <div class="v">{{ r.mensualidades.activas }}</div>
            <div class="s">{{ r.mensualidades.al_dia }} al día · {{ r.mensualidades.por_vencer }} por vencer · {{ r.mensualidades.en_mora }} en mora</div>
          </div>
          <div class="card kpi-money">
            <div class="l">Saldo pendiente · COP <app-icon name="wallet" class="amberic" /></div>
            <div class="v">{{ cop(r.saldo_pendiente) }}</div>
            <div class="s">{{ cop(r.saldo_mora) }} corresponden a mora</div>
          </div>
        </div>

        <div class="grid col-main-side" style="margin-bottom: 24px">
          <div class="card">
            <div class="card-head">
              <div><h2 class="card-title">Así está el parqueadero</h2><p class="card-sub">Ocupación y asignación son estados diferentes</p></div>
              <a class="link" routerLink="/celdas">Ver celdas <app-icon name="arrow" [size]="14" /></a>
            </div>
            <app-mapa-celdas [celdas]="r.celdas.celdas" [compacto]="true" (elegir)="irCelda()" />
            <app-leyenda-celdas [r]="r.celdas.resumen" />
          </div>

          <div class="stack">
            <div class="card">
              <div class="card-head" style="margin-bottom: 8px">
                <h2 class="card-title">Requieren atención</h2>
                <a class="link" routerLink="/pagos">Ver todo <app-icon name="arrow" [size]="14" /></a>
              </div>
              <a class="atn" routerLink="/pagos">
                <span class="ic warn"><app-icon name="coin" /></span>
                <span><b>{{ r.atencion.mora.cantidad }} mensualidades en mora</b><small>{{ cop(r.atencion.mora.saldo) }} pendientes de cobro</small></span>
                <app-icon name="right" [size]="16" />
              </a>
              <a class="atn" routerLink="/celdas">
                <span class="ic"><app-icon name="wrench" /></span>
                <span><b>{{ r.atencion.fuera_servicio.length }} celdas fuera de servicio</b><small>{{ r.atencion.fuera_servicio.join(' y ') || 'Sin celdas en mantenimiento' }} · mantenimiento</small></span>
                <app-icon name="right" [size]="16" />
              </a>
              <a class="atn" routerLink="/novedades">
                <span class="ic"><app-icon name="clipboard" /></span>
                <span><b>{{ r.atencion.novedades_abiertas }} novedades abiertas</b><small>{{ r.atencion.novedades_seguimiento }} pendiente de seguimiento</small></span>
                <app-icon name="right" [size]="16" />
              </a>
            </div>
            <div class="recaudo">
              <div class="top"><span>Recaudo de {{ mes }}</span><span class="pct">{{ r.recaudo.porcentaje }} % pagado</span></div>
              <div class="monto">{{ cop(r.recaudo.recaudado) }}</div>
              <div class="barra"><i [style.width.%]="r.recaudo.porcentaje"></i></div>
              <div class="pie">{{ r.recaudo.cobros_pagados }} de {{ r.recaudo.cobros }} cobros pagados · Valores en COP</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h2 class="card-title">Movimientos recientes</h2><p class="card-sub">Hoy</p></div>
            <a class="link" routerLink="/entradas-salidas">Ver historial <app-icon name="arrow" [size]="14" /></a>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Movimiento</th><th>Placa</th><th>Cliente</th><th>Celda</th><th>Hora</th><th>Registrado por</th></tr></thead>
              <tbody>
                @for (m of r.movimientos_recientes.items; track $index) {
                  <tr>
                    <td><app-badge [estado]="m.movimiento" /></td>
                    <td><span class="chip-placa">{{ m.placa }}</span></td>
                    <td>{{ m.cliente }}</td><td>{{ m.celda }}</td><td>{{ hora(m.fecha_hora) }}</td><td>{{ m.registrado_por }}</td>
                  </tr>
                } @empty { <tr><td colspan="6" class="empty">Aún no hay movimientos hoy</td></tr> }
              </tbody>
            </table>
          </div>
          <p class="note" style="margin-top: 14px">Últimos {{ r.movimientos_recientes.items.length }} de {{ r.movimientos_recientes.total_hoy }} movimientos de hoy</p>
        </div>
      } @else if (error()) {
        <div class="banner warn">No se pudo cargar el resumen. Verifica que el servidor esté disponible.</div>
      }
    </section>`,
  styles: [`
    .atn { display: grid; grid-template-columns: 40px 1fr 16px; gap: 12px; align-items: center; padding: 12px 0; color: var(--muted); border-bottom: 1px solid var(--line); }
    .atn:last-child { border-bottom: 0; }
    .atn:hover b { color: var(--brand); }
    .atn b { display: block; color: var(--ink); font-size: 13px; font-weight: 600; }
    .atn small { font-size: 11.5px; }
    .atn .ic { width: 38px; height: 38px; border-radius: 50%; background: #f0f2f1; display: grid; place-items: center; }
    .atn .ic.warn { background: var(--amber-bg); color: var(--amber); }
    .recaudo { background: var(--side); color: #fff; border-radius: 12px; padding: 20px; }
    .recaudo .top { display: flex; justify-content: space-between; font-size: 13px; color: #b9cbc4; }
    .recaudo .pct { color: #cdeea0; }
    .recaudo .monto { font-size: 34px; font-weight: 300; margin: 12px 0 14px; }
    .recaudo .barra { height: 4px; background: #2b4a43; border-radius: 2px; overflow: hidden; }
    .recaudo .barra i { display: block; height: 100%; background: #cdeea0; }
    .recaudo .pie { font-size: 11.5px; color: #b9cbc4; margin-top: 14px; }`],
})
export class ResumenComponent {
  private api = inject(ResumenService);
  private toast = inject(ToastService);
  readonly d = signal<Resumen | null>(null);
  readonly error = signal(false);
  readonly cop = cop;
  readonly mes = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'America/Bogota' }).format(new Date());
  readonly hora = hora;

  constructor() {
    this.api.obtener().subscribe({ next: r => this.d.set(r), error: e => { this.error.set(true); this.toast.error(e); } });
  }

  irCelda(): void { /* el plano del resumen es informativo; el detalle vive en Celdas */ }

  exportar(): void {
    const r = this.d();
    if (!r) return;
    descargarCsv('resumen-operativo.csv', ['Indicador', 'Valor'], [
      ['Ocupación física (%)', r.ocupacion_fisica.porcentaje], ['Celdas ocupadas', r.ocupacion_fisica.ocupadas],
      ['Celdas totales', r.ocupacion_fisica.total], ['Vehículos presentes', r.vehiculos_presentes],
      ['Entradas hoy', r.entradas_hoy], ['Salidas hoy', r.salidas_hoy],
      ['Mensualidades activas', r.mensualidades.activas], ['Mensualidades en mora', r.mensualidades.en_mora],
      ['Saldo pendiente COP', copSolo(r.saldo_pendiente)], ['Saldo en mora COP', copSolo(r.saldo_mora)],
      ['Recaudado COP', copSolo(r.recaudo.recaudado)], ['% recaudado', r.recaudo.porcentaje],
    ]);
  }
}
