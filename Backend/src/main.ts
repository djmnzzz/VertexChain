import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import {
  csrfCookieParser,
  csrfErrorHandler,
  csrfProtection,
} from './common/middleware/csrf.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Issue 78 — CORS
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3001', 'http://localhost:8081'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    maxAge: 86400,
  });

  app.use(csrfCookieParser);
  app.use(csrfProtection);
  app.use(csrfErrorHandler);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Logging
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Issue 77 — Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gist API')
    .setDescription('Anonymous hyperlocal messaging on Stellar')
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Gist API running on port ${process.env.PORT ?? 3000}`);
  console.log(`Swagger docs → http://localhost:${process.env.PORT ?? 3000}/api/docs`);
}

void bootstrap();
