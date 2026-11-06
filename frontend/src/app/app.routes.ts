import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      { path: 'resumen', data: { titulo: 'Resumen operativo' },
        loadComponent: () => import('./features/resumen/resumen.component').then(m => m.ResumenComponent) },
      { path: 'entradas-salidas', data: { titulo: 'Entradas y salidas' },
        loadComponent: () => import('./features/movimientos/movimientos.component').then(m => m.MovimientosComponent) },
      { path: 'clientes', data: { titulo: 'Clientes y vehículos' },
        loadComponent: () => import('./features/clientes/clientes.component').then(m => m.ClientesComponent) },
      { path: 'celdas', data: { titulo: 'Celdas' },
        loadComponent: () => import('./features/celdas/celdas.component').then(m => m.CeldasComponent) },
      { path: 'pagos', data: { titulo: 'Pagos y mensualidades' },
        loadComponent: () => import('./features/pagos/pagos.component').then(m => m.PagosComponent) },
      { path: 'novedades', data: { titulo: 'Novedades' },
        loadComponent: () => import('./features/novedades/novedades.component').then(m => m.NovedadesComponent) },
      { path: 'usuarios', data: { titulo: 'Usuarios y roles' }, canActivate: [adminGuard],
        loadComponent: () => import('./features/usuarios/usuarios.component').then(m => m.UsuariosComponent) },
      { path: 'cambiar-clave', data: { titulo: 'Cambiar contraseña' },
        loadComponent: () => import('./features/cambiar-clave/cambiar-clave.component').then(m => m.CambiarClaveComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
