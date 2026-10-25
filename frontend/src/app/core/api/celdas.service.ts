import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CeldaDetalle, CeldasResp } from '../models';

@Injectable({ providedIn: 'root' })
export class CeldasService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/celdas`;

  listar() { return this.http.get<CeldasResp>(this.base); }
  detalle(id: number) { return this.http.get<CeldaDetalle>(`${this.base}/${id}`); }
  mantenimiento(id: number, motivo: string) { return this.http.post<CeldaDetalle>(`${this.base}/${id}/mantenimiento`, { motivo }); }
  habilitar(id: number) { return this.http.post<CeldaDetalle>(`${this.base}/${id}/habilitar`, {}); }
}
