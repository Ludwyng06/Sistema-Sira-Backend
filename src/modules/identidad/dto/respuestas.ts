import { ApiProperty } from '@nestjs/swagger';
import { Rol, TipoDocumentoIdentidad, TipoSolicitante } from '../../../generated/prisma/enums.js';

export class MensajeDto {
  @ApiProperty({
    example: 'Si el correo existe, te enviamos un enlace.',
    description: 'Mensaje informativo o de confirmación de la operación.',
  })
  mensaje!: string;
}

export class RegistroRespuestaDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
    description: 'Identificador único del usuario registrado.',
  })
  id!: string;

  @ApiProperty({
    example: 'ana.perez@uniputumayo.edu.co',
    description: 'Correo electrónico de la cuenta.',
  })
  correo!: string;

  @ApiProperty({
    example: true,
    description: 'Indica si el correo pertenece a un dominio institucional.',
  })
  esInstitucional!: boolean;

  @ApiProperty({
    example: false,
    description: 'Indica si el correo ya ha sido verificado mediante código.',
  })
  correoVerificado!: boolean;

  @ApiProperty({
    example: 'Registro exitoso. Te enviamos un código de verificación a tu correo.',
    description: 'Mensaje de confirmación con las instrucciones siguientes.',
  })
  mensaje!: string;
}

export class RolAsignadoDto {
  @ApiProperty({
    enum: Rol,
    example: Rol.SOLICITANTE,
    description: 'Rol asignado al usuario en el sistema.',
  })
  rol!: Rol;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
    description: 'Identificador de la dependencia si el rol está acotado, o null si es global.',
  })
  dependenciaId!: string | null;
}

export class PerfilSolicitanteDto {
  @ApiProperty({
    enum: TipoSolicitante,
    example: TipoSolicitante.PERSONA_NATURAL,
    description: 'Tipo de solicitante registrado.',
  })
  tipo!: TipoSolicitante;

  @ApiProperty({
    example: 'Ana María',
    description: 'Nombres del solicitante o persona de contacto.',
  })
  nombres!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Pérez Gómez',
    description: 'Apellidos del solicitante, o null si es persona jurídica.',
  })
  apellidos!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Eventos del Norte S.A.S.',
    description: 'Razón social para empresas o entidades, o null si es persona natural.',
  })
  razonSocial!: string | null;

  @ApiProperty({
    enum: TipoDocumentoIdentidad,
    example: TipoDocumentoIdentidad.CC,
    description: 'Tipo de documento de identidad.',
  })
  tipoDocumento!: TipoDocumentoIdentidad;

  @ApiProperty({
    example: '1020304050',
    description: 'Número de documento de identidad o NIT.',
  })
  numeroDocumento!: string;

  @ApiProperty({
    example: '+573001234567',
    description: 'Número de teléfono de contacto.',
  })
  telefono!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
    description: 'Identificador de la dependencia si es usuario interno, o null si es externo.',
  })
  dependenciaId!: string | null;
}

export class UsuarioSesionDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
    description: 'Identificador único del usuario.',
  })
  id!: string;

  @ApiProperty({
    example: 'ana.perez@uniputumayo.edu.co',
    description: 'Correo electrónico registrado.',
  })
  correo!: string;

  @ApiProperty({
    example: true,
    description: 'Indica si el correo electrónico ha sido verificado.',
  })
  correoVerificado!: boolean;

  @ApiProperty({
    example: true,
    description: 'Indica si la cuenta pertenece a un dominio institucional.',
  })
  esInstitucional!: boolean;

  @ApiProperty({
    type: [RolAsignadoDto],
    description: 'Roles asignados al usuario.',
  })
  roles!: RolAsignadoDto[];

  @ApiProperty({
    type: PerfilSolicitanteDto,
    nullable: true,
    description: 'Perfil de solicitante asociado, o null si no se ha completado.',
  })
  perfil!: PerfilSolicitanteDto | null;
}

export class SesionDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIzZjJiOGMxZSJ9.firma',
    description:
      'Token JWT de acceso que el cliente guarda únicamente en memoria; ' +
      'el token de refresco no viaja en el cuerpo sino en una cookie httpOnly.',
  })
  accessToken!: string;

  @ApiProperty({
    example: 900,
    description: 'Segundos de vida del access token.',
  })
  expiraEn!: number;

  @ApiProperty({
    type: UsuarioSesionDto,
    description: 'Información del usuario autenticado, sus roles y su perfil.',
  })
  usuario!: UsuarioSesionDto;
}
