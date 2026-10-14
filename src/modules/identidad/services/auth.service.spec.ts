import { describe, expect, it } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { IngresarDto } from '../dto/ingresar.dto.js';
import type { RecuperarDto } from '../dto/recuperar.dto.js';
import type { ReenviarCodigoDto } from '../dto/reenviar-codigo.dto.js';
import type { RegistroDto } from '../dto/registro.dto.js';
import type { RestablecerDto } from '../dto/restablecer.dto.js';
import type { VerificarCorreoDto } from '../dto/verificar-correo.dto.js';
import { AuthService } from './auth.service.js';

const usuario: UsuarioAutenticado = {
  id: '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
  correo: 'ana@ejemplo.com',
  roles: [],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: false,
};

describe('AuthService (contrato sin implementar)', () => {
  const servicio = new AuthService();

  const casos: [string, () => Promise<unknown>][] = [
    ['registrar', () => servicio.registrar({} as RegistroDto)],
    ['verificarCorreo', () => servicio.verificarCorreo({} as VerificarCorreoDto)],
    ['reenviarCodigo', () => servicio.reenviarCodigo({} as ReenviarCodigoDto)],
    ['ingresar', () => servicio.ingresar({} as IngresarDto)],
    ['refrescar', () => servicio.refrescar()],
    ['salir', () => servicio.salir(usuario)],
    ['recuperar', () => servicio.recuperar({} as RecuperarDto)],
    ['restablecer', () => servicio.restablecer({} as RestablecerDto)],
    ['yo', () => servicio.yo(usuario)],
  ];

  it.each(casos)('%s rechaza con NO_IMPLEMENTADO y estado 501', async (_nombre, llamar) => {
    const error: unknown = await llamar().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDominio);
    expect(error).toMatchObject({ codigo: 'NO_IMPLEMENTADO', status: 501 });
  });
});
