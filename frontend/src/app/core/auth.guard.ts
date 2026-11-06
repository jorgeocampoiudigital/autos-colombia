import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Exige sesión; con contraseña temporal solo deja entrar a /cambiar-clave. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.autenticado()) return router.createUrlTree(['/login']);
  if (auth.debeCambiarClave() && state.url !== '/cambiar-clave') return router.createUrlTree(['/cambiar-clave']);
  return true;
};

/** Solo administradores (la API también lo valida: esto solo evita mostrar la pantalla). */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.esAdmin() ? true : inject(Router).createUrlTree(['/resumen']);
};
