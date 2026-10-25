import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (mousedown)="fondo($event)">
      <div class="dialog" [class.wide]="ancho()" role="dialog" aria-modal="true" [attr.aria-label]="titulo()">
        <div class="dialog-head">
          <h2>{{ titulo() }}</h2>
          <button type="button" (click)="cerrar.emit()" aria-label="Cerrar"><app-icon name="x" /></button>
        </div>
        <ng-content />
      </div>
    </div>`,
})
export class DialogComponent {
  readonly titulo = input.required<string>();
  readonly ancho = input(false);
  readonly cerrar = output<void>();

  fondo(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.cerrar.emit();
  }

  @HostListener('document:keydown.escape') esc(): void { this.cerrar.emit(); }
}
