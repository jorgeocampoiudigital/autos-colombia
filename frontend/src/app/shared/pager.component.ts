import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-pager',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pager">
      <span class="muted">{{ texto() }}</span>
      <div class="nav-p">
        <button type="button" [disabled]="page() <= 1" (click)="cambiar(page() - 1)" aria-label="Anterior"><app-icon name="left" [size]="14" /></button>
        @for (p of paginas(); track p) {
          <button type="button" [class.on]="p === page()" (click)="cambiar(p)">{{ p }}</button>
        }
        <button type="button" [disabled]="page() >= total_paginas()" (click)="cambiar(page() + 1)" aria-label="Siguiente"><app-icon name="right" [size]="14" /></button>
      </div>
    </div>`,
  styles: [`
    .pager { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; padding-top: 14px; border-top: 1px solid var(--line); margin-top: 4px; }
    .nav-p { display: flex; gap: 4px; align-items: center; }
    .nav-p button { min-width: 26px; height: 26px; border: 0; background: none; border-radius: 6px; cursor: pointer; color: var(--muted); display: inline-grid; place-items: center; font-size: 12px; }
    .nav-p button.on { color: var(--ink); font-weight: 600; }
    .nav-p button:disabled { opacity: .35; cursor: default; }
    .nav-p button:hover:not(:disabled) { background: #f0f2f1; }`],
})
export class PagerComponent {
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly porPagina = input(10);
  readonly mostrando = input(0);
  readonly etiqueta = input('registros');
  readonly pageChange = output<number>();

  readonly total_paginas = computed(() => Math.max(1, Math.ceil(this.total() / this.porPagina())));
  readonly paginas = computed(() => {
    const t = this.total_paginas(), p = this.page();
    const ini = Math.max(1, Math.min(p - 2, t - 4));
    return Array.from({ length: Math.min(5, t) }, (_, i) => ini + i);
  });
  readonly texto = computed(() => `Mostrando ${this.mostrando()} de ${this.total()} ${this.etiqueta()}`);

  cambiar(p: number): void {
    if (p >= 1 && p <= this.total_paginas() && p !== this.page()) this.pageChange.emit(p);
  }
}
