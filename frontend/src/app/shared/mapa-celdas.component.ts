import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CeldaResumen } from '../core/models';
import { IconComponent, IconName } from './icon.component';

const ICONO: Record<string, IconName> = { OCUPADA: 'car', VACIA_ASIGNADA: 'link', DISPONIBLE: 'plus', FUERA_SERVICIO: 'wrench' };
const ETIQUETA: Record<string, string> = {
  OCUPADA: 'Ocupada', VACIA_ASIGNADA: 'Vacía, asignada', DISPONIBLE: 'Disponible', FUERA_SERVICIO: 'Fuera de servicio',
};

/** Plano del parqueadero: A | circulación | B-C | circulación | D, con los 4 estados del diseño. */
@Component({
  selector: 'app-mapa-celdas',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="'mapa' + (compacto() ? ' compacto' : '')" [style.--zoom]="zoom()">
      <div class="mapa-top"><span>SECTOR ÚNICO · {{ celdas().length }} CELDAS</span><span>N ↑</span></div>
      @for (grupo of grupos(); track $index) {
        @if ($index > 0) { <div class="circ">CIRCULACIÓN</div> }
        @for (fila of grupo; track fila.letra) {
          <div class="fila">
            @for (c of fila.celdas; track c.id_celda) {
              <button type="button" [class]="'celda e-' + c.estado + (c.id_celda === seleccionada() ? ' sel' : '') + (atenuada(c) ? ' dim' : '')"
                      [title]="titulo(c)" [attr.aria-label]="titulo(c)" (click)="elegir.emit(c)">
                <span class="cod">{{ c.codigo }}</span>
                <app-icon [name]="icono(c)" [size]="compacto() ? 14 : 18" />
              </button>
            }
          </div>
        }
      }
      <div class="pie"><span>↗ ENTRADA</span><span class="centro">Punto de control</span><span>SALIDA ↘</span></div>
    </div>`,
})
export class MapaCeldasComponent {
  readonly celdas = input.required<CeldaResumen[]>();
  readonly seleccionada = input<number | null>(null);
  /** ids que coinciden con el filtro; null = sin filtro */
  readonly coincidentes = input<Set<number> | null>(null);
  readonly compacto = input(false);
  readonly zoom = input(1);
  readonly elegir = output<CeldaResumen>();

  readonly grupos = computed(() => {
    const porFila = new Map<string, CeldaResumen[]>();
    for (const c of this.celdas()) porFila.set(c.fila, [...(porFila.get(c.fila) ?? []), c]);
    const f = (l: string) => ({ letra: l, celdas: porFila.get(l) ?? [] });
    // El plano agrupa B y C juntas; A y D quedan al borde de cada pasillo
    return [[f('A')], [f('B'), f('C')], [f('D')]].map(g => g.filter(x => x.celdas.length));
  });

  icono = (c: CeldaResumen): IconName => ICONO[c.estado];
  atenuada = (c: CeldaResumen): boolean => { const m = this.coincidentes(); return !!m && !m.has(c.id_celda); };
  titulo = (c: CeldaResumen): string =>
    `${c.codigo} · ${ETIQUETA[c.estado]}${c.placa_presente ? ' · ' + c.placa_presente : c.cliente ? ' · ' + c.cliente : ''}`;
}
