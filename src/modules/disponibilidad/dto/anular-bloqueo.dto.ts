import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnularBloqueoDto {
  @ApiProperty({ example: 'La clase se reprogramó al bloque B.', maxLength: 300 })
  @IsString({ message: 'motivo debe ser texto.' })
  @IsNotEmpty({ message: 'Indica el motivo de la anulación.' })
  @MaxLength(300, { message: 'motivo no puede superar 300 caracteres.' })
  motivo!: string;
}

export class BloqueoAnuladoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 12, description: 'Franjas futuras que volvieron a quedar libres.' })
  franjasLiberadas!: number;

  @ApiProperty({ example: '2026-10-30T15:00:00.000Z' })
  anuladoEn!: string;
}
