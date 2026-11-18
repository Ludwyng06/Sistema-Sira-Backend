import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { AlmacenamientoPort } from '../../../shared/almacenamiento/almacenamiento.port.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { ConciliacionService } from './conciliacion.service.js';

describe('ConciliacionService', () => {
  it('agrega cada grupo en pesos y no conserva el CSV en bitácora', async () => {
    const filas = ['APROBADA', 'RECHAZADA', 'PENDIENTE', 'EN_VERIFICACION', 'ANULADA', 'VENCIDA'].map((estado, i) => ({
      id: `id-${i}`, referencia: `OP-${i}`, estado, valor: 1000, pasarela: i < 3 ? 'WOMPI' : null,
      medio: i < 3 ? 'PASARELA' : 'CONSIGNACION', transaccionExternaId: null,
      pagadoEn: estado === 'APROBADA' ? new Date('2026-11-13T10:00:00Z') : null,
    }));
    const prisma = { ordenPago: { findMany: vi.fn().mockResolvedValue(filas) }, bitacora: { create: vi.fn().mockResolvedValue({}) } };
    const servicio = new ConciliacionService(prisma as unknown as PrismaService, {} as NotificacionesService, {} as AlmacenamientoPort);
    const archivo = Buffer.from('referencia,valor,fecha\nOP-0,1000,2026-11-13\n');
    const informe = await servicio.informe('2026-11-13', archivo, 'tesoreria-1');
    expect(informe.totales).toEqual({ aprobadas: { cantidad: 1, valor: 1000 }, rechazadas: { cantidad: 1, valor: 1000 },
      pendientes: { cantidad: 2, valor: 2000 }, anuladas: { cantidad: 2, valor: 2000 } });
    expect(informe.diferencias).toEqual([]);
    expect(prisma.ordenPago.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: expect.arrayContaining([
      { estado: 'APROBADA', pagadoEn: { gte: new Date('2026-11-13T05:00:00Z'), lt: new Date('2026-11-14T05:00:00Z') } },
    ]) } }));
    const registro = JSON.stringify(prisma.bitacora.create.mock.calls);
    expect(registro).toContain('sha256'); expect(registro).not.toContain('referencia,valor,fecha');
  });
});
