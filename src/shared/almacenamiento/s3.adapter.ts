import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AlmacenamientoPort } from './almacenamiento.port.js';
import { validarVariablesS3, VARIABLES_S3 } from './configuracion-almacenamiento.js';
import { validarClaveAlmacenamiento } from './validar-clave.js';

function esArchivoAusente(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const respuesta = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return respuesta.name === 'NoSuchKey' || respuesta.$metadata?.httpStatusCode === 404;
}

@Injectable()
export class S3Adapter implements AlmacenamientoPort, OnModuleDestroy {
  private readonly cliente: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const valores = Object.fromEntries(VARIABLES_S3.map((clave) => [clave, config.get<string>(clave)]));
    validarVariablesS3(valores);
    this.bucket = valores.S3_BUCKET!;
    this.cliente = new S3Client({
      endpoint: valores.S3_ENDPOINT,
      region: valores.S3_REGION,
      credentials: { accessKeyId: valores.S3_ACCESS_KEY!, secretAccessKey: valores.S3_SECRET_KEY! },
      // Supabase Storage requiere rutas con el bucket, sin subdominios por bucket.
      forcePathStyle: true,
    });
  }

  async guardar(clave: string, contenido: Buffer, tipoMime: string): Promise<void> {
    validarClaveAlmacenamiento(clave);
    await this.cliente.send(new PutObjectCommand({
      Bucket: this.bucket, Key: clave, Body: contenido, ContentType: tipoMime,
    }));
  }

  async leer(clave: string): Promise<Buffer | null> {
    validarClaveAlmacenamiento(clave);
    try {
      const respuesta = await this.cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: clave }));
      if (!respuesta.Body) throw new Error('Respuesta S3 sin contenido de archivo.');
      return Buffer.from(await respuesta.Body.transformToByteArray());
    } catch (error) {
      if (esArchivoAusente(error)) return null;
      throw error;
    }
  }

  async eliminar(clave: string): Promise<void> {
    validarClaveAlmacenamiento(clave);
    try {
      await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }));
    } catch (error) {
      if (!esArchivoAusente(error)) throw error;
    }
  }

  onModuleDestroy(): void {
    this.cliente.destroy();
  }
}
