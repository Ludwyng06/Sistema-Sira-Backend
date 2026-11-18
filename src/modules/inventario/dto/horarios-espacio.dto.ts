import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class HorarioEspacioDto {
  @ApiProperty({
    example: 1,
    minimum: 0,
    maximum: 6,
    description: '0 = domingo.',
  })
  @Type(() => Number)
  @IsInt({ message: 'diaSemana debe ser un número entero.' })
  @Min(0, { message: 'diaSemana debe estar entre 0 (domingo) y 6 (sábado).' })
  @Max(6, { message: 'diaSemana debe estar entre 0 (domingo) y 6 (sábado).' })
  diaSemana!: number;

  @ApiProperty({
    example: '06:00',
    description: 'HH:MM en hora local de Colombia.',
  })
  @Matches(FORMATO_HORA, { message: 'abre debe tener el formato HH:MM.' })
  abre!: string;

  @ApiProperty({
    example: '22:00',
    description: 'HH:MM; debe ser posterior a abre.',
  })
  @Matches(FORMATO_HORA, { message: 'cierra debe tener el formato HH:MM.' })
  cierra!: string;
}

export class ReemplazarHorariosDto {
  @ApiProperty({
    type: [HorarioEspacioDto],
    description:
      'Reemplaza el horario completo. Un día que no aparezca queda cerrado. Una lista vacía quita la restricción ' +
      'de horario (RN-19).',
  })
  @IsArray({ message: 'horarios debe ser una lista.' })
  @ArrayMaxSize(7, {
    message: 'horarios admite como máximo un horario por día de la semana.',
  })
  @ValidateNested({ each: true })
  @Type(() => HorarioEspacioDto)
  horarios!: HorarioEspacioDto[];
}
