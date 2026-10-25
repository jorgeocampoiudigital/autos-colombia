import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const MAPA: Record<string, { label: string; cls: string }> = {
  AL_DIA: { label: 'Al día', cls: 'ok' },
  POR_VENCER: { label: 'Por vencer', cls: 'info' },
  EN_MORA: { label: 'En mora', cls: 'warn' },
  PENDIENTE: { label: 'Pendiente', cls: 'muted' },
  ABIERTA: { label: 'Abierta', cls: 'warn' },
  SEGUIMIENTO: { label: 'Seguimiento', cls: 'info' },
  CERRADA: { label: 'Cerrada', cls: 'muted' },
  ENTRADA: { label: 'Entrada', cls: 'ok' },
  SALIDA: { label: 'Salida', cls: 'muted' },
};

/** Etiqueta de estado con color semántico (pago, novedad o movimiento). */
@Component({
  selector: 'app-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [attr.class]="'badge ' + info().cls"><i class="dot"></i>{{ etiqueta() ?? info().label }}</span>`,
})
export class BadgeComponent {
  readonly estado = input.required<string>();
  readonly etiqueta = input<string | null>(null);
  readonly info = computed(() => MAPA[this.estado()] ?? { label: this.estado(), cls: 'muted' });
}
