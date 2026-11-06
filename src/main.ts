import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { registroPeticiones } from './shared/logs/registro-peticiones.js';

async function bootstrap() {
  // RNF-15: en producción los logs de la aplicación también salen en JSON.
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Asigna un identificador de correlación a cada petición (RNF-15).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const entrante = req.headers['x-correlation-id'];
    const id =
      typeof entrante === 'string' && entrante.length > 0
        ? entrante
        : randomUUID();
    req.headers['x-correlation-id'] = id;
    res.setHeader('x-correlation-id', id);
    next();
  });
  app.use(registroPeticiones());

  // Swagger UI necesita scripts en línea: en /docs se relaja solo la CSP.
  const helmetEstricto = helmet();
  const helmetDocs = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/docs')
      ? helmetDocs(req, res, next)
      : helmetEstricto(req, res, next),
  );

  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const documento = new DocumentBuilder()
    .setTitle('SIRA · API')
    .setDescription('Sistema de Inventario y Reserva de Activos · Uniputumayo')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('sira_refresh', undefined, 'sira_refresh')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, documento),
  );

  await app.listen(config.get<number>('PORT') ?? 3001);
}

await bootstrap();
