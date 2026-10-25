import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CeldasService } from '../core/api/celdas.service';
import { ClientesService } from '../core/api/clientes.service';
import { hoyISO } from '../core/formato';
import { CeldaResumen, ClienteFila, Ficha } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DialogComponent } from './dialog.component';

/** Asignar mensualidad: cliente → vehículo → celda libre → periodo y valor. */
@Component({
  selector: 'app-mensualidad-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dialog titulo="Asignar mensualidad" (cerrar)="cerrar.emit()">
      <form [formGroup]="form" (ngSubmit)="guardar()">
        <div class="field"><label for="m-cli">Cliente</label>
          <select id="m-cli" formControlName="id_usuario">
            <option [ngValue]="null" disabled>Selecciona un cliente</option>
            @for (c of clientes(); track c.id_usuario) { <option [ngValue]="c.id_usuario">{{ c.nombre }} · {{ c.documento }}</option> }
          </select></div>
        <div class="field"><label for="m-pla">Vehículo</label>
          <select id="m-pla" formControlName="placa">
            <option value="" disabled>{{ ficha() ? 'Selecciona un vehículo' : 'Primero elige un cliente' }}</option>
            @for (v of ficha()?.vehiculos ?? []; track v.placa) { <option [value]="v.placa">{{ v.placa }} · {{ v.marca }} {{ v.linea }}</option> }
          </select></div>
        <div class="field"><label for="m-cel">Celda</label>
          <select id="m-cel" formControlName="id_celda">
            <option [ngValue]="null" disabled>Selecciona una celda disponible</option>
            @for (c of celdasLibres(); track c.id_celda) { <option [ngValue]="c.id_celda">{{ c.codigo }} · Fila {{ c.fila }}</option> }
          </select>
          <span class="hint">Solo se listan celdas disponibles (sin asignación y habilitadas).</span></div>
        <div class="row2">
          <div class="field"><label for="m-ini">Inicio de vigencia</label><input id="m-ini" type="date" formControlName="fecha_inicio">
            <span class="hint">Vence al final de ese mes.</span></div>
          <div class="field"><label for="m-val">Valor mensual · COP</label><input id="m-val" type="number" min="1" step="1000" formControlName="valor_mensual"></div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-outline" (click)="cerrar.emit()">Cancelar</button>
          <button class="btn btn-primary" [disabled]="form.invalid || guardando()">{{ guardando() ? 'Guardando…' : 'Asignar mensualidad' }}</button>
        </div>
      </form>
    </app-dialog>`,
})
export class MensualidadDialogComponent {
  private fb = inject(FormBuilder);
  private clientesApi = inject(ClientesService);
  private celdasApi = inject(CeldasService);
  private toast = inject(ToastService);

  readonly cerrar = output<void>();
  readonly creada = output<void>();

  readonly clientes = signal<ClienteFila[]>([]);
  readonly celdas = signal<CeldaResumen[]>([]);
  readonly ficha = signal<Ficha | null>(null);
  readonly guardando = signal(false);
  readonly celdasLibres = computed(() => this.celdas().filter(c => c.estado === 'DISPONIBLE'));

  readonly form = this.fb.group({
    id_usuario: this.fb.control<number | null>(null, Validators.required),
    placa: this.fb.nonNullable.control('', Validators.required),
    id_celda: this.fb.control<number | null>(null, Validators.required),
    fecha_inicio: this.fb.nonNullable.control(hoyISO(), Validators.required),
    valor_mensual: this.fb.nonNullable.control(300000, [Validators.required, Validators.min(1)]),
  });
  private idUsuario = toSignal(this.form.controls.id_usuario.valueChanges, { initialValue: null });

  constructor() {
    this.clientesApi.listar('', '', 1, 100).subscribe(r => this.clientes.set(r.items));
    this.celdasApi.listar().subscribe(r => this.celdas.set(r.celdas));
    this.form.controls.id_usuario.valueChanges.subscribe(id => {
      this.form.controls.placa.setValue('');
      this.ficha.set(null);
      if (id) this.clientesApi.ficha(id).subscribe(f => this.ficha.set(f));
    });
  }

  guardar(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.clientesApi.asignarMensualidad({
      id_usuario: v.id_usuario!, placa: v.placa, id_celda: v.id_celda!, fecha_inicio: v.fecha_inicio, valor_mensual: v.valor_mensual,
    }).subscribe({
      next: m => { this.toast.ok(`Mensualidad ${m.codigo} asignada a ${m.celda}`); this.guardando.set(false); this.creada.emit(); this.cerrar.emit(); },
      error: e => { this.guardando.set(false); this.toast.error(e); },
    });
  }
}
