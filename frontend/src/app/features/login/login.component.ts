import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login">
      <form class="box" [formGroup]="form" (ngSubmit)="entrar()">
        <div class="brand"><div class="logo">P</div><div><b>Autos Colombia</b><small>GESTIÓN DE PARQUEADERO</small></div></div>
        <h1>Iniciar sesión</h1>
        <p class="muted" style="margin-bottom: 22px">Ingresa con tu usuario de operador.</p>
        <div class="field"><label for="u">Usuario</label>
          <input id="u" formControlName="usuario" autocomplete="username" autofocus></div>
        <div class="field"><label for="c">Contraseña</label>
          <input id="c" type="password" formControlName="clave" autocomplete="current-password"></div>
        <button class="btn btn-primary" style="width: 100%" [disabled]="form.invalid || cargando()">
          {{ cargando() ? 'Ingresando…' : 'Ingresar' }}</button>
      </form>
    </div>`,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly cargando = signal(false);
  readonly form = this.fb.nonNullable.group({
    usuario: ['', Validators.required], clave: ['', Validators.required],
  });

  entrar(): void {
    if (this.form.invalid) return;
    const { usuario, clave } = this.form.getRawValue();
    this.cargando.set(true);
    this.auth.login(usuario, clave).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: e => { this.cargando.set(false); this.toast.error(e); },
    });
  }
}
