import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ArchivoSubido { nombre: string; url: string; mime_type: string | null; }

@Injectable({ providedIn: 'root' })
export class ArchivosService {
  private http = inject(HttpClient);
  subir(archivo: File) {
    const fd = new FormData();
    fd.append('archivo', archivo);
    return this.http.post<ArchivoSubido>(`${environment.apiUrl}/archivos`, fd);
  }
  /** La API devuelve rutas relativas (/api/archivos/x): se completan con el host del backend. */
  urlAbsoluta(url: string): string {
    return url.startsWith('http') ? url : environment.apiUrl.replace(/\/api$/, '') + url;
  }
}
