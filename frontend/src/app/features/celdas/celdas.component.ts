import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { CeldasService } from '../../core/api/celdas.service';
import { AuthService } from '../../core/auth.service';
import { cop, fecha, fechaCorta, hora } from '../../core/formato';
import { CeldaDetalle, CeldaResumen, CeldasResp, EstadoCelda } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { BadgeComponent } from '../../shared/badge.component';
import { DialogComponent } from '../../shared/dialog.component';
import { IconComponent } from '../../shared/icon.component';
import { LeyendaCeldasComponent } from '../../shared/leyenda-celdas.component';
import { MapaCeldasComponent } from '../../shared/mapa-celdas.component';
import { MensualidadDialogComponent } from '../../shared/mensualidad-dialog.component';

const ESTADO_TXT: Record<EstadoCelda, string> = {
  OCUPADA: 'Ocupada', VACIA_ASIGNADA: 'Vacía, asignada', DISPONIBLE: 'Disponible', FUERA_SERVICIO: 'Fuera de servicio',
};

@Component({
  selector: 'app-celdas',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, BadgeComponent, MapaCeldasComponent, LeyendaCeldasComponent, DialogComponent, MensualidadDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <div class="page-head">
        <div><h1>Celdas</h1><p>Distingue la presencia física de la asignación de cada espacio.</p></div>
        <div class="acciones">
          @if (auth.esAdmin()) {
            <button type="button" class="btn btn-outline" [class.activo]="gestion()" (click)="gestion.set(!gestion())"><app-icon name="sliders" />Gestionar celdas</button>
            <button type="button" class="btn btn-primary" (click)="asignar.set(true)"><app-icon name="plus" />Asignar mensualidad</button>
          }
        </div>
      </div>

      @if (d(); as r) {
        <div class="kpis c4">
          <div class="card kpi"><span class="big">{{ r.resumen.OCUPADA }}</span><div><div class="t">Ocupadas</div><div class="s">Vehículo presente</div></div></div>
          <div class="card kpi"><span class="big blue">{{ r.resumen.VACIA_ASIGNADA }}</span><div><div class="t">Vacías, asignadas</div><div class="s">Con mensualidad relacionada</div></div></div>
          <div class="card kpi"><span class="big">{{ r.resumen.DISPONIBLE }}</span><div><div class="t">Disponibles</div><div class="s">Vacías y sin asignación</div></div></div>
          <div class="card kpi"><span class="big gray">{{ r.resumen.FUERA_SERVICIO }}</span><div><div class="t">Fuera de servicio</div><div class="s">No habilitadas para operación</div></div></div>
        </div>

        <div class="grid col-main-side">
          <div class="card">
            <div class="card-head">
              <div><h2 class="card-title">Distribución de celdas</h2><p class="card-sub">Sede principal · {{ r.total }} celdas</p></div>
              <button type="button" class="link" (click)="vista.set(vista() === 'mapa' ? 'lista' : 'mapa')">
                {{ vista() === 'mapa' ? 'Vista de lista' : 'Vista de plano' }} <app-icon name="arrow" [size]="14" /></button>
            </div>
            <div class="toolbar">
              <div class="input-icon"><app-icon name="search" /><input [formControl]="q" placeholder="Buscar celda o placa"></div>
              <select [formControl]="estado"><option value="">Todos los estados</option>
                @for (e of estados; track e) { <option [value]="e">{{ txt[e] }}</option> }</select>
              <div class="zoom" role="group" aria-label="Zoom">
                <button type="button" (click)="zoomMenos()" aria-label="Reducir"><app-icon name="minus" [size]="14" /></button>
                <span>{{ (zoom() * 100).toFixed(0) }} %</span>
                <button type="button" (click)="zoomMas()" aria-label="Ampliar"><app-icon name="plus" [size]="14" /></button>
              </div>
            </div>

            @if (vista() === 'mapa') {
              <app-mapa-celdas [celdas]="r.celdas" [seleccionada]="sel()" [coincidentes]="coincidentes()" [zoom]="zoom()" (elegir)="elegir($event)" />
            } @else {
              <div class="tbl-wrap"><table class="tbl">
                <thead><tr><th>Celda</th><th>Estado</th><th>Vehículo presente</th><th>Mensualidad</th><th>Cliente</th></tr></thead>
                <tbody>
                  @for (c of filtradas(); track c.id_celda) {
                    <tr class="click" [class.sel]="c.id_celda === sel()" (click)="elegir(c)">
                      <td class="name">{{ c.codigo }}</td><td>{{ txt[c.estado] }}</td>
                      <td>{{ c.placa_presente ?? '—' }}</td><td>{{ c.mensualidad ?? '—' }}</td><td>{{ c.cliente ?? '—' }}</td>
                    </tr>
                  } @empty { <tr><td colspan="5" class="empty">Ninguna celda coincide con el filtro</td></tr> }
                </tbody></table></div>
            }
            <app-leyenda-celdas [r]="r.resumen" />
            <div class="banner" style="margin-top: 16px"><app-icon name="info" />Vacía no significa disponible: {{ r.resumen.VACIA_ASIGNADA }} celdas sin vehículo conservan una asignación mensual. Consulta ambos estados antes de registrar un movimiento.</div>
          </div>

          <div class="stack">
            @if (det(); as c) {
              <div class="card">
                <div class="card-head"><h2 class="card-title">Detalle de celda</h2>
                  @if (gestion() && auth.esAdmin()) { <span class="badge info">Modo gestión</span> }</div>
                <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 18px">
                  <span [class]="'codigo e-' + c.estado">{{ c.codigo }}</span>
                  <div><div style="font-size: 18px">Celda {{ c.codigo }}</div><div class="muted" style="font-size: 12px; margin-top: 4px">Fila {{ c.fila }} · {{ c.tipo === 'CARRO' ? 'Automóvil' : 'Motocicleta' }}</div></div>
                </div>
                <div class="stat-pair">
                  <div><div class="l">Ocupación física</div><span [class]="'badge ' + (c.ocupacion_fisica === 'OCUPADA' ? 'ok' : 'muted')"><i class="dot"></i>{{ c.ocupacion_fisica === 'OCUPADA' ? 'Ocupada' : 'Vacía' }}</span></div>
                  <div><div class="l">Asignación mensual</div><span [class]="'badge ' + (c.asignacion_mensual === 'ASIGNADA' ? 'info' : 'muted')"><i class="dot"></i>{{ c.asignacion_mensual === 'ASIGNADA' ? 'Asignada' : 'Sin asignación' }}</span></div>
                </div>
                <hr class="sep">
                @if (c.mensualidad_relacionada; as m) {
                  <div class="section-label" style="margin-top: 0">MENSUALIDAD RELACIONADA</div>
                  <div style="font-size: 17px; font-weight: 600; margin-bottom: 12px">{{ m.cliente }}</div>
                  <div style="display: flex; justify-content: space-between; align-items: center">
                    <span class="chip-placa">{{ m.placa }}</span>
                    <app-badge [estado]="m.estado_pago" [etiqueta]="m.estado_pago === 'AL_DIA' ? 'Mensualidad al día' : null" />
                  </div>
                  <p class="muted" style="margin: 14px 0; font-size: 12.5px">{{ m.codigo }} · {{ fecha(m.fecha_inicio) }} – {{ fecha(m.fecha_fin) }}</p>
                } @else if (c.estado === 'FUERA_SERVICIO' && c.mantenimiento) {
                  <div class="section-label" style="margin-top: 0">MANTENIMIENTO</div>
                  <p style="font-weight: 600">{{ c.mantenimiento.motivo }}</p><p class="muted" style="font-size: 12px; margin-top: 4px">Desde el {{ fechaCorta(c.mantenimiento.fecha_inicio) }}</p>
                } @else { <p class="muted">Esta celda no tiene una mensualidad vigente asignada.</p> }
                @if (c.ultimo_movimiento; as u) {
                  <div class="ultimo"><div class="muted" style="font-size: 11.5px">Último movimiento</div>
                    <div style="margin-top: 6px">{{ u.movimiento === 'ENTRADA' ? 'Entrada' : 'Salida' }} · {{ fecha(u.fecha_hora) }}, {{ hora(u.fecha_hora) }}</div></div>
                }
                @if (c.mensualidad_relacionada; as m) {
                  <a class="btn btn-outline" style="margin-top: 18px" routerLink="/pagos" [queryParams]="{ q: m.placa }"><app-icon name="out" [size]="16" />Ver mensualidad</a>
                }
                @if (gestion() && auth.esAdmin()) {
                  <hr class="sep">
                  @if (c.estado === 'FUERA_SERVICIO') {
                    <button type="button" class="btn btn-primary" (click)="habilitar(c)"><app-icon name="check" />Habilitar celda</button>
                  } @else {
                    <button type="button" class="btn btn-outline" [disabled]="c.estado === 'OCUPADA'" (click)="mantenimiento.set(c)"><app-icon name="wrench" />Poner fuera de servicio</button>
                    @if (c.estado === 'OCUPADA') { <p class="note">No se puede deshabilitar con un vehículo dentro.</p> }
                  }
                }
              </div>
            }
            <div class="card">
              <h2 class="card-title">Fuera de servicio</h2>
              <p class="card-sub" style="margin-bottom: 14px">{{ r.fuera_servicio.length }} celdas con mantenimiento activo</p>
              @for (f of r.fuera_servicio; track f.id_celda) {
                <div class="fs"><span class="cajita">{{ f.codigo }}</span><div><b>{{ f.motivo }}</b><div class="muted" style="font-size: 11.5px; margin-top: 3px">Desde el {{ fechaCorta(f.fecha_inicio) }}</div></div></div>
              } @empty { <p class="muted">No hay celdas en mantenimiento.</p> }
            </div>
          </div>
        </div>
      }
    </section>

    @if (asignar()) { <app-mensualidad-dialog (cerrar)="asignar.set(false)" (creada)="cargar()" /> }
    @if (mantenimiento(); as c) {
      <app-dialog [titulo]="'Poner ' + c.codigo + ' fuera de servicio'" (cerrar)="mantenimiento.set(null)">
        <div class="field"><label for="mot">Motivo del mantenimiento</label><input id="mot" [formControl]="motivo" placeholder="Ej. Demarcación del piso"></div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-outline" (click)="mantenimiento.set(null)">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="motivo.invalid" (click)="confirmarMantenimiento(c)">Confirmar</button>
        </div>
      </app-dialog>
    }`,
  styles: [`
    .btn.activo { background: var(--brand-50); border-color: var(--brand); }
    .zoom { display: flex; align-items: center; border: 1px solid var(--line-strong); border-radius: 8px; height: 42px; overflow: hidden; background: #fff; }
    .zoom button { background: none; border: 0; width: 36px; height: 100%; cursor: pointer; color: var(--muted); display: grid; place-items: center; }
    .zoom span { font-size: 12.5px; min-width: 48px; text-align: center; }
    .codigo { width: 58px; height: 58px; border-radius: 8px; display: grid; place-items: center; font-size: 20px; font-weight: 300; border: 1px solid var(--line); }
    .codigo.e-OCUPADA { background: var(--cell-occ-bg); border-color: var(--cell-occ-line); color: var(--brand); }
    .codigo.e-VACIA_ASIGNADA { background: var(--blue-bg); border-color: var(--blue-line); color: var(--blue); }
    .codigo.e-DISPONIBLE { color: var(--brand); }
    .codigo.e-FUERA_SERVICIO { background: #e9ecea; color: #8b9a94; }
    .ultimo { background: #f6f8f7; border-radius: 8px; padding: 12px 14px; }
    .fs { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
    .cajita { width: 38px; height: 38px; border-radius: 8px; background: #eef1ef; display: grid; place-items: center; font-weight: 600; font-size: 12px; }`],
})
export class CeldasComponent {
  private api = inject(CeldasService);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly d = signal<CeldasResp | null>(null);
  readonly det = signal<CeldaDetalle | null>(null);
  readonly sel = signal<number | null>(null);
  readonly vista = signal<'mapa' | 'lista'>('mapa');
  readonly gestion = signal(false);
  readonly asignar = signal(false);
  readonly mantenimiento = signal<CeldaDetalle | null>(null);
  readonly zoom = signal(1);
  readonly q = new FormControl('', { nonNullable: true });
  readonly estado = new FormControl<'' | EstadoCelda>('', { nonNullable: true });
  readonly motivo = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] });

  readonly estados: EstadoCelda[] = ['OCUPADA', 'VACIA_ASIGNADA', 'DISPONIBLE', 'FUERA_SERVICIO'];
  readonly txt = ESTADO_TXT;
  readonly fecha = fecha; readonly fechaCorta = fechaCorta; readonly hora = hora; readonly cop = cop;

  private qSig = toSignal(this.q.valueChanges.pipe(debounceTime(200)), { initialValue: '' });
  private estadoSig = toSignal(this.estado.valueChanges, { initialValue: '' as '' | EstadoCelda });

  readonly filtradas = computed<CeldaResumen[]>(() => {
    const q = this.qSig().trim().toLowerCase(), e = this.estadoSig();
    return (this.d()?.celdas ?? []).filter(c =>
      (!e || c.estado === e) &&
      (!q || [c.codigo, c.placa_presente, c.placa_asignada, c.cliente].some(x => x?.toLowerCase().includes(q))));
  });
  /** null = sin filtros activos (no se atenúa nada) */
  readonly coincidentes = computed(() =>
    this.qSig().trim() || this.estadoSig() ? new Set(this.filtradas().map(c => c.id_celda)) : null);

  constructor() { this.cargar(true); }

  cargar(primera = false): void {
    this.api.listar().subscribe(r => {
      this.d.set(r);
      const id = this.sel() ?? (primera ? (r.celdas.find(c => c.estado === 'VACIA_ASIGNADA') ?? r.celdas[0])?.id_celda : null);
      if (id) this.seleccionar(id);
    });
  }

  elegir(c: CeldaResumen): void { this.seleccionar(c.id_celda); }
  private seleccionar(id: number): void { this.sel.set(id); this.api.detalle(id).subscribe(x => this.det.set(x)); }

  zoomMas(): void { this.zoom.update(z => Math.min(1.4, +(z + 0.1).toFixed(1))); }
  zoomMenos(): void { this.zoom.update(z => Math.max(0.7, +(z - 0.1).toFixed(1))); }

  confirmarMantenimiento(c: CeldaDetalle): void {
    this.api.mantenimiento(c.id_celda, this.motivo.value.trim()).subscribe({
      next: () => { this.toast.ok(`${c.codigo} quedó fuera de servicio`); this.mantenimiento.set(null); this.motivo.reset(); this.cargar(); },
      error: e => this.toast.error(e),
    });
  }

  habilitar(c: CeldaDetalle): void {
    this.api.habilitar(c.id_celda).subscribe({
      next: () => { this.toast.ok(`${c.codigo} habilitada`); this.cargar(); },
      error: e => this.toast.error(e),
    });
  }
}
