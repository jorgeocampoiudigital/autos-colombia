import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { ArchivosService, ArchivoSubido } from '../../core/api/archivos.service';
import { MovimientosService } from '../../core/api/movimientos.service';
import { NovedadesService } from '../../core/api/novedades.service';
import { AuthService } from '../../core/auth.service';
import { descargarCsv, fecha, fechaCorta, fechaHora, hora, hora24, mesISO, normalizarPlaca } from '../../core/formato';
import { ConsultaPlaca, EstadoNovedad, Novedad, NovedadesResp, TipoNovedad } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { BadgeComponent } from '../../shared/badge.component';
import { DialogComponent } from '../../shared/dialog.component';
import { IconComponent } from '../../shared/icon.component';
import { PagerComponent } from '../../shared/pager.component';

type Tab = 'todas' | 'abiertas' | 'cerradas';
const TIPOS: Record<TipoNovedad, string> = {
  OBSERVACION: 'Observación del vehículo', DANO: 'Daño', OBJETO_OLVIDADO: 'Objeto olvidado', INCIDENTE: 'Incidente', OTRO: 'Otro',
};
const SIGUIENTES: Record<EstadoNovedad, EstadoNovedad[]> = {
  ABIERTA: ['SEGUIMIENTO', 'CERRADA'], SEGUIMIENTO: ['ABIERTA', 'CERRADA'], CERRADA: [],
};
const ESTADO_TXT: Record<EstadoNovedad, string> = { ABIERTA: 'Abierta', SEGUIMIENTO: 'En seguimiento', CERRADA: 'Cerrada' };

