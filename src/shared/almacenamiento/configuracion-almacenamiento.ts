export const VARIABLES_S3 = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const;

export function validarProveedorAlmacenamiento(valor: unknown = 'disco'): 'disco' | 's3' {
  const proveedor = String(valor).trim();
  if (proveedor !== 'disco' && proveedor !== 's3') {
    throw new Error('ALMACENAMIENTO_PROVEEDOR debe ser disco o s3.');
  }
  return proveedor;
}

export function validarVariablesS3(configuracion: Record<string, unknown>): void {
  const faltantes = VARIABLES_S3.filter((clave) => {
    const valor = configuracion[clave];
    return typeof valor !== 'string' || valor.trim() === '';
  });
  if (faltantes.length) {
    throw new Error(`Faltan variables de almacenamiento para ALMACENAMIENTO_PROVEEDOR=s3: ${faltantes.join(', ')}.`);
  }
}
