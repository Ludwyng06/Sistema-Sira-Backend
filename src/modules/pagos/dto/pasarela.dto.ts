import { ApiProperty } from '@nestjs/swagger';

export class CheckoutPasarelaDto {
  @ApiProperty({ format: 'uuid' })
  ordenPagoId!: string;
  @ApiProperty()
  urlCheckout!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Null hasta que Wompi cree la transacción y envíe su evento.' })
  transaccionExternaId!: string | null;
}

export class EstadoPagoDto {
  @ApiProperty()
  referencia!: string;
  @ApiProperty({ enum: ['PENDIENTE', 'EN_VERIFICACION', 'APROBADA', 'RECHAZADA', 'VENCIDA', 'ANULADA'] })
  estado!: string;
  @ApiProperty({ description: 'Pesos enteros.' })
  valor!: number;
}

export class EventoRecibidoDto {
  @ApiProperty({ example: true })
  recibido!: boolean;
  @ApiProperty()
  duplicado!: boolean;
}
