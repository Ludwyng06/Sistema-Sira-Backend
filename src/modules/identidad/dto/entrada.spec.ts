import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { IngresarDto } from './ingresar.dto.js';
import { RecuperarDto } from './recuperar.dto.js';
import { ReenviarCodigoDto } from './reenviar-codigo.dto.js';
import { RegistroDto } from './registro.dto.js';
import { RestablecerDto } from './restablecer.dto.js';
import { VerificarCorreoDto } from './verificar-correo.dto.js';

type Clase<T> = new () => T;

const opciones = { whitelist: true, forbidNonWhitelisted: true };

const validar = async <T extends object>(clase: Clase<T>, plano: Record<string, unknown>) => {
  const instancia = plainToInstance(clase, plano);
  const errores = await validate(instancia, opciones);
  return { instancia, errores };
};

const mensajes = (errores: ValidationError[]) =>
  errores.flatMap((e) => Object.values(e.constraints ?? {}));

const propiedades = (errores: ValidationError[]) => errores.map((e) => e.property);

const registroValido = {
  correo: 'ana.perez@ejemplo.com',
  contrasena: 'Clave-segura-2026',
  tipo: 'PERSONA_NATURAL',
  nombres: 'Ana María',
  tipoDocumento: 'CC',
  numeroDocumento: '1020304050',
  telefono: '+573001234567',
  aceptaPoliticaDatos: true,
  versionPolitica: '2026-01',
};

