import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { NovedadesService } from '../core/api/novedades.service';
import { AuthService } from '../core/auth.service';
import { fechaLarga, hora } from '../core/formato';
import { IconComponent, IconName } from '../shared/icon.component';

interface ItemNav { ruta: string; texto: string; icono: IconName; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="side">
        <div class="brand">
          <div class="logo">P</div>
          <div><b>Autos Colombia</b><small>GESTIÓN DE PARQUEADERO</small></div>
        </div>
        <div class="sede">
          <div><b>Sede principal</b><small>Bogotá, Colombia</small></div>
          <app-icon name="updown" [size]="14" />
        </div>

        <div class="nav-label">OPERACIÓN</div>
        <nav class="nav" aria-label="Operación">
          @for (i of items; track i.ruta) {
            <a [routerLink]="i.ruta" routerLinkActive="active">
              <app-icon [name]="i.icono" [size]="18" />{{ i.texto }}
              @if (i.ruta === '/novedades' && abiertas() > 0) { <span class="badge-n">{{ abiertas() }}</span> }
            </a>
          }
        </nav>

        <div class="spacer"></div>
        @if (auth.esAdmin()) {
          <div class="nav-label">ADMINISTRACIÓN</div>
          <nav class="nav">
            <span class="inert" title="Próximamente"><app-icon name="shield" /> Usuarios y roles</span>
            <span class="inert" title="Próximamente"><app-icon name="gear" /> Configuración</span>
          </nav>
        }
        <div class="help">
          <b>Todo bajo control.</b>
          <p>Consulta la guía de operación del parqueadero.</p>
          <a routerLink="/resumen">Centro de ayuda ↗</a>
        </div>
        <div class="me">
          <div class="avatar">{{ auth.iniciales() }}</div>
          <div><b>{{ auth.operador()?.nombre }}</b><small>{{ auth.esAdmin() ? 'Administrador' : 'Operador' }}</small></div>
          <button type="button" (click)="auth.logout()" aria-label="Cerrar sesión" title="Cerrar sesión"><app-icon name="logout" /></button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="crumb"><app-icon name="home" [size]="16" /> Operación <span>/</span> <b>{{ titulo() }}</b></div>
          <div class="top-right">
            <span>{{ fechaHoy }}</span>
            <span class="ic"><app-icon name="bell" /></span>
            <span class="ic help-i"><app-icon name="help" [size]="15" /></span>
          </div>
        </header>
        <router-outlet />
        <footer class="page-foot" style="padding: 0 32px 20px">
          <span>Autos Colombia · Consola administrativa</span>
          <span>Actualizado a las {{ actualizado() }}</span>
        </footer>
      </div>
    </div>`,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private novedades = inject(NovedadesService);

  readonly items: ItemNav[] = [
    { ruta: '/resumen', texto: 'Resumen operativo', icono: 'grid' },
    { ruta: '/entradas-salidas', texto: 'Entradas y salidas', icono: 'swap' },
    { ruta: '/clientes', texto: 'Clientes y vehículos', icono: 'users' },
    { ruta: '/celdas', texto: 'Celdas', icono: 'cells' },
    { ruta: '/pagos', texto: 'Pagos y mensualidades', icono: 'wallet' },
    { ruta: '/novedades', texto: 'Novedades', icono: 'clipboard' },
  ];
  readonly fechaHoy = fechaLarga(new Date());
  readonly titulo = signal('');
  readonly abiertas = signal(0);
  readonly actualizado = signal(hora(new Date()));

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), startWith(null), takeUntilDestroyed())
      .subscribe(() => {
        let r = this.route;
        while (r.firstChild) r = r.firstChild;
        // En la primera emisión el hijo aún no tiene snapshot (se asigna al activarse)
        this.titulo.set(((r.snapshot as ActivatedRoute['snapshot'] | undefined)?.data['titulo'] as string | undefined) ?? '');
        this.actualizado.set(hora(new Date()));
        this.novedades.kpis().subscribe({ next: k => this.abiertas.set(k.abiertas), error: () => undefined });
      });
  }
}
