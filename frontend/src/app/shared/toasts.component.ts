import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) { <div [class]="'toast ' + t.tipo" role="status">{{ t.texto }}</div> }
    </div>`,
})
export class ToastsComponent { readonly toast = inject(ToastService); }
