import { ApiProperty } from '@nestjs/swagger';

export class RecargoAplicadoDto {
  @ApiProperty({ enum: ['NOCTURNO', 'DOMINICAL', 'FESTIVO'], example: 'NOCTURNO' })
  tipo!: 'NOCTURNO' | 'DOMINICAL' | 'FESTIVO';

  @ApiProperty({ example: 20, description: 'Porcentaje configurado del recargo.' })
  porcentaje!: number;

  @ApiProperty({ example: 6000, description: 'Valor del recargo en pesos enteros.' })
  valor!: number;
}

export class LineaTarifaDto {
  @ApiProperty({ example: '2026-11-03', description: 'Día local (Bogotá) al que corresponde la línea.' })
  fecha!: string;

  @ApiProperty({ example: 4, description: 'Horas del evento en ese día.' })
  horas!: number;

  @ApiProperty({
    enum: ['HORA', 'JORNADA_MANANA', 'JORNADA_TARDE', 'JORNADA_NOCHE', 'DIA', 'JORNADAS'],
    example: 'HORA',
    description: 'Unidad de cobro más conveniente para el solicitante.',
  })
  unidad!: string;

  @ApiProperty({ example: 4, description: 'Unidades cobradas.' })
  cantidad!: number;

  @ApiProperty({ example: 40000, description: 'Valor base en pesos enteros.' })
  base!: number;

  @ApiProperty({ type: [RecargoAplicadoDto] })
  recargos!: RecargoAplicadoDto[];

  @ApiProperty({ example: 46000, description: 'Base más recargos, en pesos enteros.' })
  subtotal!: number;
}

export class TarifaCalculadaDto {
  @ApiProperty({ format: 'uuid', example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  espacioId!: string;

  @ApiProperty({ example: 'EMPRESA' })
  tipoSolicitante!: string;

  @ApiProperty({ type: [LineaTarifaDto], description: 'Una línea por día local del evento.' })
  lineas!: LineaTarifaDto[];

  @ApiProperty({ example: 40000 })
  base!: number;

  @ApiProperty({ example: 6000 })
  recargos!: number;

  @ApiProperty({ example: 46000 })
  subtotal!: number;

  @ApiProperty({ example: 0, description: 'IVA en pesos enteros; 0 si la tarifa no lo aplica.' })
  iva!: number;

  @ApiProperty({ example: 46000, description: 'Valor total en pesos enteros. El simulador no persiste nada.' })
  total!: number;
}
