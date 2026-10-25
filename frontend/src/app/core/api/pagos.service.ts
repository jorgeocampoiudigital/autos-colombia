import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { params } from '../http-util';
import { Cobro, KpisPagos, MedioPago, Pagina, Pago } from '../models';

export interface NuevoPago {
  id_cobro: number; valor: number; fecha_pago?: string; medio: MedioPago;
  referencia?: string | null; soporte_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PagosService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  kpis(periodo: string) { return this.http.get<KpisPagos>(`${this.api}/pagos/kpis`, { params: params({ periodo }) }); }
  cobros(f: { q?: string; estado?: string; periodo?: string; pendientes?: boolean; page?: number; per_page?: number }) {
    return this.http.get<Pagina<Cobro>>(`${this.api}/cobros`, { params: params(f) });
  }
  pagos(f: { q?: string; periodo?: string; page?: number; per_page?: number }) {
    return this.http.get<Pagina<Pago>>(`${this.api}/pagos`, { params: params(f) });
  }
  registrar(p: NuevoPago) { return this.http.post<{ pago: Pago; cobro: Cobro }>(`${this.api}/pagos`, p); }
}
