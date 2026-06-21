import { HttpException, HttpStatus } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as cookieParser from 'cookie-parser';
import Tokens from 'csrf';

const csrfTokens = new Tokens();
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME ?? 'csrfToken';
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 1000;

export const csrfCookieParser = cookieParser();

function getCsrfValue(req: Request): string | undefined {
  return (
    (req.headers['x-csrf-token'] as string) ||
    (req.body && (req.body as Record<string, unknown>)._csrf as string) ||
    (req.query && (req.query as Record<string, unknown>)._csrf as string)
  );
}

function getCsrfSecret(req: Request): string {
  const cookieSecret = req.cookies?.[CSRF_COOKIE_NAME];
  if (typeof cookieSecret === 'string' && cookieSecret.length > 0) {
    return cookieSecret;
  }

  return csrfTokens.secretSync();
}

export const csrfProtection = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const secret = getCsrfSecret(req);

  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    res.cookie(CSRF_COOKIE_NAME, secret, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: CSRF_COOKIE_MAX_AGE,
    });
  }

  (req as any).csrfToken = () => csrfTokens.create(secret);

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = getCsrfValue(req);
  if (!token || !csrfTokens.verify(secret, token)) {
    const err = new Error('Invalid or missing CSRF token');
    (err as any).code = 'EBADCSRFTOKEN';
    return next(err);
  }

  return next();
};

export function csrfErrorHandler(
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'EBADCSRFTOKEN') {
    next(new HttpException('Invalid or missing CSRF token', HttpStatus.FORBIDDEN));
    return;
  }

  next(err);
}
