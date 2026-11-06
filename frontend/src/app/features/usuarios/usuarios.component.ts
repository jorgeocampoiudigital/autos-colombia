import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { UsuariosService, faltantesClave, generarClaveTemporal } from '../../core/api/usuarios.service';
import { AuthService } from '../../core/auth.service';
import { fecha, hora, iniciales } from '../../core/formato';
import { Rol, UsuarioSistema, UsuariosResp } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { DialogComponent } from '../../shared/dialog.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <div class="page-head">
        <div><h1>Usuarios y roles</h1><p>Personal que opera el sistema y lo que cada uno puede hacer.</p></div>
        <div class="acciones"><button type="button" class="btn btn-primary" (click)="abrirNuevo()"><app-icon name="plus" />Nuevo usuario</button></div>
      </div>

      <div class="kpis c3">
        <div class="card kpi"><span class="kpi-icon"><app-icon name="users" /></span><span class="big" style="color: var(--ink)">{{ datos().resumen.total }}</span><span class="muted">Usuarios registrados</span></div>
        <div class="card kpi"><span class="kpi-icon"><app-icon name="check" /></span><span class="big" style="color: var(--ink)">{{ datos().resumen.activos }}</span><span class="muted">Usuarios activos</span></div>
        <div class="card kpi"><span class="kpi-icon"><app-icon name="shield" /></span><span class="big" style="color: var(--ink)">{{ datos().resumen.administradores }}</span><span class="muted">Administradores activos</span></div>
      </div>

      <div class="grid col-main-side">
        <div class="card">
          <div class="toolbar">
            <div class="input-icon"><app-icon name="search" /><input [formControl]="q" placeholder="Buscar por nombre o usuario"></div>
            <select [formControl]="rol" aria-label="Filtrar por rol">
              <option value="">Todos los roles</option><option value="ADMIN">Administradores</option><option value="OPERADOR">Operadores</option>
            </select>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead>
              <tbody>
                @for (u of datos().items; track u.id) {
                  <tr [style.opacity]="u.activo ? 1 : .6">
                    <td><div style="display: flex; gap: 10px; align-items: center">
                      <span class="avatar" [class.on]="u.rol === 'ADMIN'">{{ iniciales(u.nombre) }}</span>
                      <div><div class="name">{{ u.nombre }} @if (u.id === auth.operador()?.id) { <span class="muted" style="font-weight: 400">(tú)</span> }</div>
                        <div class="sub">{{ u.usuario }}</div></div></div></td>
                    <td><span class="badge" [class.info]="u.rol === 'ADMIN'" [class.muted]="u.rol !== 'ADMIN'">{{ u.rol === 'ADMIN' ? 'Administrador' : 'Operador' }}</span></td>
                    <td>
                      @if (!u.activo) { <span class="badge muted"><i class="dot"></i>Inactivo</span> }
                      @else if (u.bloqueado) { <span class="badge warn"><i class="dot"></i>Bloqueado</span> }
                      @else if (u.debe_cambiar_clave) { <span class="badge info"><i class="dot"></i>Clave temporal</span> }
                      @else { <span class="badge ok"><i class="dot"></i>Activo</span> }
                    </td>
                    <td>@if (u.ultimo_acceso) { {{ fecha(u.ultimo_acceso) }} <div class="sub">{{ hora(u.ultimo_acceso) }}</div> } @else { <span class="muted">Nunca</span> }</td>
                    <td style="white-space: nowrap; text-align: right">
                      @if (u.bloqueado) { <button type="button" class="btn btn-outline btn-sm" (click)="desbloquear(u)">Desbloquear</button> }
                      <button type="button" class="btn btn-outline btn-sm" (click)="abrirEdicion(u)" title="Editar nombre y rol">Editar</button>
                      <button type="button" class="btn btn-outline btn-sm" (click)="abrirClave(u)" title="Asignar contraseña temporal">Clave</button>
                      @if (u.id !== auth.operador()?.id) {
                        <button type="button" class="btn btn-outline btn-sm" [disabled]="guardando()" (click)="cambiarActivo(u)">{{ u.activo ? 'Desactivar' : 'Activar' }}</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="muted">No hay usuarios con ese filtro.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <h2 class="card-title">Roles</h2>
            <dl class="dl">
              <dt><span class="badge info">Administrador</span></dt>
              <dd>Todo lo del operador, más: mensualidades, celdas (mantenimiento) y usuarios del sistema.</dd>
              <dt><span class="badge muted">Operador</span></dt>
              <dd>Entradas y salidas, clientes y vehículos, pagos, novedades y consultas.</dd>
            </dl>
            <p class="note">Siempre debe quedar al menos un administrador activo. Nadie puede desactivarse ni cambiar su propio rol.</p>
            <p class="note">Tras 5 intentos fallidos el usuario se bloquea 15 minutos. Asignar una clave temporal también lo desbloquea.</p>
          </div>
        </div>
      </div>
    </section>

    @if (nuevo()) {
      <app-dialog titulo="Nuevo usuario" (cerrar)="nuevo.set(false)">
        <form [formGroup]="formNuevo" (ngSubmit)="crear()">
          <div class="field"><label for="u-nom">Nombre completo</label><input id="u-nom" formControlName="nombre"></div>
          <div class="field"><label for="u-usr">Usuario</label><input id="u-usr" formControlName="usuario" autocomplete="off">
            <span class="hint">Minúsculas, números, punto o guion bajo (3 a 30). Ej. scardona</span></div>
          <div class="field"><span class="lbl">Rol</span>
            <div class="tabs seg" style="margin: 0">
              <button type="button" class="btn btn-sm" [class.btn-primary]="formNuevo.controls.rol.value === 'OPERADOR'" [class.btn-outline]="formNuevo.controls.rol.value !== 'OPERADOR'" (click)="formNuevo.controls.rol.setValue('OPERADOR')">Operador</button>
              <button type="button" class="btn btn-sm" [class.btn-primary]="formNuevo.controls.rol.value === 'ADMIN'" [class.btn-outline]="formNuevo.controls.rol.value !== 'ADMIN'" (click)="formNuevo.controls.rol.setValue('ADMIN')">Administrador</button>
            </div></div>
          <div class="field"><label for="u-cla">Contraseña temporal</label>
            <div style="display: flex; gap: 8px"><input id="u-cla" formControlName="clave" autocomplete="off" style="flex: 1">
              <button type="button" class="btn btn-outline btn-sm" (click)="formNuevo.controls.clave.setValue(generar())">Generar</button></div>
            @if (faltanNuevo().length && claveNuevo().length) { <span class="err">Le falta: {{ faltanNuevo().join(', ') }}</span> }
            @else { <span class="hint">Entrégala al usuario: deberá cambiarla en su primer ingreso.</span> }</div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-outline" (click)="nuevo.set(false)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="formNuevo.invalid || faltanNuevo().length > 0 || guardando()">Crear usuario</button>
          </div>
        </form>
      </app-dialog>
    }

    @if (editando(); as u) {
      <app-dialog [titulo]="'Editar ' + u.usuario" (cerrar)="editando.set(null)">
        <form [formGroup]="formEdit" (ngSubmit)="guardarEdicion(u)">
          <div class="field"><label for="e-nom">Nombre completo</label><input id="e-nom" formControlName="nombre"></div>
          <div class="field"><label for="e-rol">Rol</label>
            <select id="e-rol" formControlName="rol"><option value="OPERADOR">Operador</option><option value="ADMIN">Administrador</option></select>
            @if (u.id === auth.operador()?.id) { <span class="hint">No puedes cambiar tu propio rol.</span> }</div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-outline" (click)="editando.set(null)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="formEdit.invalid || guardando()">Guardar cambios</button>
          </div>
        </form>
      </app-dialog>
    }

    @if (claveDe(); as u) {
      <app-dialog [titulo]="'Contraseña temporal para ' + u.usuario" (cerrar)="claveDe.set(null)">
        <p class="muted" style="margin-bottom: 16px">La contraseña actual deja de funcionar, se levanta cualquier bloqueo y {{ u.nombre }} deberá cambiarla al ingresar.</p>
        <div class="field"><label for="r-cla">Nueva contraseña temporal</label>
          <div style="display: flex; gap: 8px"><input id="r-cla" [formControl]="claveTemporal" autocomplete="off" style="flex: 1">
            <button type="button" class="btn btn-outline btn-sm" (click)="claveTemporal.setValue(generar())">Generar</button></div>
          @if (faltanTemporal().length && claveTemporalV().length) { <span class="err">Le falta: {{ faltanTemporal().join(', ') }}</span> }</div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-outline" (click)="claveDe.set(null)">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="faltanTemporal().length > 0 || guardando()" (click)="restablecer(u)">Asignar contraseña</button>
        </div>
      </app-dialog>
    }`,
  styles: [`
    .dl { display: grid; gap: 4px; margin: 6px 0 0; }
    .dl dt { margin-top: 12px; }
    .dl dd { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); }
    .tbl td .btn-sm + .btn-sm { margin-left: 6px; }`],
})
export class UsuariosComponent {
  readonly auth = inject(AuthService);
  private api = inject(UsuariosService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);

  readonly fecha = fecha; readonly hora = hora; readonly iniciales = iniciales; readonly generar = () => generarClaveTemporal();

  readonly q = new FormControl('', { nonNullable: true });
  readonly rol = new FormControl('', { nonNullable: true });
  readonly datos = signal<UsuariosResp>({ items: [], resumen: { total: 0, activos: 0, administradores: 0 } });
  readonly guardando = signal(false);
  readonly nuevo = signal(false);
  readonly editando = signal<UsuarioSistema | null>(null);
  readonly claveDe = signal<UsuarioSistema | null>(null);

  readonly formNuevo = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    usuario: ['', [Validators.required, Validators.pattern(/^\s*[A-Za-z0-9._]{3,30}\s*$/)]],
    rol: this.fb.nonNullable.control<Rol>('OPERADOR'),
    clave: ['', Validators.required],
  });
  readonly claveNuevo = toSignal(this.formNuevo.controls.clave.valueChanges, { initialValue: '' });
  readonly faltanNuevo = computed(() => faltantesClave(this.claveNuevo()));

  readonly formEdit = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    rol: this.fb.nonNullable.control<Rol>('OPERADOR'),
  });

  readonly claveTemporal = new FormControl('', { nonNullable: true });
  readonly claveTemporalV = toSignal(this.claveTemporal.valueChanges, { initialValue: '' });
  readonly faltanTemporal = computed(() => faltantesClave(this.claveTemporalV()));

  constructor() {
    this.q.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.cargar());
    this.rol.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cargar());
    this.cargar();
  }

  cargar(): void { this.api.listar(this.q.value, this.rol.value).subscribe(r => this.datos.set(r)); }

  abrirNuevo(): void {
    this.formNuevo.reset({ nombre: '', usuario: '', rol: 'OPERADOR', clave: generarClaveTemporal() });
    this.nuevo.set(true);
  }

  crear(): void {
    if (this.formNuevo.invalid || this.faltanNuevo().length) return;
    const v = this.formNuevo.getRawValue();
    this.ejecutar(this.api.crear({ nombre: v.nombre.trim(), usuario: v.usuario.trim().toLowerCase(), rol: v.rol, clave_temporal: v.clave }),
      u => { this.nuevo.set(false); this.toast.ok(`Usuario ${u.usuario} creado con clave temporal`); });
  }

  abrirEdicion(u: UsuarioSistema): void {
    this.formEdit.reset({ nombre: u.nombre, rol: u.rol });
    if (u.id === this.auth.operador()?.id) this.formEdit.controls.rol.disable(); else this.formEdit.controls.rol.enable();
    this.editando.set(u);
  }

  guardarEdicion(u: UsuarioSistema): void {
    const v = this.formEdit.getRawValue();
    const cambios = u.id === this.auth.operador()?.id ? { nombre: v.nombre.trim() } : { nombre: v.nombre.trim(), rol: v.rol };
    this.ejecutar(this.api.actualizar(u.id, cambios), () => { this.editando.set(null); this.toast.ok('Usuario actualizado'); });
  }

  cambiarActivo(u: UsuarioSistema): void {
    this.ejecutar(this.api.actualizar(u.id, { activo: !u.activo }),
      r => this.toast.ok(r.activo ? `${r.usuario} quedó activo` : `${r.usuario} quedó inactivo y perdió el acceso`));
  }

  abrirClave(u: UsuarioSistema): void {
    this.claveTemporal.setValue(generarClaveTemporal());
    this.claveDe.set(u);
  }

  restablecer(u: UsuarioSistema): void {
    this.ejecutar(this.api.restablecerClave(u.id, this.claveTemporal.value),
      r => { this.claveDe.set(null); this.toast.ok(`Contraseña temporal asignada a ${r.usuario}`); });
  }

  desbloquear(u: UsuarioSistema): void {
    this.ejecutar(this.api.desbloquear(u.id), r => this.toast.ok(`${r.usuario} desbloqueado`));
  }

  private ejecutar(obs: ReturnType<UsuariosService['actualizar']>, ok: (u: UsuarioSistema) => void): void {
    this.guardando.set(true);
    obs.subscribe({
      next: u => {
        this.guardando.set(false); ok(u); this.cargar();
        if (u.id === this.auth.operador()?.id) this.auth.refrescarPerfil().subscribe();
      },
      error: e => { this.guardando.set(false); this.toast.error(e); },
    });
  }
}
