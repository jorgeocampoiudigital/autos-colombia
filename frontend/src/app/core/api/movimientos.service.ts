import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { params } from '../http-util';
import { ConsultaPlaca, EventoHistorial, KpisHoy, Movimiento, Pagina } from '../models';

@Injectable({ providedIn: 'root' })
export class MovimientosService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/movimientos`;

  consultarPlaca(placa: string) { return this.http.get<ConsultaPlaca>(`${this.base}/placa/${encodeURIComponent(placa)}`); }
  entrada(placa: string, id_celda: number | null) {
    return this.http.post<Movimiento>(`${this.base}/entrada`, { placa, id_celda });
  }
  salida(placa: string) { return this.http.post<Movimiento>(`${this.base}/salida`, { placa }); }
  presentes(q: string, celda: string, page = 1, per_page = 5) {
    return this.http.get<Pagina<Movimiento>>(`${this.base}/presentes`, { params: params({ q, celda, page, per_page }) });
  }
  historial(f: { placa?: string; desde?: string; hasta?: string; page?: number; per_page?: number }) {
    return this.http.get<Pagina<EventoHistorial>>(`${this.base}/historial`, { params: params(f) });
  }
  kpis() { return this.http.get<KpisHoy>(`${this.base}/kpis`); }
}
