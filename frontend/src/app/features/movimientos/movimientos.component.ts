import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { CeldasService } from '../../core/api/celdas.service';
import { MovimientosService } from '../../core/api/movimientos.service';
import { AuthService } from '../../core/auth.service';
import { cop, descargarCsv, fecha, fechaHora, hora, normalizarPlaca } from '../../core/formato';
import {
  CeldaResumen, ConsultaPlaca, EventoHistorial, KpisHoy, Movimiento, Pagina,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { BadgeComponent } from '../../shared/badge.component';
import { IconComponent } from '../../shared/icon.component';
import { PagerComponent } from '../../shared/pager.component';

type Tab = 'entrada' | 'salida';
const TEXTO_PAGO: Record<string, string> = {
  AL_DIA: 'Mensualidad al día', POR_VENCER: 'Mensualidad por vencer', EN_MORA: 'Mensualidad en mora',
};

@Component({
  selector: 'app-movimientos',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent, BadgeComponent, PagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <div class="page-head">
        <div><h1>Entradas y salidas</h1><p>Registra cada movimiento y consulta quién está en el parqueadero.</p></div>
        <div class="acciones">
          <button type="button" class="btn btn-outline" (click)="exportar()"><app-icon name="download" />Exportar historial</button>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: 340px minmax(0, 1fr); align-items: start; margin-bottom: 24px">
        <!-- Registrar movimiento -->
        <div class="card">
          <h2 class="card-title">Registrar movimiento</h2>
          <p class="card-sub" style="margin-bottom: 18px">Control de acceso por placa</p>
          <div class="tabs" role="tablist">
            <button type="button" role="tab" class="tab" [class.active]="tab() === 'entrada'" (click)="tab.set('entrada')">Entrada</button>
            <button type="button" role="tab" class="tab" [class.active]="tab() === 'salida'" (click)="tab.set('salida')">Salida</button>
          </div>

          <div class="field">
            <label for="placa">Placa del vehículo</label>
            <div class="input-icon">
              <app-icon name="search" />
              <input id="placa" class="plate-big" [formControl]="placa" placeholder="ABC123" maxlength="10" autocomplete="off">
            </div>
          </div>

          @if (consulta(); as c) {
            @if (c.registrada) {
              <div class="found">
                <div class="top"><b>{{ c.cliente }}</b><app-icon name="check" class="okc" /></div>
                <div class="muted" style="margin: 6px 0 10px">{{ c.vehiculo?.marca }} {{ c.vehiculo?.linea }} · {{ c.vehiculo?.color }}</div>
                @if (c.mensualidad; as m) {
                  <app-badge [estado]="m.estado_pago" [etiqueta]="textoPago(m.estado_pago)" />
                  <div class="muted" style="margin-top: 10px; font-size: 11.5px">Vigente hasta el {{ fecha(m.fecha_fin) }}</div>
                } @else {
                  <app-badge estado="EN_MORA" etiqueta="Sin mensualidad vigente" />
                }
              </div>
            } @else {
              <div class="banner warn" style="margin-bottom: 18px"><app-icon name="info" />{{ c.mensaje }}</div>
            }
          }

          @if (tab() === 'entrada') {
            <div class="field">
              <label for="celda">Celda</label>
              <select id="celda" [formControl]="celdaSel">
                <option [ngValue]="null">{{ textoCeldaAuto() }}</option>
                @for (o of opcionesCelda(); track o.id_celda) { <option [ngValue]="o.id_celda">{{ o.codigo }} · Disponible</option> }
              </select>
            </div>
            <div class="row2">
              <div class="field"><label>Fecha</label><input [value]="fecha(ahora())" disabled></div>
              <div class="field"><label>Hora</label><input [value]="hora(ahora())" disabled></div>
            </div>
            @if (consulta(); as c) {
              @if (c.registrada) {
                <div [class]="'banner ' + (c.puede_ingresar ? '' : 'warn')" style="margin-bottom: 18px"><app-icon name="info" />{{ c.mensaje }}</div>
              }
            }
            <button type="button" class="btn btn-primary" [disabled]="!consulta()?.puede_ingresar || enviando()" (click)="confirmar()">
              <app-icon name="swap" />Confirmar entrada</button>
          } @else {
            @if (consulta(); as c) {
              @if (c.registrada && c.presente && c.movimiento_abierto) {
                <div class="banner" style="margin-bottom: 18px"><app-icon name="info" />
                  {{ c.vehiculo?.placa }} está en la celda {{ c.movimiento_abierto.celda }} desde las {{ hora(c.movimiento_abierto.fecha_entrada) }}.</div>
              } @else if (c.registrada) {
                <div class="banner warn" style="margin-bottom: 18px"><app-icon name="info" />La placa no ha ingresado al parqueadero.</div>
              }
            }
            <button type="button" class="btn btn-primary" [disabled]="!consulta()?.presente || enviando()" (click)="confirmar()">
              <app-icon name="out" />Confirmar salida</button>
          }
          <p class="note">El registro quedará a nombre de {{ auth.operador()?.nombre }}</p>
        </div>

        <!-- Presentes -->
        <div class="stack">
          <div class="card">
            <h2 class="card-title">Vehículos presentes</h2>
            <p class="card-sub" style="margin-bottom: 18px">{{ kpis()?.presentes ?? 0 }} vehículos dentro del parqueadero</p>
            <div class="toolbar">
              <div class="input-icon"><app-icon name="search" /><input [formControl]="qPres" placeholder="Buscar por placa o cliente"></div>
              <select [formControl]="celdaPres"><option value="">Todas las celdas</option>
                @for (c of celdas(); track c.id_celda) { <option [value]="c.codigo">{{ c.codigo }}</option> }</select>
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead><tr><th>Placa</th><th>Cliente</th><th>Celda</th><th>Ingreso</th><th>Mensualidad</th><th>Acción</th></tr></thead>
                <tbody>
                  @for (m of presentes().items; track m.id_movimiento) {
                    <tr>
                      <td><span class="chip-placa">{{ m.placa }}</span></td><td>{{ m.cliente }}</td><td>{{ m.celda }}</td>
                      <td>{{ hora(m.fecha_entrada) }}</td>
                      <td>@if (m.estado_pago) { <app-badge [estado]="m.estado_pago" /> }</td>
                      <td><button type="button" class="link" (click)="prepararSalida(m.placa)">Salida <app-icon name="arrow" [size]="13" /></button></td>
                    </tr>
                  } @empty { <tr><td colspan="6" class="empty">No hay vehículos presentes con ese filtro</td></tr> }
                </tbody>
              </table>
            </div>
            <app-pager [page]="pagPres()" [total]="presentes().total" [porPagina]="5" [mostrando]="presentes().items.length"
                       etiqueta="vehículos presentes" (pageChange)="pagPres.set($event); cargarPresentes()" />
          </div>

          <div class="banner warn"><app-icon name="info" />La mora se muestra como información para el operador. El estado de pago no establece un bloqueo automático de entrada o salida.</div>

          <div class="grid" style="grid-template-columns: repeat(3, 1fr)">
            <div class="card mini"><span class="ic"><app-icon name="swap" [size]="22" /></span><div><div class="big">{{ kpis()?.entradas_hoy ?? 0 }}</div><div class="s">Entradas de hoy</div></div></div>
            <div class="card mini"><span class="ic"><app-icon name="out" [size]="22" /></span><div><div class="big">{{ kpis()?.salidas_hoy ?? 0 }}</div><div class="s">Salidas de hoy</div></div></div>
            <div class="card mini"><span class="ic okc"><app-icon name="user" [size]="22" /></span><div><div style="font-weight: 500">{{ auth.operador()?.nombre }}</div><div class="s">Responsable del turno</div></div></div>
          </div>
        </div>
      </div>

      <!-- Historial -->
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">Historial de movimientos</h2>
          <button type="button" class="link" (click)="completo.set(!completo()); pagHist.set(1); cargarHistorial()">
            {{ completo() ? 'Ver resumen' : 'Ver historial completo' }} <app-icon name="arrow" [size]="14" /></button>
        </div>
        @if (completo()) {
          <div class="toolbar">
            <div class="input-icon"><app-icon name="search" /><input [formControl]="hPlaca" placeholder="Filtrar por placa"></div>
            <input type="date" [formControl]="hDesde" aria-label="Desde" style="width: auto">
            <input type="date" [formControl]="hHasta" aria-label="Hasta" style="width: auto">
          </div>
        }
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Fecha y hora</th><th>Placa</th><th>Movimiento</th><th>Celda</th><th>Responsable</th><th>Observación</th></tr></thead>
            <tbody>
              @for (e of historial().items; track $index) {
                <tr>
                  <td>{{ fechaHora(e.fecha_hora) }}</td><td><span class="chip-placa">{{ e.placa }}</span></td>
                  <td><app-badge [estado]="e.movimiento" /></td><td>{{ e.celda }}</td><td>{{ e.responsable }}</td><td>{{ e.observacion ?? '—' }}</td>
                </tr>
              } @empty { <tr><td colspan="6" class="empty">Sin movimientos para los filtros elegidos</td></tr> }
            </tbody>
          </table>
        </div>
        <app-pager [page]="pagHist()" [total]="historial().total" [porPagina]="porPaginaHist()" [mostrando]="historial().items.length"
                   [etiqueta]="completo() ? 'movimientos' : 'movimientos registrados'" (pageChange)="pagHist.set($event); cargarHistorial()" />
      </div>
    </section>`,
  styles: [`
    .found { background: #f6f8f7; border-radius: 8px; padding: 16px; margin-bottom: 18px; }
    .found .top { display: flex; justify-content: space-between; align-items: center; }
    .okc { color: var(--brand); }
    .mini .ic { color: var(--muted); }`],
})
export class MovimientosComponent {
  private api = inject(MovimientosService);
  private celdasApi = inject(CeldasService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly tab = signal<Tab>('entrada');
  readonly placa = new FormControl('', { nonNullable: true });
  readonly celdaSel = new FormControl<number | null>(null);
  readonly consulta = signal<ConsultaPlaca | null>(null);
  readonly enviando = signal(false);
  readonly ahora = signal(new Date());

  readonly celdas = signal<CeldaResumen[]>([]);
  readonly kpis = signal<KpisHoy | null>(null);
  readonly vacio = <T>(): Pagina<T> => ({ total: 0, page: 1, per_page: 5, items: [] });
  readonly presentes = signal<Pagina<Movimiento>>(this.vacio());
  readonly qPres = new FormControl('', { nonNullable: true });
  readonly celdaPres = new FormControl('', { nonNullable: true });
  readonly pagPres = signal(1);

  readonly completo = signal(false);
  readonly historial = signal<Pagina<EventoHistorial>>(this.vacio());
  readonly pagHist = signal(1);
  readonly hPlaca = new FormControl('', { nonNullable: true });
  readonly hDesde = new FormControl('', { nonNullable: true });
  readonly hHasta = new FormControl('', { nonNullable: true });
  readonly porPaginaHist = computed(() => (this.completo() ? 10 : 3));

  readonly fecha = fecha; readonly hora = hora; readonly fechaHora = fechaHora; readonly cop = cop;
  readonly textoPago = (e: string) => TEXTO_PAGO[e] ?? e;

  /** Celdas que el operador puede elegir a mano: libres, de tipo carro y sin asignar. */
  readonly opcionesCelda = computed(() => this.celdas().filter(c => c.estado === 'DISPONIBLE'));
  readonly textoCeldaAuto = computed(() => {
    const s = this.consulta()?.celda_sugerida;
    if (!s) return 'Automática';
    return `${s.codigo} · ${s.asignada ? 'Asignada a esta mensualidad' : 'Disponible (automática)'}`;
  });

  constructor() {
    const reloj = setInterval(() => this.ahora.set(new Date()), 30000);
    this.destroyRef.onDestroy(() => clearInterval(reloj));

    // Consulta de placa con debounce (RNF2: el registro cabe en 3 pasos)
    this.placa.valueChanges.pipe(
      map(v => normalizarPlaca(v)), debounceTime(300), distinctUntilChanged(),
      tap(() => { this.consulta.set(null); this.celdaSel.setValue(null); }),
      switchMap(p => (p.length >= 5 ? this.api.consultarPlaca(p).pipe(catchError(() => of(null))) : of(null))),
      takeUntilDestroyed(),
    ).subscribe(c => this.consulta.set(c));

    this.qPres.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => { this.pagPres.set(1); this.cargarPresentes(); });
    this.celdaPres.valueChanges.pipe(takeUntilDestroyed())
      .subscribe(() => { this.pagPres.set(1); this.cargarPresentes(); });
    for (const c of [this.hPlaca, this.hDesde, this.hHasta]) {
      c.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
        .subscribe(() => { this.pagHist.set(1); this.cargarHistorial(); });
    }
    this.refrescarTodo();
  }

  private refrescarTodo(): void {
    this.cargarPresentes(); this.cargarHistorial();
    this.api.kpis().subscribe(k => this.kpis.set(k));
    this.celdasApi.listar().subscribe(r => this.celdas.set(r.celdas));
  }

  cargarPresentes(): void {
    this.api.presentes(this.qPres.value, this.celdaPres.value, this.pagPres(), 5).subscribe(p => this.presentes.set(p));
  }

  cargarHistorial(): void {
    this.api.historial({ ...this.filtrosHistorial(), page: this.pagHist(), per_page: this.porPaginaHist() })
      .subscribe(p => this.historial.set(p));
  }

  private filtrosHistorial() {
    return {
      placa: normalizarPlaca(this.hPlaca.value), desde: this.hDesde.value, hasta: this.hHasta.value,
    };
  }

  prepararSalida(placa: string): void {
    this.tab.set('salida');
    this.placa.setValue(placa);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  confirmar(): void {
    const placa = normalizarPlaca(this.placa.value);
    if (placa.length < 5 || this.enviando()) return;
    this.enviando.set(true);
    const salida = this.tab() === 'salida';
    const req = salida ? this.api.salida(placa) : this.api.entrada(placa, this.celdaSel.value);
    req.subscribe({
      next: m => {
        this.enviando.set(false);
        this.toast.ok(salida ? `Salida registrada · ${m.placa} (${m.celda})` : `Entrada registrada · ${m.placa} en ${m.celda}`);
        this.placa.setValue('');
        this.pagPres.set(1); this.pagHist.set(1);
        this.refrescarTodo();
      },
      error: e => { this.enviando.set(false); this.toast.error(e); },
    });
  }

  async exportar(): Promise<void> {
    const filas: (string | number | null)[][] = [];
    for (let page = 1; ; page++) {
      const r = await firstValueFrom(this.api.historial({ ...this.filtrosHistorial(), page, per_page: 100 }));
      for (const e of r.items) filas.push([fechaHora(e.fecha_hora), e.placa, e.cliente, e.movimiento, e.celda, e.responsable, e.observacion]);
      if (page * 100 >= r.total) break;
    }
    descargarCsv('historial-movimientos.csv', ['Fecha y hora', 'Placa', 'Cliente', 'Movimiento', 'Celda', 'Responsable', 'Observación'], filas);
  }
}
