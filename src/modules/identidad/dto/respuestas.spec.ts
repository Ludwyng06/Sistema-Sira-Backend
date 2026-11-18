import 'reflect-metadata';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { ApiOkResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Rol } from '../../../generated/prisma/enums.js';
import {
  MensajeDto,
  PerfilSolicitanteDto,
  RegistroRespuestaDto,
  RolAsignadoDto,
  SesionDto,
  UsuarioSesionDto,
} from './respuestas.js';

interface EsquemaPropiedad {
  type?: string;
  format?: string;
  nullable?: boolean;
  enum?: string[];
  items?: { $ref?: string };
  $ref?: string;
  allOf?: Array<{ $ref?: string }>;
}

interface EsquemaObjeto {
  type?: string;
  required?: string[];
  properties?: Record<string, EsquemaPropiedad>;
}

@Controller('prueba')
class ControladorPrueba {
  @Get('mensaje')
  @ApiOkResponse({ type: MensajeDto })
  mensaje(): MensajeDto {
    return new MensajeDto();
  }

  @Get('registro')
  @ApiOkResponse({ type: RegistroRespuestaDto })
  registro(): RegistroRespuestaDto {
    return new RegistroRespuestaDto();
  }

  @Get('rol')
  @ApiOkResponse({ type: RolAsignadoDto })
  rol(): RolAsignadoDto {
    return new RolAsignadoDto();
  }

  @Get('perfil')
  @ApiOkResponse({ type: PerfilSolicitanteDto })
  perfil(): PerfilSolicitanteDto {
    return new PerfilSolicitanteDto();
  }

  @Get('usuario-sesion')
  @ApiOkResponse({ type: UsuarioSesionDto })
  usuarioSesion(): UsuarioSesionDto {
    return new UsuarioSesionDto();
  }

  @Get('sesion')
  @ApiOkResponse({ type: SesionDto })
  sesion(): SesionDto {
    return new SesionDto();
  }
}

describe('DTOs de respuestas de identidad en OpenAPI', () => {
  let app: INestApplication;
  let esquemas: Record<string, EsquemaObjeto>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [ControladorPrueba],
    }).compile();
    app = modulo.createNestApplication();
    const config = new DocumentBuilder().setTitle('Prueba').build();
    const documento = SwaggerModule.createDocument(app, config);
    esquemas = (documento.components?.schemas ?? {}) as Record<string, EsquemaObjeto>;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('genera los 6 esquemas esperados en components.schemas', () => {
    expect(esquemas).toHaveProperty('MensajeDto');
    expect(esquemas).toHaveProperty('RegistroRespuestaDto');
    expect(esquemas).toHaveProperty('RolAsignadoDto');
    expect(esquemas).toHaveProperty('PerfilSolicitanteDto');
    expect(esquemas).toHaveProperty('UsuarioSesionDto');
    expect(esquemas).toHaveProperty('SesionDto');
  });

  it('define las propiedades requeridas de cada esquema', () => {
    const mensajeSchema = esquemas['MensajeDto'];
    expect(mensajeSchema.required).toEqual(['mensaje']);

    const registroSchema = esquemas['RegistroRespuestaDto'];
    expect(registroSchema.required).toEqual([
      'id',
      'correo',
      'esInstitucional',
      'correoVerificado',
      'mensaje',
    ]);

    const rolSchema = esquemas['RolAsignadoDto'];
    expect(rolSchema.required).toEqual(['rol', 'dependenciaId']);

    const perfilSchema = esquemas['PerfilSolicitanteDto'];
    expect(perfilSchema.required).toEqual([
      'tipo',
      'nombres',
      'apellidos',
      'razonSocial',
      'tipoDocumento',
      'numeroDocumento',
      'telefono',
      'dependenciaId',
    ]);

    const usuarioSesionSchema = esquemas['UsuarioSesionDto'];
    expect(usuarioSesionSchema.required).toEqual([
      'id',
      'correo',
      'correoVerificado',
      'esInstitucional',
      'roles',
      'perfil',
    ]);

    const sesionSchema = esquemas['SesionDto'];
    expect(sesionSchema.required).toEqual(['accessToken', 'expiraEn', 'usuario']);
  });

  it('verifica que roles es un arreglo de RolAsignadoDto', () => {
    const usuarioSesionSchema = esquemas['UsuarioSesionDto'];
    const rolesProp = usuarioSesionSchema.properties?.roles;

    expect(rolesProp?.type).toBe('array');
    expect(rolesProp?.items).toEqual({
      $ref: '#/components/schemas/RolAsignadoDto',
    });
  });

  it('verifica que perfil y dependenciaId son nullable', () => {
    const usuarioSesionProperties = esquemas['UsuarioSesionDto'].properties;
    expect(usuarioSesionProperties?.['perfil']?.nullable).toBe(true);

    const rolProperties = esquemas['RolAsignadoDto'].properties;
    expect(rolProperties?.['dependenciaId']?.nullable).toBe(true);

    const perfilProperties = esquemas['PerfilSolicitanteDto'].properties;
    expect(perfilProperties?.['dependenciaId']?.nullable).toBe(true);
    expect(perfilProperties?.['apellidos']?.nullable).toBe(true);
    expect(perfilProperties?.['razonSocial']?.nullable).toBe(true);
  });

  it('verifica que rol trae el enum con los 6 roles', () => {
    const rolProperties = esquemas['RolAsignadoDto'].properties;

    const rolesEsperados = Object.values(Rol);
    expect(rolesEsperados).toHaveLength(6);
    expect(rolProperties?.rol?.enum).toEqual(expect.arrayContaining(rolesEsperados));
    expect(rolProperties?.rol?.enum).toHaveLength(6);
  });

  it('verifica que ningún esquema contiene hashContrasena ni campos sensibles', () => {
    const camposSensibles = ['hashContrasena', 'intentosFallidos', 'bloqueadoHasta', 'mfaSecreto'];

    for (const [nombre, esquema] of Object.entries(esquemas)) {
      const propiedades = Object.keys(esquema.properties ?? {});
      for (const campo of camposSensibles) {
        expect(
          propiedades,
          `El esquema ${nombre} no debe contener ${campo}`,
        ).not.toContain(campo);
      }
    }
  });

  it(
    'verifica que SesionDto.usuario referencia a UsuarioSesionDto y UsuarioSesionDto.perfil a PerfilSolicitanteDto',
    () => {
      const sesionUsuarioProp = esquemas['SesionDto'].properties?.usuario;
      const refUsuario = sesionUsuarioProp?.$ref ?? sesionUsuarioProp?.allOf?.[0]?.$ref;
      expect(refUsuario).toBe('#/components/schemas/UsuarioSesionDto');

      const usuarioPerfilProp = esquemas['UsuarioSesionDto'].properties?.perfil;
      const refPerfil = usuarioPerfilProp?.$ref ?? usuarioPerfilProp?.allOf?.[0]?.$ref;
      expect(refPerfil).toBe('#/components/schemas/PerfilSolicitanteDto');
    },
  );
});


