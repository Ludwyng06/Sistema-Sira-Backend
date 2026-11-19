import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Adapter } from './s3.adapter.js';

const simulado = vi.hoisted(() => ({ enviar: vi.fn(), cerrar: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...sdk,
    S3Client: vi.fn(function () { return { send: simulado.enviar, destroy: simulado.cerrar }; }),
  };
});

const valoresS3 = {
  S3_ENDPOINT: 'https://proyecto.supabase.co/storage/v1/s3', S3_REGION: 'us-east-1',
  S3_BUCKET: 'archivos', S3_ACCESS_KEY: 'acceso-de-prueba', S3_SECRET_KEY: 'secreto-de-prueba',
};

function entorno(valores: Record<string, unknown> = valoresS3): S3Adapter {
  const config = new ConfigService();
  // Aísla también de las variables del proceso de quien ejecuta las pruebas.
  vi.spyOn(config, 'get').mockImplementation((clave) => valores[String(clave)]);
  return new S3Adapter(config);
}

beforeEach(() => {
  vi.clearAllMocks();
  simulado.enviar.mockReset();
});

describe('S3Adapter', () => {
  it('configura endpoint, región, credenciales y forcePathStyle para Supabase', () => {
    entorno();
    expect(S3Client).toHaveBeenCalledExactlyOnceWith({
      endpoint: valoresS3.S3_ENDPOINT, region: valoresS3.S3_REGION, forcePathStyle: true,
      credentials: { accessKeyId: valoresS3.S3_ACCESS_KEY, secretAccessKey: valoresS3.S3_SECRET_KEY },
    });
    expect(simulado.enviar).not.toHaveBeenCalled();
  });

  it('guarda bytes y tipo MIME en el bucket configurado', async () => {
    const adaptador = entorno(); const bytes = Buffer.from([0, 1, 255, 23]);
    simulado.enviar.mockResolvedValue({});
    await adaptador.guardar('solicitudes/uuid/soporte.pdf', bytes, 'application/pdf');
    const [comando] = simulado.enviar.mock.calls[0];
    expect(comando).toBeInstanceOf(PutObjectCommand);
    expect(comando.input).toEqual({ Bucket: 'archivos', Key: 'solicitudes/uuid/soporte.pdf', Body: bytes, ContentType: 'application/pdf' });
  });

  it('lee el cuerpo como Buffer sin alterar bytes', async () => {
    const adaptador = entorno(); const bytes = new Uint8Array([0, 1, 255, 23]);
    simulado.enviar.mockResolvedValue({ Body: { transformToByteArray: vi.fn().mockResolvedValue(bytes) } });
    const leido = await adaptador.leer('fotografias/uuid/foto.png');
    expect(Buffer.isBuffer(leido)).toBe(true);
    expect(leido).toEqual(Buffer.from(bytes));
    const [comando] = simulado.enviar.mock.calls[0];
    expect(comando).toBeInstanceOf(GetObjectCommand);
    expect(comando.input).toEqual({ Bucket: 'archivos', Key: 'fotografias/uuid/foto.png' });
  });

  it('conserva un archivo vacío como Buffer vacío', async () => {
    simulado.enviar.mockResolvedValue({ Body: { transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array()) } });
    expect(await entorno().leer('vacio.txt')).toEqual(Buffer.alloc(0));
  });

  it.each([{ name: 'NoSuchKey' }, { name: 'NotFound', $metadata: { httpStatusCode: 404 } }])
    ('devuelve null y permite eliminar repetidamente ante ausencia %j', async (error) => {
      const adaptador = entorno(); simulado.enviar.mockRejectedValue(error);
      expect(await adaptador.leer('ausente.pdf')).toBeNull();
      await expect(adaptador.eliminar('ausente.pdf')).resolves.toBeUndefined();
      await expect(adaptador.eliminar('ausente.pdf')).resolves.toBeUndefined();
    });

  it('elimina de forma idempotente cuando S3 confirma sin contenido', async () => {
    simulado.enviar.mockResolvedValue({}); const adaptador = entorno();
    await adaptador.eliminar('soporte.pdf');
    await adaptador.eliminar('soporte.pdf');
    expect(simulado.enviar).toHaveBeenCalledTimes(2);
    for (const [comando] of simulado.enviar.mock.calls) {
      expect(comando).toBeInstanceOf(DeleteObjectCommand);
      expect(comando.input).toEqual({ Bucket: 'archivos', Key: 'soporte.pdf' });
    }
  });

  it.each([
    new Error('Fallo de red'),
    { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    { name: 'InternalError', $metadata: { httpStatusCode: 500 } },
  ])('propaga errores de red, permisos y servicio en todas las operaciones: %j', async (error) => {
    const adaptador = entorno(); simulado.enviar.mockRejectedValue(error);
    await expect(adaptador.guardar('a.pdf', Buffer.from('x'), 'application/pdf')).rejects.toBe(error);
    await expect(adaptador.leer('a.pdf')).rejects.toBe(error);
    await expect(adaptador.eliminar('a.pdf')).rejects.toBe(error);
  });

  it('propaga fallos al consumir el cuerpo y rechaza respuestas sin cuerpo', async () => {
    const adaptador = entorno(); const error = new Error('Lectura interrumpida');
    simulado.enviar.mockResolvedValueOnce({ Body: { transformToByteArray: vi.fn().mockRejectedValue(error) } });
    await expect(adaptador.leer('a.pdf')).rejects.toBe(error);
    simulado.enviar.mockResolvedValueOnce({});
    await expect(adaptador.leer('a.pdf')).rejects.toThrow('sin contenido');
  });

  it.each(['../fuera', '/absoluta', 'a/../../fuera', 'C:/fuera', 'a\\..\\fuera', 'a//b', '', 'a/.. /fuera', 'CON', 'a/nul.txt', 'a\u0000b', '.', 'a/./b', 'a/final.', 'a/final ', 'COM1.txt'])
    ('rechaza la misma clave peligrosa que disco antes de llamar S3: %j', async (clave) => {
      const adaptador = entorno();
      await expect(adaptador.guardar(clave, Buffer.from('x'), 'text/plain')).rejects.toThrow('Clave de almacenamiento inválida.');
      await expect(adaptador.leer(clave)).rejects.toThrow('Clave de almacenamiento inválida.');
      await expect(adaptador.eliminar(clave)).rejects.toThrow('Clave de almacenamiento inválida.');
      expect(simulado.enviar).not.toHaveBeenCalled();
    });

  it.each(['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'])
    ('rechaza %s ausente antes de crear el cliente', (clave) => {
      expect(() => entorno({ ...valoresS3, [clave]: undefined })).toThrow(clave);
      expect(S3Client).not.toHaveBeenCalled();
    });

  it('libera el cliente al cerrar el módulo', () => {
    entorno().onModuleDestroy();
    expect(simulado.cerrar).toHaveBeenCalledOnce();
  });
});