describe('RegistroDto', () => {
  it('acepta un registro válido', async () => {
    const { errores } = await validar(RegistroDto, registroValido);
    expect(errores).toHaveLength(0);
  });

  it('acepta los campos opcionales completos', async () => {
    const { errores } = await validar(RegistroDto, {
      ...registroValido,
      apellidos: 'Pérez',
      representanteLegal: 'Carlos Ruiz',
      direccion: 'Calle 10 # 5-20',
      municipio: 'Popayán',
      dependenciaId: '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
    });
    expect(errores).toHaveLength(0);
  });

  it('normaliza el correo a minúsculas y sin espacios', async () => {
    const { instancia, errores } = await validar(RegistroDto, {
      ...registroValido,
      correo: '  Ana.PEREZ@Ejemplo.COM ',
    });
    expect(errores).toHaveLength(0);
    expect(instancia.correo).toBe('ana.perez@ejemplo.com');
  });

  it('rechaza un correo inválido o de más de 254 caracteres', async () => {
    const malo = await validar(RegistroDto, { ...registroValido, correo: 'no-es-correo' });
    expect(mensajes(malo.errores)).toContain('correo debe ser un correo electrónico válido.');

    const largo = await validar(RegistroDto, { ...registroValido, correo: `${'a'.repeat(250)}@ejemplo.com` });
    expect(mensajes(largo.errores)).toContain('correo no puede superar 254 caracteres.');
  });

  it('rechaza una contraseña de 9 caracteres y de más de 128', async () => {
    const corta = await validar(RegistroDto, { ...registroValido, contrasena: '123456789' });
    expect(mensajes(corta.errores)).toContain('contrasena debe tener al menos 10 caracteres.');

    const exacta = await validar(RegistroDto, { ...registroValido, contrasena: '1234567890' });
    expect(exacta.errores).toHaveLength(0);

    const larga = await validar(RegistroDto, { ...registroValido, contrasena: 'a'.repeat(129) });
    expect(mensajes(larga.errores)).toContain('contrasena no puede superar 128 caracteres.');
  });

  it('rechaza un tipo o tipo de documento fuera del enum', async () => {
    const tipo = await validar(RegistroDto, { ...registroValido, tipo: 'ADMIN' });
    expect(propiedades(tipo.errores)).toEqual(['tipo']);
    const doc = await validar(RegistroDto, { ...registroValido, tipoDocumento: 'XX' });
    expect(propiedades(doc.errores)).toEqual(['tipoDocumento']);
  });

  it('exige razonSocial para EMPRESA y ENTIDAD pero no para PERSONA_NATURAL', async () => {
    for (const tipo of ['EMPRESA', 'ENTIDAD']) {
      const { errores } = await validar(RegistroDto, { ...registroValido, tipo });
      expect(propiedades(errores)).toEqual(['razonSocial']);
      expect(mensajes(errores)).toContain('razonSocial es obligatorio.');
    }
    const natural = await validar(RegistroDto, { ...registroValido, tipo: 'PERSONA_NATURAL' });
    expect(natural.errores).toHaveLength(0);

    const empresa = await validar(RegistroDto, {
      ...registroValido,
      tipo: 'EMPRESA',
      razonSocial: 'Eventos del Norte S.A.S.',
    });
    expect(empresa.errores).toHaveLength(0);
  });

  it('acepta razonSocial null o ausente cuando el tipo no la exige', async () => {
    for (const tipo of ['PERSONA_NATURAL', 'INTERNO']) {
      const conNull = await validar(RegistroDto, { ...registroValido, tipo, razonSocial: null });
      expect(conNull.errores).toHaveLength(0);
      const ausente = await validar(RegistroDto, { ...registroValido, tipo });
      expect(ausente.errores).toHaveLength(0);
    }
  });

  it('rechaza razonSocial null, vacía o solo espacios para EMPRESA y ENTIDAD', async () => {
    for (const tipo of ['EMPRESA', 'ENTIDAD']) {
      for (const razonSocial of [null, undefined, '', '   ']) {
        const { errores } = await validar(RegistroDto, { ...registroValido, tipo, razonSocial });
        expect(propiedades(errores)).toEqual(['razonSocial']);
      }
    }
    const vacia = await validar(RegistroDto, { ...registroValido, tipo: 'EMPRESA', razonSocial: '   ' });
    expect(mensajes(vacia.errores)).toContain('razonSocial es obligatorio.');
  });

  it('recorta los espacios de razonSocial, nombres y versionPolitica', async () => {
    const { instancia, errores } = await validar(RegistroDto, {
      ...registroValido,
      tipo: 'EMPRESA',
      razonSocial: '  Eventos S.A.S.  ',
      nombres: ' Ana ',
      versionPolitica: ' 2026-01 ',
    });
    expect(errores).toHaveLength(0);
    expect(instancia.razonSocial).toBe('Eventos S.A.S.');
    expect(instancia.nombres).toBe('Ana');
    expect(instancia.versionPolitica).toBe('2026-01');
  });

  it('rechaza nombres y versionPolitica con solo espacios', async () => {
    const { errores } = await validar(RegistroDto, {
      ...registroValido,
      nombres: '   ',
      versionPolitica: '   ',
    });
    expect(propiedades(errores).sort()).toEqual(['nombres', 'versionPolitica']);
    expect(mensajes(errores)).toContain('nombres es obligatorio.');
    expect(mensajes(errores)).toContain('versionPolitica es obligatorio.');
  });

  it('limita razonSocial a 200 caracteres', async () => {
    const { errores } = await validar(RegistroDto, {
      ...registroValido,
      tipo: 'EMPRESA',
      razonSocial: 'x'.repeat(201),
    });
    expect(mensajes(errores)).toContain('razonSocial no puede superar 200 caracteres.');
  });

  it('exige nombres y limita nombres y apellidos a 120', async () => {
    const { nombres: _omitido, ...sinNombres } = registroValido;
    const falta = await validar(RegistroDto, sinNombres);
    expect(propiedades(falta.errores)).toEqual(['nombres']);

    const largos = await validar(RegistroDto, {
      ...registroValido,
      nombres: 'n'.repeat(121),
      apellidos: 'a'.repeat(121),
    });
    expect(propiedades(largos.errores).sort()).toEqual(['apellidos', 'nombres']);
  });

  it('valida el número de documento', async () => {
    const corto = await validar(RegistroDto, { ...registroValido, numeroDocumento: '1234' });
    expect(mensajes(corto.errores)).toContain('numeroDocumento debe tener al menos 5 caracteres.');

    const largo = await validar(RegistroDto, { ...registroValido, numeroDocumento: '1'.repeat(21) });
    expect(mensajes(largo.errores)).toContain('numeroDocumento no puede superar 20 caracteres.');

    const simbolos = await validar(RegistroDto, { ...registroValido, numeroDocumento: '12345 678' });
    expect(mensajes(simbolos.errores)).toContain('numeroDocumento solo admite letras, números y guion.');

    const conGuion = await validar(RegistroDto, { ...registroValido, numeroDocumento: '900123-4' });
    expect(conGuion.errores).toHaveLength(0);
  });

  it('valida el teléfono: 7 a 15 dígitos con + inicial opcional', async () => {
    for (const telefono of ['123456', '1'.repeat(16), '300-123-4567', '30012+34567']) {
      const { errores } = await validar(RegistroDto, { ...registroValido, telefono });
      expect(propiedades(errores)).toEqual(['telefono']);
    }
    for (const telefono of ['1234567', '+573001234567', '1'.repeat(15)]) {
      const { errores } = await validar(RegistroDto, { ...registroValido, telefono });
      expect(errores).toHaveLength(0);
    }
  });

  it('valida los límites de direccion y municipio y el UUID de dependenciaId', async () => {
    const { errores } = await validar(RegistroDto, {
      ...registroValido,
      direccion: 'd'.repeat(201),
      municipio: 'm'.repeat(101),
      dependenciaId: 'no-uuid',
    });
    expect(propiedades(errores).sort()).toEqual(['dependenciaId', 'direccion', 'municipio']);
    expect(mensajes(errores)).toContain('dependenciaId debe ser un UUID válido.');
  });

  it('rechaza aceptaPoliticaDatos distinto de true con mensaje en español', async () => {
    for (const valor of [false, 'true', undefined]) {
      const { errores } = await validar(RegistroDto, { ...registroValido, aceptaPoliticaDatos: valor });
      expect(mensajes(errores)).toContain(
        'Debes aceptar la política de tratamiento de datos para registrarte.',
      );
    }
  });

  it('exige versionPolitica de máximo 20 caracteres', async () => {
    const { versionPolitica: _omitida, ...sinVersion } = registroValido;
    const falta = await validar(RegistroDto, sinVersion);
    expect(propiedades(falta.errores)).toEqual(['versionPolitica']);

    const larga = await validar(RegistroDto, { ...registroValido, versionPolitica: 'v'.repeat(21) });
    expect(mensajes(larga.errores)).toContain('versionPolitica no puede superar 20 caracteres.');
  });

  it('rechaza propiedades que decide el servidor o desconocidas', async () => {
    const { errores } = await validar(RegistroDto, {
      ...registroValido,
      esExenta: true,
      rol: 'ADMINISTRADOR',
      esInstitucional: true,
      correoVerificado: true,
    });
    expect(propiedades(errores).sort()).toEqual(['correoVerificado', 'esExenta', 'esInstitucional', 'rol']);
    expect(mensajes(errores)).toContain('property rol should not exist');
  });
});

