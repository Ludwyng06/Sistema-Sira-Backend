import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EstadoEspacio } from '../../../generated/prisma/enums.js';

export class ActualizarEspacioDto {
  @ApiPropertyOptional({
    description: 'Código del tipo de espacio.',
    example: 'AULA',
  })
  @IsOptional()
  @IsString({ message: 'tipo debe ser texto.' })
  @IsNotEmpty({ message: 'tipo no puede estar vacío.' })
  tipo?: string;

  @ApiPropertyOptional({ example: 'Aula 401', maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'No puede superar los pisos del bloque.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'piso debe ser un número entero.' })
  @Min(1, { message: 'piso debe ser al menos 1.' })
  piso?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'capacidadPersonas debe ser un número entero.' })
  @Min(1, { message: 'capacidadPersonas debe ser al menos 1.' })
  capacidadPersonas?: number;

  @ApiPropertyOptional({ nullable: true, example: 48.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'areaM2 debe ser un número con máximo 2 decimales.' },
  )
  @Min(0, { message: 'areaM2 debe ser al menos 0.' })
  areaM2?: number | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto.' })
  @MaxLength(1000, { message: 'descripcion no puede superar 1000 caracteres.' })
  descripcion?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'condicionesUso debe ser texto.' })
  @MaxLength(1000, {
    message: 'condicionesUso no puede superar 1000 caracteres.',
  })
  condicionesUso?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Código de la dependencia dueña. null la quita.',
  })
  @IsOptional()
  @IsString({ message: 'dependencia debe ser texto.' })
  dependencia?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Usuario activo responsable. null lo quita.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'responsableId debe ser un identificador válido.' })
  responsableId?: string | null;

  @ApiPropertyOptional({ enum: EstadoEspacio })
  @IsOptional()
  @IsEnum(EstadoEspacio, { message: 'estado no es válido.' })
  estado?: EstadoEspacio;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'requiereAval debe ser verdadero o falso.' })
  requiereAval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'esReservable debe ser verdadero o falso.' })
  esReservable?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minutosMontaje debe ser un número entero.' })
  @Min(0, { message: 'minutosMontaje debe ser al menos 0.' })
  minutosMontaje?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minutosDesmontaje debe ser un número entero.' })
  @Min(0, { message: 'minutosDesmontaje debe ser al menos 0.' })
  minutosDesmontaje?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Depósito fijo en pesos enteros.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'depositoValorFijo debe ser un número entero en pesos.' })
  @Min(0, { message: 'depositoValorFijo debe ser al menos 0.' })
  depositoValorFijo?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Depósito como porcentaje (0 a 100).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message: 'depositoPorcentaje debe ser un número con máximo 2 decimales.',
    },
  )
  @Min(0, { message: 'depositoPorcentaje debe ser al menos 0.' })
  @Max(100, { message: 'depositoPorcentaje no puede ser mayor que 100.' })
  depositoPorcentaje?: number | null;
}
