import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { SimuladorAdapter } from './simulador.adapter.js';

describe('SimuladorAdapter', () => {
  it('firma sobre el cuerpo exacto y rechaza manipulaciones', () => {
    const secreto = 'secreto-prueba-simulador-0123456789012345';
    const adaptador = new SimuladorAdapter(new ConfigService({ NODE_ENV: 'test', SIMULADOR_SECRETO: secreto }), {} as PrismaService);
    const crudo = '{"estado":"APROBADA"}'; const firma = createHmac('sha256', secreto).update(crudo).digest('hex');
    expect(adaptador.verificarFirmaWebhook(crudo, { 'x-simulador-firma': firma })).toBe(true);
    expect(adaptador.verificarFirmaWebhook(crudo + ' ', { 'x-simulador-firma': firma })).toBe(false);
  });
  it('ni siquiera una firma correcta habilita el simulador en producción', () => {
    const secreto = 'secreto-prueba-simulador-0123456789012345';
    const adaptador = new SimuladorAdapter(new ConfigService({ NODE_ENV: 'production', SIMULADOR_SECRETO: secreto }), {} as PrismaService);
    expect(adaptador.verificarFirmaWebhook('{}', { 'x-simulador-firma': createHmac('sha256', secreto).update('{}').digest('hex') })).toBe(false);
  });
});