describe('VerificarCorreoDto', () => {
  const valido = { correo: 'Ana@Ejemplo.com', codigo: '482913' };

  it('acepta un código de 6 dígitos y normaliza el correo', async () => {
    const { instancia, errores } = await validar(VerificarCorreoDto, valido);
    expect(errores).toHaveLength(0);
    expect(instancia.correo).toBe('ana@ejemplo.com');
  });

  it('rechaza códigos de 5 dígitos, de 7 dígitos o con letras', async () => {
    for (const codigo of ['48291', '4829131', '48a913', '48 913']) {
      const { errores } = await validar(VerificarCorreoDto, { ...valido, codigo });
      expect(mensajes(errores)).toContain('El código debe tener exactamente 6 dígitos.');
    }
  });

  it('rechaza correo inválido y propiedades extra', async () => {
    const correo = await validar(VerificarCorreoDto, { ...valido, correo: 'x' });
    expect(propiedades(correo.errores)).toEqual(['correo']);
    const extra = await validar(VerificarCorreoDto, { ...valido, admin: true });
    expect(propiedades(extra.errores)).toEqual(['admin']);
  });
});

describe('ReenviarCodigoDto', () => {
  it('acepta un correo válido y lo normaliza', async () => {
    const { instancia, errores } = await validar(ReenviarCodigoDto, { correo: ' ANA@ejemplo.com ' });
    expect(errores).toHaveLength(0);
    expect(instancia.correo).toBe('ana@ejemplo.com');
  });

  it('rechaza correo faltante, inválido y propiedades extra', async () => {
    const falta = await validar(ReenviarCodigoDto, {});
    expect(propiedades(falta.errores)).toEqual(['correo']);
    const malo = await validar(ReenviarCodigoDto, { correo: 'ana@' });
    expect(mensajes(malo.errores)).toContain('correo debe ser un correo electrónico válido.');
    const extra = await validar(ReenviarCodigoDto, { correo: 'ana@ejemplo.com', otro: 1 });
    expect(propiedades(extra.errores)).toEqual(['otro']);
  });
});

