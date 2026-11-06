import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { params } from '../http-util';
import { Rol, UsuarioSistema, UsuariosResp } from '../models';

export interface NuevoUsuario { nombre: string; usuario: string; rol: Rol; clave_temporal: string; }
export type CambioUsuario = Partial<Pick<UsuarioSistema, 'nombre' | 'rol' | 'activo'>>;

/** Administración de usuarios del sistema (solo ADMIN). */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/usuarios`;

  listar(q: string, rol: string) { return this.http.get<UsuariosResp>(this.base, { params: params({ q, rol }) }); }
  crear(u: NuevoUsuario) { return this.http.post<UsuarioSistema>(this.base, u); }
  actualizar(id: number, c: CambioUsuario) { return this.http.patch<UsuarioSistema>(`${this.base}/${id}`, c); }
  restablecerClave(id: number, clave_temporal: string) {
    return this.http.post<UsuarioSistema>(`${this.base}/${id}/restablecer-clave`, { clave_temporal });
  }
  desbloquear(id: number) { return this.http.post<UsuarioSistema>(`${this.base}/${id}/desbloquear`, {}); }
}

/** Contraseña temporal aleatoria que cumple la política (mayúscula, minúscula, número y símbolo). */
export function generarClaveTemporal(largo = 12): string {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '*#$%&@!?'];
  const todos = grupos.join('');
  const azar = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = grupos.map(g => g[azar(g.length)]);
  while (chars.length < largo) chars.push(todos[azar(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = azar(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

/** Misma política que el backend; devuelve lo que falta o null si cumple. */
export function faltantesClave(c: string): string[] {
  const f: string[] = [];
  if (c.length < 8) f.push('mínimo 8 caracteres');
  if (!/[A-ZÁÉÍÓÚÑ]/.test(c)) f.push('una mayúscula');
  if (!/[a-záéíóúñ]/.test(c)) f.push('una minúscula');
  if (!/\d/.test(c)) f.push('un número');
  if (!/[^\w\s]/.test(c)) f.push('un símbolo');
  return f;
}
