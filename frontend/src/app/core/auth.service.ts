import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResp, Operador } from './models';

const KEY_TOKEN = 'ac_token';
const KEY_OP = 'ac_operador';

function leer(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function escribir(k: string, v: string | null): void {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin storage */ }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly token = signal<string | null>(leer(KEY_TOKEN));
  readonly operador = signal<Operador | null>(this.cargarOperador());
  readonly autenticado = computed(() => !!this.token() && !!this.operador());
  readonly esAdmin = computed(() => this.operador()?.rol === 'ADMIN');
  readonly iniciales = computed(() =>
    (this.operador()?.nombre ?? '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase());

  private cargarOperador(): Operador | null {
    const raw = leer(KEY_OP);
    try { return raw ? (JSON.parse(raw) as Operador) : null; } catch { return null; }
  }

  login(usuario: string, clave: string) {
    return this.http.post<LoginResp>(`${environment.apiUrl}/auth/login`, { usuario, clave }).pipe(
      tap(r => {
        escribir(KEY_TOKEN, r.token);
        escribir(KEY_OP, JSON.stringify(r.operador));
        this.token.set(r.token);
        this.operador.set(r.operador);
      }));
  }

  logout(): void {
    escribir(KEY_TOKEN, null);
    escribir(KEY_OP, null);
    this.token.set(null);
    this.operador.set(null);
    void this.router.navigateByUrl('/login');
  }
}
