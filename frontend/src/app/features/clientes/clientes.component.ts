import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ClientesService } from '../../core/api/clientes.service';
import { cop, docFmt, fecha, iniciales, normalizarPlaca, telFmt } from '../../core/formato';
import { ClienteFila, ClientesResp, Ficha, Pagina, VehiculoFila } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { BadgeComponent } from '../../shared/badge.component';
import { DialogComponent } from '../../shared/dialog.component';
import { IconComponent } from '../../shared/icon.component';
import { PagerComponent } from '../../shared/pager.component';

type Tab = 'clientes' | 'vehiculos';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, BadgeComponent, PagerComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <div class="page-head">
        <div><h1>Clientes y vehículos</h1><p>Personas, datos de contacto y mensualidades en un mismo lugar.</p></div>
        <div class="acciones"><button type="button" class="btn btn-primary" (click)="nuevo.set(true)"><app-icon name="plus" />Nuevo cliente</button></div>
      </div>

      <div class="kpis c3">
        <div class="card kpi"><span class="kpi-icon"><app-icon name="users" /></span><span class="big" style="color: var(--ink)">{{ kpis().clientes }}</span><span class="muted">Clientes registrados</span></div>
        <div class="card kpi"><span class="kpi-icon"><app-icon name="car" /></span><span class="big" style="color: var(--ink)">{{ kpis().vehiculos }}</span><span class="muted">Vehículos registrados</span></div>
        <div class="card kpi"><span class="kpi-icon"><app-icon name="calendar" /></span><span class="big" style="color: var(--ink)">{{ kpis().mensualidades_activas }}</span><span class="muted">Mensualidades activas</span></div>
      </div>

      <div class="grid col-main-side">
        <div class="card">
          <h2 class="card-title">Directorio de clientes</h2>
          <p class="card-sub" style="margin-bottom: 18px">Selecciona un cliente para consultar su ficha</p>
          <div class="tabs">
            <button type="button" class="tab" [class.active]="tab() === 'clientes'" (click)="cambiarTab('clientes')">Clientes · {{ kpis().clientes }}</button>
            <button type="button" class="tab" [class.active]="tab() === 'vehiculos'" (click)="cambiarTab('vehiculos')">Vehículos · {{ kpis().vehiculos }}</button>
          </div>
          <div class="toolbar">
            <div class="input-icon"><app-icon name="search" /><input [formControl]="q" placeholder="Buscar nombre, identificación o placa"></div>
            @if (tab() === 'clientes') {
              <select [formControl]="estado"><option value="">Mensualidad</option><option value="AL_DIA">Al día</option>
                <option value="POR_VENCER">Por vencer</option><option value="EN_MORA">En mora</option></select>
            }
          </div>

          @if (tab() === 'clientes') {
            <div class="tbl-wrap"><table class="tbl">
              <thead><tr><th>Cliente</th><th>Contacto</th><th>Placa</th><th>Celda</th><th>Mensualidad</th></tr></thead>
              <tbody>
                @for (c of clientes().items; track c.id_usuario) {
                  <tr class="click" [class.sel]="c.id_usuario === ficha()?.id_usuario" (click)="seleccionar(c.id_usuario)">
                    <td><div style="display: flex; gap: 12px; align-items: center">
                      <span [class]="'avatar' + (c.id_usuario === ficha()?.id_usuario ? ' on' : '')">{{ iniciales(c.nombre) }}</span>
                      <div><div class="name link-ink">{{ c.nombre }}</div><div class="sub">{{ c.tipo_documento }} {{ doc(c.documento) }}</div></div></div></td>
                    <td>{{ tel(c.telefono) }}</td>
                    <td>@if (c.placa) { <span class="chip-placa">{{ c.placa }}</span> } @else { — }</td>
                    <td>{{ c.celda ?? '—' }}</td>
                    <td>@if (c.estado_pago) { <app-badge [estado]="c.estado_pago" /> } @else { <span class="muted">Sin mensualidad</span> }</td>
                  </tr>
                } @empty { <tr><td colspan="5" class="empty">No se encontraron clientes</td></tr> }
              </tbody></table></div>
            <app-pager [page]="pag()" [total]="clientes().total" [porPagina]="8" [mostrando]="clientes().items.length" etiqueta="clientes" (pageChange)="pag.set($event); cargar()" />
          } @else {
            <div class="tbl-wrap"><table class="tbl">
              <thead><tr><th>Placa</th><th>Vehículo</th><th>Cliente</th><th>Celda</th><th>Mensualidad</th></tr></thead>
              <tbody>
                @for (v of vehiculos().items; track v.placa) {
                  <tr class="click" (click)="irACliente(v.id_usuario)">
                    <td><span class="chip-placa">{{ v.placa }}</span></td>
                    <td>{{ v.marca }} {{ v.linea }}<div class="sub">{{ v.color }} · {{ v.anio_modelo }}</div></td>
                    <td>{{ v.cliente }}</td><td>{{ v.celda ?? '—' }}</td>
                    <td>@if (v.estado_pago) { <app-badge [estado]="v.estado_pago" /> } @else { <span class="muted">Sin mensualidad</span> }</td>
                  </tr>
                } @empty { <tr><td colspan="5" class="empty">No se encontraron vehículos</td></tr> }
              </tbody></table></div>
            <app-pager [page]="pag()" [total]="vehiculos().total" [porPagina]="8" [mostrando]="vehiculos().items.length" etiqueta="vehículos" (pageChange)="pag.set($event); cargar()" />
          }
        </div>

        <!-- Ficha -->
        <div class="stack">
          @if (ficha(); as f) {
            <div class="card">
              <div class="card-head"><h2 class="card-title">Ficha del cliente</h2><button type="button" class="link" (click)="abrirEdicion(f)">Editar <app-icon name="arrow" [size]="14" /></button></div>
              <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 14px">
                <span class="avatar lg">{{ iniciales(f.nombre) }}</span>
                <div><div style="font-size: 19px">{{ f.nombre }}</div><div class="muted" style="font-size: 12px">Cliente desde el {{ fecha(f.created_at) }}</div></div>
              </div>
              <app-badge [estado]="f.activo ? 'AL_DIA' : 'CERRADA'" [etiqueta]="f.activo ? 'Cliente activo' : 'Cliente inactivo'" />
              <dl class="dl">
                <dt>Identificación</dt><dd>{{ f.tipo_documento === 'CC' ? 'Cédula de ciudadanía' : f.tipo_documento }} · {{ doc(f.documento) }}</dd>
                <dt>Celular</dt><dd>{{ f.telefono ? '+57 ' + tel(f.telefono) : '—' }}</dd>
                <dt>Correo electrónico</dt><dd>{{ f.email ?? '—' }}</dd>
                <dt>Dirección</dt><dd>{{ f.direccion ?? '—' }}</dd>
              </dl>
            </div>
            @for (v of f.vehiculos; track v.placa) {
              <div class="card">
                <h2 class="card-title" style="margin-bottom: 16px">Vehículo y mensualidad</h2>
                <div style="display: flex; gap: 12px; align-items: center">
                  <span class="kpi-icon"><app-icon name="car" /></span>
                  <div><span class="chip-placa">{{ v.placa }}</span><div class="muted" style="font-size: 11.5px; margin-top: 6px">{{ v.marca }} {{ v.linea }} · {{ v.color }} · {{ v.anio_modelo }}</div></div>
                </div>
                <hr class="sep">
                @if (v.mensualidad) {
                  <div style="display: flex; justify-content: space-between; align-items: center">
                    <b>{{ v.mensualidad }} · Celda {{ v.celda }}</b>
                    @if (v.estado_pago) { <app-badge [estado]="v.estado_pago" /> }
                  </div>
                  <p class="muted" style="margin: 14px 0; font-size: 12.5px">{{ fecha(v.fecha_inicio) }} – {{ fecha(v.fecha_fin) }} · {{ cop(v.valor_mensual) }} COP</p>
                  <div style="display: flex; justify-content: space-between"><span>Saldo pendiente</span>
                    <b [style.color]="(v.saldo ?? 0) > 0 ? 'var(--amber)' : 'var(--brand)'">{{ cop(v.saldo) }} COP</b></div>
                  <a class="btn btn-outline" style="margin-top: 18px" routerLink="/pagos" [queryParams]="{ q: v.placa }"><app-icon name="receipt" />Ver pagos y cobros</a>
                } @else { <p class="muted">Este vehículo no tiene una mensualidad asignada.</p> }
              </div>
            }
          } @else {
            <div class="card muted">Selecciona un cliente para ver su ficha.</div>
          }
        </div>
      </div>
    </section>

    @if (nuevo()) {
      <app-dialog titulo="Nuevo cliente" [ancho]="true" (cerrar)="nuevo.set(false)">
        <form [formGroup]="formNuevo" (ngSubmit)="crear()">
          <div class="row2">
            <div class="field"><label for="n-nom">Nombre completo</label><input id="n-nom" formControlName="nombre"></div>
            <div class="field"><label for="n-doc">Documento</label>
              <div class="row2" style="grid-template-columns: 90px 1fr"><select formControlName="tipo_documento" aria-label="Tipo"><option>CC</option><option>CE</option><option>NIT</option><option>PAS</option></select>
              <input id="n-doc" formControlName="documento"></div></div>
          </div>
          <div class="row2">
            <div class="field"><label for="n-tel">Celular</label><input id="n-tel" formControlName="telefono" inputmode="tel"></div>
            <div class="field"><label for="n-mail">Correo electrónico</label><input id="n-mail" type="email" formControlName="email">
              @if (formNuevo.controls.email.invalid && formNuevo.controls.email.dirty) { <span class="err">Correo no válido</span> }</div>
          </div>
          <div class="field"><label for="n-dir">Dirección</label><input id="n-dir" formControlName="direccion"></div>
          <div class="section-label" style="margin-top: 4px">Vehículo principal (opcional)</div>
          <div class="row2">
            <div class="field"><label for="n-pla">Placa</label><input id="n-pla" formControlName="placa" maxlength="10" placeholder="ABC123">
              @if (formNuevo.controls.placa.invalid) { <span class="err">Entre 5 y 8 letras o números</span> }</div>
            <div class="field"><label for="n-tip">Tipo</label><select id="n-tip" formControlName="tipo"><option value="CARRO">Carro</option><option value="MOTO">Moto</option></select></div>
          </div>
          <div class="row2">
            <div class="field"><label for="n-mar">Marca</label><input id="n-mar" formControlName="marca"></div>
            <div class="field"><label for="n-lin">Línea</label><input id="n-lin" formControlName="linea"></div>
          </div>
          <div class="row2">
            <div class="field"><label for="n-col">Color</label><input id="n-col" formControlName="color"></div>
            <div class="field"><label for="n-ano">Año modelo</label><input id="n-ano" type="number" formControlName="anio"></div>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-outline" (click)="nuevo.set(false)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="formNuevo.invalid || guardando()">Guardar cliente</button>
          </div>
        </form>
      </app-dialog>
    }

    @if (editando(); as f) {
      <app-dialog titulo="Editar cliente" (cerrar)="editando.set(null)">
        <form [formGroup]="formEdit" (ngSubmit)="guardarEdicion(f.id_usuario)">
          <div class="field"><label for="e-nom">Nombre completo</label><input id="e-nom" formControlName="nombre"></div>
          <div class="field"><label for="e-tel">Celular</label><input id="e-tel" formControlName="telefono"></div>
          <div class="field"><label for="e-mail">Correo electrónico</label><input id="e-mail" type="email" formControlName="email"></div>
          <div class="field"><label for="e-dir">Dirección</label><input id="e-dir" formControlName="direccion"></div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-outline" (click)="editando.set(null)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="formEdit.invalid || guardando()">Guardar cambios</button>
          </div>
        </form>
      </app-dialog>
    }`,
  styles: [`
    .dl { display: grid; gap: 4px; margin: 18px 0 0; }
    .dl dt { color: var(--muted); font-size: 11.5px; margin-top: 12px; }
    .dl dd { margin: 4px 0 0; font-weight: 500; }`],
})
export class ClientesComponent {
  private api = inject(ClientesService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);

  readonly tab = signal<Tab>('clientes');
  readonly q = new FormControl('', { nonNullable: true });
  readonly estado = new FormControl('', { nonNullable: true });
  readonly pag = signal(1);
  readonly kpis = signal({ clientes: 0, vehiculos: 0, mensualidades_activas: 0 });
  readonly clientes = signal<Pagina<ClienteFila>>({ total: 0, page: 1, per_page: 8, items: [] });
  readonly vehiculos = signal<Pagina<VehiculoFila>>({ total: 0, page: 1, per_page: 8, items: [] });
  readonly ficha = signal<Ficha | null>(null);
  readonly nuevo = signal(false);
  readonly editando = signal<Ficha | null>(null);
  readonly guardando = signal(false);

  readonly fecha = fecha; readonly cop = cop; readonly iniciales = iniciales; readonly doc = docFmt; readonly tel = telFmt;

  readonly formNuevo = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    tipo_documento: ['CC'], documento: ['', [Validators.required, Validators.minLength(3)]],
    telefono: [''], email: ['', Validators.email], direccion: [''],
    placa: ['', Validators.pattern(/^[A-Za-z0-9\s-]{0,10}$/)], tipo: ['CARRO'], marca: [''], linea: [''], color: [''],
    anio: this.fb.control<number | null>(null),
  });
  readonly formEdit = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]], telefono: [''], email: ['', Validators.email], direccion: [''],
  });

  constructor() {
    this.q.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => { this.pag.set(1); this.cargar(); });
    this.estado.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { this.pag.set(1); this.cargar(); });
    this.cargar(true);
  }

  cambiarTab(t: Tab): void { this.tab.set(t); this.pag.set(1); this.cargar(); }

  cargar(primera = false): void {
    if (this.tab() === 'clientes') {
      this.api.listar(this.q.value, this.estado.value, this.pag()).subscribe((r: ClientesResp) => {
        this.clientes.set(r); this.kpis.set(r.kpis);
        if (primera && r.items.length) this.seleccionar(r.items[0].id_usuario);
      });
    } else {
      this.api.vehiculos(this.q.value, this.pag()).subscribe(r => this.vehiculos.set(r));
    }
  }

  seleccionar(id: number): void { this.api.ficha(id).subscribe(f => this.ficha.set(f)); }
  irACliente(id: number): void { this.tab.set('clientes'); this.seleccionar(id); }

  crear(): void {
    if (this.formNuevo.invalid) return;
    const v = this.formNuevo.getRawValue();
    const placa = normalizarPlaca(v.placa);
    this.guardando.set(true);
    this.api.crear({
      nombre: v.nombre, tipo_documento: v.tipo_documento, documento: v.documento,
      telefono: v.telefono || null, email: v.email || null, direccion: v.direccion || null,
      vehiculos: placa ? [{ placa, tipo: v.tipo, marca: v.marca || null, linea: v.linea || null, color: v.color || null, anio_modelo: v.anio }] : [],
    }).subscribe({
      next: f => {
        this.guardando.set(false); this.nuevo.set(false); this.formNuevo.reset({ tipo_documento: 'CC', tipo: 'CARRO' });
        this.toast.ok(`Cliente ${f.nombre} registrado`); this.ficha.set(f); this.cargar();
      },
      error: e => { this.guardando.set(false); this.toast.error(e); },
    });
  }

  abrirEdicion(f: Ficha): void {
    this.formEdit.reset({ nombre: f.nombre, telefono: f.telefono ?? '', email: f.email ?? '', direccion: f.direccion ?? '' });
    this.editando.set(f);
  }

  guardarEdicion(id: number): void {
    const v = this.formEdit.getRawValue();
    this.guardando.set(true);
    this.api.actualizar(id, { nombre: v.nombre, telefono: v.telefono || null, email: v.email || null, direccion: v.direccion || null })
      .subscribe({
        next: f => { this.guardando.set(false); this.editando.set(null); this.ficha.set(f); this.toast.ok('Cliente actualizado'); this.cargar(); },
        error: e => { this.guardando.set(false); this.toast.error(e); },
      });
  }
}
