import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { JwtStrategy, type CargaJwt } from './jwt.strategy.js';

const carga: CargaJwt = {
  sub: 'u-1',
  correo: 'ana@itp.edu.co',
  roles: ['SOLICITANTE', 'ADMINISTRADOR'],
  dependencias: ['dep-1'],
  verificado: true,
  institucional: true,
};

function estrategia(usuario: unknown) {
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(usuario) },
  };
  const config = {
    getOrThrow: () => 'secreto-de-prueba-con-mas-de-32-caracteres',
  } as unknown as ConfigService;
  return {
    estrategia: new JwtStrategy(config, prisma as unknown as PrismaService),
    prisma,
  };
}

describe('JwtStrategy.validate', () => {
  it('rechaza un token de una cuenta desactivada o inexistente', async () => {
    for (const usuario of [
      null,
      { activo: false, roles: [{ rol: 'SOLICITANTE' }] },
    ]) {
      const e = estrategia(usuario);
      await expect(e.estrategia.validate(carga)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('conserva los roles que el usuario aún tiene', async () => {
    const e = estrategia({
      activo: true,
      roles: [{ rol: 'SOLICITANTE' }, { rol: 'ADMINISTRADOR' }],
    });
    const r = await e.estrategia.validate(carga);
    expect(r).toEqual({
      id: 'u-1',
      correo: 'ana@itp.edu.co',
      roles: ['SOLICITANTE', 'ADMINISTRADOR'],
      dependencias: ['dep-1'],
      correoVerificado: true,
      esInstitucional: true,
    });
    expect(e.prisma.usuario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-1' } }),
    );
  });

  it('quita del token el rol que ya no tiene y nunca agrega uno nuevo', async () => {
    const e = estrategia({
      activo: true,
      roles: [{ rol: 'SOLICITANTE' }, { rol: 'TESORERIA' }],
    });
    const r = await e.estrategia.validate(carga);
    expect(r.roles).toEqual(['SOLICITANTE']);
  });
});
