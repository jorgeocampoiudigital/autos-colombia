import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EstadoCelda } from '../core/models';

@Component({
  selector: 'app-leyenda-celdas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="leyenda">
      <span><i class="o"></i>Ocupada · {{ r()['OCUPADA'] }}</span>
      <span><i class="v"></i>Vacía, asignada · {{ r()['VACIA_ASIGNADA'] }}</span>
      <span><i class="d"></i>Disponible · {{ r()['DISPONIBLE'] }}</span>
      <span><i class="f"></i>Fuera de servicio · {{ r()['FUERA_SERVICIO'] }}</span>
    </div>`,
})
export class LeyendaCeldasComponent {
  readonly r = input.required<Record<EstadoCelda, number>>();
}