@Component({
  selector: 'app-novedades',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent, BadgeComponent, PagerComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <div class="page-head">
        <div><h1>Novedades</h1><p>Deja trazabilidad de las observaciones y su seguimiento por vehículo.</p></div>
        <div class="acciones"><button type="button" class="btn btn-outline" (click)="exportar()"><app-icon name="download" />Exportar historial</button></div>
      </div>

      <div class="kpis c3">
        <div class="card kpi"><span class="kpi-ic amber"><app-icon name="clipboard" /></span><span class="big dark">{{ d().kpis.abiertas }}</span><div><div class="t">Novedades abiertas</div><div class="s">Pendientes de cierre</div></div></div>
        <div class="card kpi"><span class="kpi-ic"><app-icon name="chat" /></span><span class="big dark">{{ d().kpis.seguimiento }}</span><div><div class="t">En seguimiento</div><div class="s">Incluida en las abiertas</div></div></div>
        <div class="card kpi"><span class="kpi-ic"><app-icon name="check" /></span><span class="big dark">{{ d().kpis.cerradas_mes }}</span><div><div class="t">Cerradas este mes</div><div class="s">Con gestión documentada</div></div></div>
      </div>

      <div class="grid" style="grid-template-columns: 340px minmax(0, 1fr); align-items: start">
        <!-- Registrar novedad -->
        <div class="card">
          <h2 class="card-title">Registrar novedad</h2>
          <p class="card-sub" style="margin-bottom: 18px">Asociada a un vehículo</p>
          <form [formGroup]="form" (ngSubmit)="guardar()">
            <div class="field"><label for="n-pla">Placa del vehículo</label>
              <div class="input-icon"><app-icon name="search" /><input id="n-pla" formControlName="placa" placeholder="KTR 482" maxlength="10" autocomplete="off"></div></div>
            @if (consulta(); as c) {
              @if (c.registrada) {
                <div class="found"><app-icon name="car" class="okc" />
                  <div><b>{{ c.cliente }}</b><div class="muted" style="font-size: 11.5px; margin-top: 3px">
                    {{ c.mensualidad ? 'Celda ' + c.mensualidad.celda : 'Sin celda asignada' }} · {{ c.presente ? 'Vehículo presente' : 'Fuera del parqueadero' }}</div></div></div>
              } @else { <div class="banner warn" style="margin-bottom: 18px"><app-icon name="info" />{{ c.mensaje }}</div> }
            }
            <div class="row2">
              <div class="field"><label>Fecha</label><input [value]="fecha(ahora)" disabled></div>
              <div class="field"><label>Hora</label><input [value]="hora(ahora)" disabled></div>
            </div>
            <div class="field"><label for="n-tip">Tipo de novedad</label>
              <select id="n-tip" formControlName="tipo">@for (t of tiposLista; track t) { <option [value]="t">{{ tipos[t] }}</option> }</select></div>
            <div class="field"><label>Responsable del registro</label>
              <div class="input-icon"><app-icon name="user" /><input [value]="auth.operador()?.nombre" disabled></div></div>
            <div class="field"><label for="n-des">Descripción</label>
              <textarea id="n-des" rows="5" formControlName="descripcion" placeholder="Describe lo observado…"></textarea>
              @if (form.controls.descripcion.dirty && form.controls.descripcion.invalid) { <span class="err">Escribe al menos 5 caracteres</span> }</div>
            <label class="upload"><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" (change)="subir($event)">
              <app-icon name="clip" [size]="16" />Adjuntar evidencia</label>
            @for (e of evidencias(); track e.url) { <p class="note" style="margin: -10px 0 10px">📎 {{ e.nombre }}</p> }
            <button class="btn btn-primary" [disabled]="form.invalid || !consulta()?.registrada || guardando()"><app-icon name="plus" />Guardar novedad</button>
            <p class="note">Este borrador aún no aparece en el historial.</p>
          </form>
        </div>

        <div class="stack">
          <div class="card">
            <h2 class="card-title">Historial de novedades</h2>
            <p class="card-sub" style="margin-bottom: 18px">{{ d().conteos.todas }} registros en {{ mesNombre() }}</p>
            <div class="tabs">
              <button type="button" class="tab" [class.active]="tab() === 'todas'" (click)="cambiarTab('todas')">Todas · {{ d().conteos.todas }}</button>
              <button type="button" class="tab" [class.active]="tab() === 'abiertas'" (click)="cambiarTab('abiertas')">Abiertas · {{ d().conteos.abiertas }}</button>
              <button type="button" class="tab" [class.active]="tab() === 'cerradas'" (click)="cambiarTab('cerradas')">Cerradas · {{ d().conteos.cerradas }}</button>
            </div>
            <div class="toolbar">
              <div class="input-icon"><app-icon name="search" /><input [formControl]="q" placeholder="Buscar por placa, responsable o descripción"></div>
              <input type="month" [formControl]="periodo" aria-label="Periodo" style="width: auto">
            </div>
            <div class="tbl-wrap"><table class="tbl">
              <thead><tr><th>Fecha</th><th>Placa</th><th>Descripción</th><th>Responsable</th><th>Estado</th></tr></thead>
              <tbody>
                @for (n of d().items; track n.id_novedad) {
                  <tr class="click" [class.sel]="n.id_novedad === det()?.id_novedad" (click)="ver(n.id_novedad)">
                    <td style="white-space: nowrap">{{ fechaCorta(n.fecha_hora) }} · {{ hora24(n.fecha_hora) }}</td>
                    <td><span class="chip-placa">{{ n.placa }}</span></td>
                    <td><div [class]="'name' + (n.id_novedad === det()?.id_novedad ? ' link-ink' : '')">{{ n.titulo }}</div><div class="sub">{{ n.codigo }} · {{ tipos[n.tipo] }}</div></td>
                    <td>{{ n.responsable }}</td><td><app-badge [estado]="n.estado" /></td>
                  </tr>
                } @empty { <tr><td colspan="5" class="empty">No hay novedades para estos filtros</td></tr> }
              </tbody></table></div>
            <app-pager [page]="pag()" [total]="d().total" [porPagina]="6" [mostrando]="d().items.length" etiqueta="novedades del periodo" (pageChange)="pag.set($event); cargar()" />
          </div>

          @if (det(); as n) {
            <div class="card">
              <div class="card-head"><h2 class="card-title">{{ n.codigo }} · {{ n.titulo }}</h2>
                @if (n.estado !== 'CERRADA') { <button type="button" class="link" (click)="abrirEstado(n)">Actualizar estado <app-icon name="arrow" [size]="14" /></button> }</div>
              <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 16px">
                <span class="chip-placa">{{ n.placa }}</span><span>{{ n.cliente }}{{ n.celda ? ' · ' + n.celda : '' }}</span>
                <app-badge [estado]="n.estado" /><span class="muted" style="font-size: 12px">{{ fechaHora(n.fecha_hora) }}</span>
              </div>
              <p style="line-height: 1.6">{{ n.descripcion }}</p>
              @if (n.evidencias.length) {
                <div style="margin-top: 14px; display: flex; gap: 12px; flex-wrap: wrap">
                  @for (e of n.evidencias; track e.url) { <a class="link" [href]="archivos.urlAbsoluta(e.url)" target="_blank" rel="noopener"><app-icon name="clip" [size]="14" />{{ e.nombre }}</a> }
                </div>
              }
              <hr class="sep">
              <div style="display: flex; justify-content: space-between" class="muted">
                <span style="font-size: 12px">Registrado por {{ n.responsable }} · Operación</span>
                <span style="font-size: 12px">{{ n.evidencias.length ? n.evidencias.length + ' archivo(s) adjunto(s)' : 'Sin archivos adjuntos' }}</span>
              </div>
              @if (n.historial.length > 1) {
                <div class="section-label">SEGUIMIENTO</div>
                @for (h of n.historial; track $index) {
                  <div class="hist"><app-badge [estado]="h.estado" /><span>{{ h.comentario ?? '' }}</span><span class="muted">{{ h.operador }} · {{ fechaHora(h.created_at) }}</span></div>
                }
              }
            </div>
          }
        </div>
      </div>
    </section>

    @if (cambio(); as n) {
      <app-dialog [titulo]="'Actualizar ' + n.codigo" (cerrar)="cambio.set(null)">
        <div class="field"><label for="u-est">Nuevo estado</label>
          <select id="u-est" [formControl]="nuevoEstado">@for (s of siguientes(n.estado); track s) { <option [value]="s">{{ estadoTxt[s] }}</option> }</select></div>
        <div class="field"><label for="u-com">Comentario (opcional)</label><textarea id="u-com" rows="3" [formControl]="comentario" maxlength="300"></textarea></div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-outline" (click)="cambio.set(null)">Cancelar</button>
          <button type="button" class="btn btn-primary" (click)="aplicarEstado(n)">Guardar</button>
        </div>
      </app-dialog>
    }`,
  styles: [`
    .big.dark { color: var(--ink); }
    .kpi-ic { color: var(--muted); display: grid; }
    .kpi-ic.amber { color: #d57b00; }
    .found { display: flex; gap: 12px; align-items: center; background: #f6f8f7; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px; }
    .okc { color: var(--brand); }
    .hist { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 8px 0; font-size: 12.5px; border-bottom: 1px dashed var(--line); }
    .hist:last-child { border-bottom: 0; }`],
})
export class NovedadesComponent {
  private api = inject(NovedadesService);
  private movApi = inject(MovimientosService);
  readonly archivos = inject(ArchivosService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly tab = signal<Tab>('todas');
  readonly q = new FormControl('', { nonNullable: true });
  readonly periodo = new FormControl(mesISO(), { nonNullable: true });
  readonly pag = signal(1);
  readonly d = signal<NovedadesResp>({
    total: 0, page: 1, per_page: 6, items: [], conteos: { todas: 0, abiertas: 0, cerradas: 0 },
    kpis: { abiertas: 0, seguimiento: 0, cerradas_mes: 0 },
  });
  readonly det = signal<Novedad | null>(null);
  readonly consulta = signal<ConsultaPlaca | null>(null);
  readonly evidencias = signal<ArchivoSubido[]>([]);
  readonly guardando = signal(false);
  readonly cambio = signal<Novedad | null>(null);
  readonly nuevoEstado = new FormControl<EstadoNovedad>('SEGUIMIENTO', { nonNullable: true });
  readonly comentario = new FormControl('', { nonNullable: true });
  readonly ahora = new Date();

  readonly tipos = TIPOS;
  readonly tiposLista = Object.keys(TIPOS) as TipoNovedad[];
  readonly estadoTxt = ESTADO_TXT;
  readonly siguientes = (e: EstadoNovedad) => SIGUIENTES[e];
  readonly fecha = fecha; readonly hora = hora; readonly hora24 = hora24; readonly fechaCorta = fechaCorta; readonly fechaHora = fechaHora;
  readonly mesNombre = computed(() => {
    const p = this.periodo.value || mesISO();
    return new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(new Date(+p.slice(0, 4), +p.slice(5, 7) - 1, 1));
  });

  readonly form = this.fb.nonNullable.group({
    placa: ['', Validators.required],
    tipo: ['OBSERVACION' as TipoNovedad, Validators.required],
    descripcion: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(2000)]],
  });

  constructor() {
    this.form.controls.placa.valueChanges.pipe(
      map(v => normalizarPlaca(v)), debounceTime(300), distinctUntilChanged(),
      tap(() => this.consulta.set(null)),
      switchMap(p => (p.length >= 5 ? this.movApi.consultarPlaca(p).pipe(catchError(() => of(null))) : of(null))),
      takeUntilDestroyed(),
    ).subscribe(c => this.consulta.set(c));
    this.q.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => { this.pag.set(1); this.cargar(); });
    this.periodo.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { this.pag.set(1); this.cargar(); });
    this.cargar(true);
  }

  cambiarTab(t: Tab): void { this.tab.set(t); this.pag.set(1); this.cargar(); }

  cargar(primera = false): void {
    this.api.listar({ tab: this.tab(), q: this.q.value, periodo: this.periodo.value, page: this.pag(), per_page: 6 }).subscribe(r => {
      this.d.set(r);
      if (primera && r.items.length) this.ver(r.items[0].id_novedad);
    });
  }

  ver(id: number): void { this.api.obtener(id).subscribe(n => this.det.set(n)); }

  subir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    for (const f of Array.from(input.files ?? [])) {
      this.archivos.subir(f).subscribe({ next: a => this.evidencias.update(l => [...l, a]), error: e => this.toast.error(e) });
    }
    input.value = '';
  }

  guardar(): void {
    if (this.form.invalid || !this.consulta()?.registrada) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.api.crear({ placa: normalizarPlaca(v.placa), tipo: v.tipo, descripcion: v.descripcion, evidencias: this.evidencias() }).subscribe({
      next: n => {
        this.guardando.set(false);
        this.toast.ok(`Novedad ${n.codigo} registrada`);
        this.form.reset({ placa: '', tipo: 'OBSERVACION', descripcion: '' });
        this.evidencias.set([]); this.consulta.set(null);
        this.det.set(n); this.pag.set(1); this.cargar();
      },
      error: e => { this.guardando.set(false); this.toast.error(e); },
    });
  }

  abrirEstado(n: Novedad): void {
    this.nuevoEstado.setValue(SIGUIENTES[n.estado][0]);
    this.comentario.reset('');
    this.cambio.set(n);
  }

  aplicarEstado(n: Novedad): void {
    this.api.cambiarEstado(n.id_novedad, this.nuevoEstado.value, this.comentario.value || undefined).subscribe({
      next: r => { this.toast.ok(`${r.codigo}: ${ESTADO_TXT[r.estado]}`); this.cambio.set(null); this.det.set(r); this.cargar(); },
      error: e => this.toast.error(e),
    });
  }

  async exportar(): Promise<void> {
    const r = await firstValueFrom(this.api.listar({ tab: this.tab(), q: this.q.value, periodo: this.periodo.value, page: 1, per_page: 100 }));
    descargarCsv('novedades.csv', ['Código', 'Fecha', 'Placa', 'Tipo', 'Descripción', 'Responsable', 'Estado'],
      r.items.map(n => [n.codigo, fechaHora(n.fecha_hora), n.placa, TIPOS[n.tipo], n.descripcion, n.responsable, ESTADO_TXT[n.estado]]));
  }
}
