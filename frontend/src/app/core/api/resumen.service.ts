import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Resumen } from '../models';

@Injectable({ providedIn: 'root' })
export class ResumenService {
  private http = inject(HttpClient);
  obtener() { return this.http.get<Resumen>(`${environment.apiUrl}/resumen`); }
}
