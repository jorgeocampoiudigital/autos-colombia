import { Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

export interface Toast { id: number; tipo: 'ok' | 'error'; texto: string; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  ok(texto: string): void { this.mostrar('ok', texto); }
  error(e: unknown): void {
    const h = e as HttpErrorResponse;
    const cuerpo = h?.error as { error?: string; details?: { mensaje?: string }[] } | null;
    // En un 422 el motivo concreto viene en details (p. ej. "Placa inválida para carro…")
    const detalle = cuerpo?.details?.find(d => d.mensaje)?.mensaje;
    const msg = (detalle ? `${cuerpo?.error ?? 'Datos inválidos'}: ${detalle}` : cuerpo?.error)
      ?? (h?.status === 0 ? 'No hay conexión con el servidor' : 'Ocurrió un error inesperado');
    this.mostrar('error', msg);
  }
  private mostrar(tipo: Toast['tipo'], texto: string): void {
    const id = ++this.seq;
    this.toasts.update(l => [...l, { id, tipo, texto }]);
    setTimeout(() => this.toasts.update(l => l.filter(t => t.id !== id)), 4500);
  }
}
