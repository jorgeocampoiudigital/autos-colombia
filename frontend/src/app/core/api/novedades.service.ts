import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { params } from '../http-util';
import { EstadoNovedad, Novedad, NovedadesResp, TipoNovedad } from '../models';

export interface NuevaNovedad {
  placa: string; tipo: TipoNovedad; descripcion: string;
  evidencias: { nombre: string; url: string; mime_type: string | null }[];
}

@Injectable({ providedIn: 'root' })
export class NovedadesService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/novedades`;

  listar(f: { tab?: string; q?: string; periodo?: string; page?: number; per_page?: number }) {
    return this.http.get<NovedadesResp>(this.base, { params: params(f) });
  }
  kpis() { return this.http.get<{ abiertas: number; seguimiento: number; cerradas_mes: number }>(`${this.base}/kpis`); }
  obtener(id: number) { return this.http.get<Novedad>(`${this.base}/${id}`); }
  crear(n: NuevaNovedad) { return this.http.post<Novedad>(this.base, n); }
  cambiarEstado(id: number, estado: EstadoNovedad, comentario?: string) {
    return this.http.patch<Novedad>(`${this.base}/${id}/estado`, { estado, comentario });
  }
}