describe('IngresarDto', () => {
  const valido = { correo: 'ana@ejemplo.com', contrasena: 'corta' };

  it('acepta una contraseña corta: el login no revela la política', async () => {
    const { errores } = await validar(IngresarDto, valido);
    expect(errores).toHaveLength(0);
  });

  it('rechaza contraseña vacía, ausente o de más de 128', async () => {
    const vacia = await validar(IngresarDto, { ...valido, contrasena: '' });
    expect(mensajes(vacia.errores)).toContain('contrasena es obligatorio.');
    const falta = await validar(IngresarDto, { correo: 'ana@ejemplo.com' });
    expect(propiedades(falta.errores)).toEqual(['contrasena']);
    const larga = await validar(IngresarDto, { ...valido, contrasena: 'a'.repeat(129) });
    expect(mensajes(larga.errores)).toContain('contrasena no puede superar 128 caracteres.');
  });

  it('normaliza el correo y rechaza propiedades extra', async () => {
    const { instancia } = await validar(IngresarDto, { ...valido, correo: ' ANA@EJEMPLO.com' });
    expect(instancia.correo).toBe('ana@ejemplo.com');
    const extra = await validar(IngresarDto, { ...valido, rol: 'ADMINISTRADOR' });
    expect(propiedades(extra.errores)).toEqual(['rol']);
  });
});

describe('RecuperarDto', () => {
  it('acepta un correo válido y lo normaliza', async () => {
    const { instancia, errores } = await validar(RecuperarDto, { correo: 'ANA@ejemplo.com' });
    expect(errores).toHaveLength(0);
    expect(instancia.correo).toBe('ana@ejemplo.com');
  });

  it('rechaza correo inválido, de más de 254 caracteres y propiedades extra', async () => {
    const malo = await validar(RecuperarDto, { correo: 'sin-arroba' });
    expect(mensajes(malo.errores)).toContain('correo debe ser un correo electrónico válido.');
    const largo = await validar(RecuperarDto, { correo: `${'a'.repeat(250)}@ejemplo.com` });
    expect(mensajes(largo.errores)).toContain('correo no puede superar 254 caracteres.');
    const extra = await validar(RecuperarDto, { correo: 'ana@ejemplo.com', x: 1 });
    expect(propiedades(extra.errores)).toEqual(['x']);
  });
});

describe('RestablecerDto', () => {
  const valido = { token: 'a1b2c3d4e5f6', contrasenaNueva: 'Nueva-clave-2026' };

  it('acepta token y contraseña nueva válidos', async () => {
    const { errores } = await validar(RestablecerDto, valido);
    expect(errores).toHaveLength(0);
  });

  it('rechaza token vacío, ausente o de más de 512', async () => {
    const vacio = await validar(RestablecerDto, { ...valido, token: '' });
    expect(mensajes(vacio.errores)).toContain('token es obligatorio.');
    const falta = await validar(RestablecerDto, { contrasenaNueva: valido.contrasenaNueva });
    expect(propiedades(falta.errores)).toEqual(['token']);
    const largo = await validar(RestablecerDto, { ...valido, token: 't'.repeat(513) });
    expect(mensajes(largo.errores)).toContain('token no puede superar 512 caracteres.');
  });

  it('rechaza contraseña nueva de 9 caracteres o de más de 128', async () => {
    const corta = await validar(RestablecerDto, { ...valido, contrasenaNueva: '123456789' });
    expect(mensajes(corta.errores)).toContain('contrasenaNueva debe tener al menos 10 caracteres.');
    const larga = await validar(RestablecerDto, { ...valido, contrasenaNueva: 'a'.repeat(129) });
    expect(mensajes(larga.errores)).toContain('contrasenaNueva no puede superar 128 caracteres.');
  });

  it('rechaza propiedades extra', async () => {
    const extra = await validar(RestablecerDto, { ...valido, contrasena: 'otra-clave-larga' });
    expect(propiedades(extra.errores)).toEqual(['contrasena']);
  });
});
