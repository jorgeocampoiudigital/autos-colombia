import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { faltantesClave } from '../../core/api/usuarios.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-cambiar-clave',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <div class="page-head">
        <div><h1>Cambiar contraseña</h1>
          <p>{{ auth.debeCambiarClave() ? 'Tu contraseña es temporal: cámbiala para poder usar el sistema.' : 'Actualiza la contraseña con la que ingresas.' }}</p></div>
      </div>
      <div class="card" style="max-width: 520px">
        <form [formGroup]="form" (ngSubmit)="guardar()">
          <div class="field"><label for="c-act">Contraseña actual</label>
            <input id="c-act" type="password" formControlName="actual" autocomplete="current-password"></div>
          <div class="field"><label for="c-nue">Nueva contraseña</label>
            <input id="c-nue" type="password" formControlName="nueva" autocomplete="new-password">
            @if (nueva().length && faltan().length) { <span class="err">Le falta: {{ faltan().join(', ') }}</span> }
            @else { <span class="hint">Mínimo 8 caracteres con mayúscula, minúscula, número y símbolo.</span> }</div>
          <div class="field"><label for="c-con">Confirmar nueva contraseña</label>
            <input id="c-con" type="password" formControlName="confirmacion" autocomplete="new-password">
            @if (confirmacion().length && confirmacion() !== nueva()) { <span class="err">No coincide con la nueva contraseña</span> }</div>
          <div class="dialog-actions">
            @if (!auth.debeCambiarClave()) { <button type="button" class="btn btn-outline" (click)="volver()">Cancelar</button> }
            @else { <button type="button" class="btn btn-outline" (click)="auth.logout()">Cerrar sesión</button> }
            <button class="btn btn-primary" [disabled]="!valido() || guardando()">Guardar contraseña</button>
          </div>
        </form>
      </div>
    </section>`,
})
export class CambiarClaveComponent {
  readonly auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly guardando = signal(false);
  readonly form = this.fb.nonNullable.group({
    actual: ['', Validators.required], nueva: ['', Validators.required], confirmacion: ['', Validators.required],
  });
  readonly nueva = toSignal(this.form.controls.nueva.valueChanges, { initialValue: '' });
  readonly confirmacion = toSignal(this.form.controls.confirmacion.valueChanges, { initialValue: '' });
  private readonly actual = toSignal(this.form.controls.actual.valueChanges, { initialValue: '' });
  readonly faltan = computed(() => faltantesClave(this.nueva()));
  readonly valido = computed(() =>
    !!this.actual() && !this.faltan().length && this.nueva() === this.confirmacion() && this.nueva() !== this.actual());

  guardar(): void {
    if (!this.valido()) return;
    const { actual, nueva } = this.form.getRawValue();
    this.guardando.set(true);
    this.auth.cambiarClave(actual, nueva).subscribe({
      next: () => { this.guardando.set(false); this.toast.ok('Contraseña actualizada'); void this.router.navigateByUrl('/'); },
      error: e => { this.guardando.set(false); this.toast.error(e); },
    });
  }

  volver(): void { void this.router.navigateByUrl('/'); }
}
