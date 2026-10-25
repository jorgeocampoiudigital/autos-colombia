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
    const msg = (h?.error as { error?: string } | null)?.error
      ?? (h?.status === 0 ? 'No hay conexión con el servidor' : 'Ocurrió un error inesperado');
    this.mostrar('error', msg);
  }
  private mostrar(tipo: Toast['tipo'], texto: string): void {
    const id = ++this.seq;
    this.toasts.update(l => [...l, { id, tipo, texto }]);
    setTimeout(() => this.toasts.update(l => l.filter(t => t.id !== id)), 4500);
  }
}
