import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { params } from '../http-util';
import { ClientesResp, Ficha, MensualidadFila, Pagina, VehiculoFila } from '../models';

export interface NuevoCliente {
  nombre: string; tipo_documento: string; documento: string; telefono?: string | null;
  email?: string | null; direccion?: string | null;
  vehiculos: { placa: string; tipo: string; marca?: string | null; linea?: string | null; color?: string | null; anio_modelo?: number | null }[];
}
export interface NuevaMensualidad {
  id_usuario: number; placa: string; id_celda: number; fecha_inicio: string; valor_mensual?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  listar(q: string, estado_pago: string, page = 1, per_page = 8) {
    return this.http.get<ClientesResp>(`${this.api}/clientes`, { params: params({ q, estado_pago, page, per_page }) });
  }
  ficha(id: number) { return this.http.get<Ficha>(`${this.api}/clientes/${id}`); }
  crear(c: NuevoCliente) { return this.http.post<Ficha>(`${this.api}/clientes`, c); }
  actualizar(id: number, c: Partial<Pick<Ficha, 'nombre' | 'telefono' | 'email' | 'direccion'>>) {
    return this.http.patch<Ficha>(`${this.api}/clientes/${id}`, c);
  }
  vehiculos(q: string, page = 1, per_page = 8) {
    return this.http.get<Pagina<VehiculoFila>>(`${this.api}/vehiculos`, { params: params({ q, page, per_page }) });
  }
  mensualidades(q: string, page = 1, per_page = 8) {
    return this.http.get<Pagina<MensualidadFila>>(`${this.api}/mensualidades`, { params: params({ q, page, per_page }) });
  }
  asignarMensualidad(m: NuevaMensualidad) { return this.http.post<MensualidadFila>(`${this.api}/mensualidades`, m); }
}
