import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Publico } from './shared/auth/decoradores.js';
import { PrismaService } from './shared/prisma/prisma.service.js';

class SaludDto {
  @ApiProperty({ example: 'ok' })
  estado!: string;

  @ApiProperty({ example: 'ok' })
  baseDeDatos!: string;
}

@ApiTags('Salud')
@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @Get()
  @ApiOkResponse({ type: SaludDto, description: 'Estado de la API y de la base de datos.' })
  async estado(): Promise<SaludDto> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { estado: 'ok', baseDeDatos: 'ok' };
  }
}
