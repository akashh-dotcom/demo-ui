import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  if (token) {
    const authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });

    return next(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // Handle 401 Unauthorized errors (expired or invalid token)
        if (error.status === 401) {
          // Clear all auth data
          localStorage.removeItem('manuscript_token');
          localStorage.removeItem('manuscript_refresh_token');
          localStorage.removeItem('manuscript_user');

          // Redirect to login page
          router.navigate(['/login'], {
            queryParams: { returnUrl: router.url }
          });
        }

        return throwError(() => error);
      })
    );
  }

  return next(req);
};
