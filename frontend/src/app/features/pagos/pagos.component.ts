import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { ArchivosService, ArchivoSubido } from '../../core/api/archivos.service';
import { ClientesService } from '../../core/api/clientes.service';
import { PagosService } from '../../core/api/pagos.service';
import { AuthService } from '../../core/auth.service';
import { cop, copSolo, descargarCsv, fecha, fechaCorta, hoyISO, mesISO } from '../../core/formato';
import { Cobro, KpisPagos, MedioPago, MensualidadFila, Pagina, Pago } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { BadgeComponent } from '../../shared/badge.component';
import { DialogComponent } from '../../shared/dialog.component';
import { IconComponent } from '../../shared/icon.component';
import { MensualidadDialogComponent } from '../../shared/mensualidad-dialog.component';
import { PagerComponent } from '../../shared/pager.component';

type Tab = 'cobros' | 'mensualidades' | 'pagos';
const MEDIO: Record<MedioPago, string> = { TRANSFERENCIA: 'Transferencia', EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', OTRO: 'Otro' };
const vacia = <T>(): Pagina<T> => ({ total: 0, page: 1, per_page: 5, items: [] });

@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent, BadgeComponent, PagerComponent, DialogComponent, MensualidadDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <div class="page-head">
        <div><h1>Pagos y mensualidades</h1><p>Separa lo que está por cobrar de los pagos que ya recibiste. Valores en COP.</p></div>
        <div class="acciones">
          <button type="button" class="btn btn-outline" (click)="exportar()"><app-icon name="download" />Exportar</button>
          @if (auth.esAdmin()) { <button type="button" class="btn btn-primary" (click)="nueva.set(true)"><app-icon name="plus" />Nueva mensualidad</button> }
        </div>
      </div>

      @if (k(); as k) {
        <div class="kpis c4">
          <div class="card kpi-money"><div class="l">Cobros de {{ mes() }} <app-icon name="calendar" class="ok" /></div><div class="v">{{ cop(k.total) }}</div><div class="s">{{ k.cobros }} mensualidades · Periodo actual</div></div>
          <div class="card kpi-money"><div class="l">Pagos recibidos <app-icon name="check" class="ok" /></div><div class="v">{{ cop(k.pagado) }}</div><div class="s">{{ k.cobros_pagados }} cobros pagados · {{ k.porcentaje_pagado }} % del total</div></div>
          <div class="card kpi-money"><div class="l">Saldo pendiente <app-icon name="wallet" class="amberic" /></div><div class="v">{{ cop(k.saldo) }}</div><div class="s">{{ k.cobros_pendientes }} cobros aún sin pagar</div></div>
          <div class="card kpi-money"><div class="l">Saldo en mora <app-icon name="alarm" class="amberic" /></div><div class="v">{{ cop(k.saldo_mora) }}</div><div class="s">{{ k.cobros_mora }} cobros con fecha vencida</div></div>
        </div>
      }

      <div class="grid col-main-side" style="margin-bottom: 24px">
        <div class="stack">
          <div class="card">
            <h2 class="card-title">Gestión de mensualidades</h2>
            <p class="card-sub" style="margin-bottom: 18px">{{ mesLargo() }} · Sede principal</p>
            <div class="tabs">
              <button type="button" class="tab" [class.active]="tab() === 'cobros'" (click)="cambiarTab('cobros')">Cobros pendientes · {{ k()?.cobros_pendientes ?? 0 }}</button>
              <button type="button" class="tab" [class.active]="tab() === 'mensualidades'" (click)="cambiarTab('mensualidades')">Mensualidades · {{ k()?.cobros ?? 0 }}</button>
              <button type="button" class="tab" [class.active]="tab() === 'pagos'" (click)="cambiarTab('pagos')">Pagos · {{ k()?.cobros_pagados ?? 0 }}</button>
            </div>
            <div class="toolbar">
              <div class="input-icon"><app-icon name="search" /><input [formControl]="q" placeholder="Buscar cliente, placa o cobro"></div>
              @if (tab() !== 'mensualidades') { <input type="month" [formControl]="periodo" aria-label="Periodo"> }
              @if (tab() === 'cobros') {
                <select [formControl]="estado" aria-label="Estado"><option value="">Estado</option><option value="EN_MORA">En mora</option>
                  <option value="POR_VENCER">Por vencer</option><option value="PENDIENTE">Pendiente</option></select>
              }
            </div>

            @switch (tab()) {
              @case ('cobros') {
                <div class="tbl-wrap"><table class="tbl">
                  <thead><tr><th>Cliente / Cobro</th><th>Placa</th><th>Vence</th><th>Saldo COP</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    @for (c of cobros().items; track c.id_cobro) {
                      <tr [class.sel]="c.id_cobro === cobro()?.id_cobro">
                        <td><div class="name link-ink">{{ c.cliente }}</div><div class="sub">{{ c.codigo }} · {{ c.mensualidad }}</div></td>
                        <td><span class="chip-placa">{{ c.placa }}</span></td><td>{{ fechaCorta(c.fecha_vencimiento) }}</td>
                        <td>{{ cop(c.saldo) }}</td><td><app-badge [estado]="c.estado" /></td>
                        <td><button type="button" class="link" (click)="elegir(c)">Pagar <app-icon name="arrow" [size]="13" /></button></td>
                      </tr>
                    } @empty { <tr><td colspan="6" class="empty">No hay cobros pendientes para estos filtros</td></tr> }
                  </tbody></table></div>
                <app-pager [page]="pag()" [total]="cobros().total" [porPagina]="5" [mostrando]="cobros().items.length" etiqueta="cobros pendientes" (pageChange)="pag.set($event); cargarLista()" />
              }
              @case ('mensualidades') {
                <div class="tbl-wrap"><table class="tbl">
                  <thead><tr><th>Cliente / Mensualidad</th><th>Placa</th><th>Celda</th><th>Vigencia</th><th>Valor COP</th><th>Pago</th></tr></thead>
                  <tbody>
                    @for (m of mens().items; track m.id_mensualidad) {
                      <tr><td><div class="name">{{ m.cliente }}</div><div class="sub">{{ m.codigo }}</div></td>
                        <td><span class="chip-placa">{{ m.placa }}</span></td><td>{{ m.celda }}</td>
                        <td>{{ fechaCorta(m.fecha_inicio) }} – {{ fechaCorta(m.fecha_fin) }}</td><td>{{ cop(m.valor_mensual) }}</td>
                        <td>@if (m.estado_pago) { <app-badge [estado]="m.estado_pago" /> }</td></tr>
                    } @empty { <tr><td colspan="6" class="empty">Sin mensualidades</td></tr> }
                  </tbody></table></div>
                <app-pager [page]="pag()" [total]="mens().total" [porPagina]="5" [mostrando]="mens().items.length" etiqueta="mensualidades" (pageChange)="pag.set($event); cargarLista()" />
              }
              @case ('pagos') {
                <div class="tbl-wrap"><table class="tbl">
                  <thead><tr><th>Fecha</th><th>Cliente</th><th>Cobro</th><th>Medio</th><th>Valor COP</th><th>Comprobante</th></tr></thead>
                  <tbody>
                    @for (p of pagosTab().items; track p.id_pago) {
                      <tr><td>{{ fecha(p.fecha_pago) }}</td><td>{{ p.cliente }}</td><td>{{ p.cobro }}</td><td>{{ medios[p.medio] }}</td><td>{{ cop(p.valor) }}</td>
                        <td><button type="button" class="link" (click)="recibo.set(p)">{{ p.numero_recibo }} <app-icon name="out" [size]="12" /></button></td></tr>
                    } @empty { <tr><td colspan="6" class="empty">Sin pagos en el periodo</td></tr> }
                  </tbody></table></div>
                <app-pager [page]="pag()" [total]="pagosTab().total" [porPagina]="5" [mostrando]="pagosTab().items.length" etiqueta="pagos" (pageChange)="pag.set($event); cargarLista()" />
              }
            }
          </div>
          <div class="banner plain"><app-icon name="info" />Un cobro representa el valor a recaudar. Un pago registra el dinero recibido y queda relacionado con su comprobante y mensualidad.</div>
        </div>

        <!-- Registrar pago -->
        <div class="card">
          <h2 class="card-title">Registrar pago</h2>
          <p class="card-sub" style="margin-bottom: 18px">Cobro seleccionado · {{ cobro()?.codigo ?? '—' }}</p>
          @if (cobro(); as c) {
            <div class="sel-box">
              <div style="display: flex; justify-content: space-between; align-items: center"><b>{{ c.cliente }}</b><app-badge [estado]="c.estado" /></div>
              <div class="muted" style="font-size: 12px; margin: 12px 0 8px">{{ c.placa }} · Celda {{ c.celda }} · {{ c.mensualidad }}</div>
              <div class="muted" style="font-size: 11.5px; margin-bottom: 12px">Periodo: {{ fechaCorta(c.periodo_inicio) }} – {{ fecha(c.periodo_fin) }}</div>
              <div style="display: flex; justify-content: space-between; align-items: baseline"><span>Saldo pendiente</span><span style="font-size: 20px; font-weight: 500">{{ cop(c.saldo) }}</span></div>
            </div>
            <form [formGroup]="form" (ngSubmit)="guardar()">
              <div class="row2">
                <div class="field"><label for="p-val">Valor recibido · COP</label><input id="p-val" type="number" min="1" [max]="c.saldo" formControlName="valor">
                  @if (form.controls.valor.errors?.['max']) { <span class="err">Excede el saldo ({{ cop(c.saldo) }})</span> }</div>
                <div class="field"><label for="p-fec">Fecha del pago</label><input id="p-fec" type="date" [max]="hoy" formControlName="fecha"></div>
              </div>
              <div class="field"><label for="p-med">Medio de pago</label>
                <select id="p-med" formControlName="medio">@for (m of mediosLista; track m) { <option [value]="m">{{ medios[m] }}</option> }</select></div>
              <div class="field"><label for="p-ref">Referencia de la transacción</label><input id="p-ref" formControlName="referencia" placeholder="TRX-000000"></div>
              <label class="upload"><input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" (change)="subir($event)">
                <app-icon name="clip" [size]="16" />{{ soporte() ? soporte()!.nombre : 'Adjuntar soporte de pago' }}</label>
              <button class="btn btn-primary" [disabled]="form.invalid || guardando()"><app-icon name="receipt" />Guardar pago y comprobante</button>
              <p class="note">Se actualizará el saldo al guardar. Este pago aún no ha sido registrado.</p>
            </form>
          } @else { <p class="muted">No hay cobros pendientes para registrar.</p> }
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2 class="card-title">Últimos pagos y comprobantes</h2>
          <button type="button" class="link" (click)="cambiarTab('pagos')">Ver todos los pagos <app-icon name="arrow" [size]="14" /></button></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Cobro</th><th>Medio</th><th>Valor COP</th><th>Recibido por</th><th>Comprobante</th></tr></thead>
          <tbody>
            @for (p of ultimos().items; track p.id_pago) {
              <tr><td>{{ fecha(p.fecha_pago) }}</td><td>{{ p.cliente }}</td><td>{{ p.cobro }}</td><td>{{ medios[p.medio] }}</td><td>{{ cop(p.valor) }}</td><td>{{ p.recibido_por }}</td>
                <td><button type="button" class="link" (click)="recibo.set(p)">{{ p.numero_recibo }} <app-icon name="out" [size]="12" /></button></td></tr>
            } @empty { <tr><td colspan="7" class="empty">Aún no hay pagos en este periodo</td></tr> }
          </tbody></table></div>
        <p class="note" style="margin-top: 14px">{{ ultimos().total }} pagos recibidos en {{ mes() }} · Total: {{ cop(k()?.pagado) }} COP</p>
      </div>
    </section>

    @if (nueva()) { <app-mensualidad-dialog (cerrar)="nueva.set(false)" (creada)="recargar()" /> }
    @if (recibo(); as p) {
      <app-dialog titulo="Comprobante de pago" (cerrar)="recibo.set(null)">
        <div class="recibo">
          <p class="muted" style="margin-bottom: 16px">Autos Colombia · Sede principal</p>
          <dl>
            <dt>Recibo</dt><dd>{{ p.numero_recibo }}</dd><dt>Fecha</dt><dd>{{ fecha(p.fecha_pago) }}</dd>
            <dt>Cliente</dt><dd>{{ p.cliente }}</dd><dt>Placa</dt><dd>{{ p.placa }}</dd><dt>Cobro</dt><dd>{{ p.cobro }}</dd>
            <dt>Medio</dt><dd>{{ medios[p.medio] }}{{ p.referencia ? ' · ' + p.referencia : '' }}</dd>
            <dt>Valor recibido</dt><dd style="font-size: 20px">{{ cop(p.valor) }} COP</dd><dt>Recibido por</dt><dd>{{ p.recibido_por }}</dd>
          </dl>
        </div>
        <div class="dialog-actions no-print">
          @if (p.soporte_url) { <a class="btn btn-outline" [href]="archivos.urlAbsoluta(p.soporte_url)" target="_blank" rel="noopener"><app-icon name="clip" />Ver soporte</a> }
          <button type="button" class="btn btn-primary" (click)="imprimir()"><app-icon name="print" />Imprimir</button>
        </div>
      </app-dialog>
    }`,
  styles: [`
    .sel-box { background: #f6f8f7; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
    .toolbar input[type=month] { width: auto; }`],
})
export class PagosComponent {
  private api = inject(PagosService);
  private clientesApi = inject(ClientesService);
  readonly archivos = inject(ArchivosService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);

  /** ?q=PLACA llega desde otras pantallas (withComponentInputBinding) */
  readonly qParam = input<string>('', { alias: 'q' });

  readonly tab = signal<Tab>('cobros');
  readonly q = new FormControl('', { nonNullable: true });
  readonly periodo = new FormControl(mesISO(), { nonNullable: true });
  readonly estado = new FormControl('', { nonNullable: true });
  readonly pag = signal(1);
  readonly k = signal<KpisPagos | null>(null);
  readonly cobros = signal<Pagina<Cobro>>(vacia());
  readonly mens = signal<Pagina<MensualidadFila>>(vacia());
  readonly pagosTab = signal<Pagina<Pago>>(vacia());
  readonly ultimos = signal<Pagina<Pago>>(vacia());
  readonly cobro = signal<Cobro | null>(null);
  readonly soporte = signal<ArchivoSubido | null>(null);
  readonly guardando = signal(false);
  readonly nueva = signal(false);
  readonly recibo = signal<Pago | null>(null);

  readonly hoy = hoyISO();
  readonly medios = MEDIO;
  readonly mediosLista = Object.keys(MEDIO) as MedioPago[];
  readonly cop = cop; readonly fecha = fecha; readonly fechaCorta = fechaCorta;
  readonly mes = computed(() => this.nombreMes(this.k()?.periodo ?? mesISO()));
  readonly mesLargo = computed(() => { const p = this.k()?.periodo ?? mesISO(); return `${this.nombreMes(p)[0].toUpperCase()}${this.nombreMes(p).slice(1)} ${p.slice(0, 4)}`; });

  readonly form = this.fb.nonNullable.group({
    valor: [0, [Validators.required, Validators.min(1)]],
    fecha: [hoyISO(), Validators.required],
    medio: ['TRANSFERENCIA' as MedioPago, Validators.required],
    referencia: [''],
  });

  constructor() {
    effect(() => { const v = this.qParam(); if (v && v !== this.q.value) this.q.setValue(v); });
    this.q.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => { this.pag.set(1); this.cargarLista(); });
    this.periodo.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { this.pag.set(1); this.recargar(); });
    this.estado.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { this.pag.set(1); this.cargarLista(); });
    this.recargar();
  }

  private nombreMes(p: string): string {
    return new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(new Date(+p.slice(0, 4), +p.slice(5, 7) - 1, 1));
  }

  cambiarTab(t: Tab): void { this.tab.set(t); this.pag.set(1); this.cargarLista(); }

  recargar(): void {
    const periodo = this.periodo.value || mesISO();
    this.api.kpis(periodo).subscribe(k => this.k.set(k));
    this.api.pagos({ periodo, per_page: 3 }).subscribe(p => this.ultimos.set(p));
    this.cargarLista();
  }

  cargarLista(): void {
    const base = { q: this.q.value, periodo: this.periodo.value || mesISO(), page: this.pag(), per_page: 5 };
    switch (this.tab()) {
      case 'cobros':
        this.api.cobros({ ...base, estado: this.estado.value, pendientes: true }).subscribe(c => {
          this.cobros.set(c);
          const actual = this.cobro();
          if (!actual || !c.items.some(i => i.id_cobro === actual.id_cobro)) {
            if (!actual && c.items.length) this.elegir(c.items[0]);
          }
        });
        break;
      case 'mensualidades': this.clientesApi.mensualidades(this.q.value, this.pag()).subscribe(m => this.mens.set(m)); break;
      case 'pagos': this.api.pagos(base).subscribe(p => this.pagosTab.set(p)); break;
    }
  }

  elegir(c: Cobro): void {
    this.cobro.set(c);
    this.soporte.set(null);
    this.form.controls.valor.setValidators([Validators.required, Validators.min(1), Validators.max(c.saldo)]);
    this.form.patchValue({ valor: c.saldo, fecha: hoyISO(), referencia: '' });
    this.form.controls.valor.updateValueAndValidity();
  }

  subir(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.archivos.subir(f).subscribe({ next: a => this.soporte.set(a), error: e => this.toast.error(e) });
  }

  guardar(): void {
    const c = this.cobro();
    if (!c || this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.api.registrar({
      id_cobro: c.id_cobro, valor: v.valor, fecha_pago: v.fecha, medio: v.medio,
      referencia: v.referencia || null, soporte_url: this.soporte()?.url ?? null,
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        this.toast.ok(`Pago registrado · ${r.pago.numero_recibo}`);
        this.recibo.set(r.pago);
        this.cobro.set(r.cobro.saldo > 0 ? r.cobro : null);
        if (r.cobro.saldo > 0) this.elegir(r.cobro);
        this.recargar();
      },
      error: e => { this.guardando.set(false); this.toast.error(e); },
    });
  }

  imprimir(): void { window.print(); }

  async exportar(): Promise<void> {
    const periodo = this.periodo.value || mesISO();
    const filas: (string | number | null)[][] = [];
    for (let page = 1; ; page++) {
      const r = await firstValueFrom(this.api.pagos({ periodo, page, per_page: 100 }));
      for (const p of r.items) filas.push([p.numero_recibo, p.fecha_pago, p.cliente, p.placa, p.cobro, MEDIO[p.medio], copSolo(p.valor), p.referencia, p.recibido_por]);
      if (page * 100 >= r.total) break;
    }
    descargarCsv(`pagos-${periodo}.csv`, ['Recibo', 'Fecha', 'Cliente', 'Placa', 'Cobro', 'Medio', 'Valor COP', 'Referencia', 'Recibido por'], filas);
  }
}
