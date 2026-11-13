import { describe, expect, it } from 'vitest';
import { validarConfiguracion } from '../../../shared/config/configuracion.js';

const base = {
  FRONTEND_URL: 'http://localhost:3000', DATABASE_URL: 'postgresql://ejemplo',
  JWT_ACCESS_SECRETO: 'ejemplo-access', JWT_REFRESH_SECRETO: 'ejemplo-refresh',
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', CORREO_REMITENTE: 'sira@ejemplo.com',
};
const wompi = {
  PASARELA_PROVEEDOR: 'wompi', WOMPI_LLAVE_PUBLICA: 'pub_test_ejemplo', WOMPI_LLAVE_PRIVADA: 'prv_test_ejemplo',
  WOMPI_SECRETO_EVENTOS: 'eventos_ejemplo', WOMPI_SECRETO_INTEGRIDAD: 'integridad_ejemplo',
};

describe('Configuración de pasarela', () => {
  it('con ninguna no requiere credenciales y conserva valores predeterminados', () => {
    expect(validarConfiguracion(base)).toMatchObject({ PASARELA_PROVEEDOR: 'ninguna', WOMPI_AMBIENTE: 'test',
      WOMPI_LLAVE_PUBLICA: '', WOMPI_SECRETO_EVENTOS: '',
      WOMPI_URL_API: 'https://sandbox.wompi.co/v1', PASARELA_CONSULTA_MINUTOS: 30, PASARELA_GRACIA_MINUTOS: 120 });
  });
  it('conserva las credenciales del archivo de entorno en la configuración validada', () => {
    expect(validarConfiguracion({ ...base, ...wompi })).toMatchObject(wompi);
  });
  it.each(['WOMPI_LLAVE_PUBLICA', 'WOMPI_LLAVE_PRIVADA', 'WOMPI_SECRETO_EVENTOS', 'WOMPI_SECRETO_INTEGRIDAD'])
    ('requiere %s al habilitar Wompi', (clave) => {
      expect(() => validarConfiguracion({ ...base, ...wompi, [clave]: '   ' })).toThrow(clave);
    });
  it('rechaza llaves de producción y URL ajena al sandbox', () => {
    expect(() => validarConfiguracion({ ...base, ...wompi, WOMPI_LLAVE_PUBLICA: 'pub_prod_ejemplo' })).toThrow('sandbox');
    expect(() => validarConfiguracion({ ...base, ...wompi, WOMPI_URL_API: 'https://otro.example/v1' })).toThrow('WOMPI_URL_API');
  });
  it('prod deriva la URL de producción y acepta únicamente llaves del mismo ambiente', () => {
    const produccion = { ...base, ...wompi, WOMPI_AMBIENTE: 'prod',
      WOMPI_LLAVE_PUBLICA: 'pub_prod_ejemplo', WOMPI_LLAVE_PRIVADA: 'prv_prod_ejemplo' };
    expect(validarConfiguracion(produccion)).toMatchObject({ WOMPI_AMBIENTE: 'prod', WOMPI_URL_API: 'https://production.wompi.co/v1' });
    expect(() => validarConfiguracion({ ...produccion, WOMPI_URL_API: 'https://sandbox.wompi.co/v1' })).toThrow('WOMPI_URL_API');
    expect(() => validarConfiguracion({ ...produccion, WOMPI_LLAVE_PRIVADA: 'prv_test_ejemplo' })).toThrow('ambiente prod');
    expect(() => validarConfiguracion({ ...base, WOMPI_AMBIENTE: 'otro' })).toThrow('WOMPI_AMBIENTE');
  });
  it('rechaza proveedor desconocido y plazos fraccionarios o fuera de rango', () => {
    expect(() => validarConfiguracion({ ...base, PASARELA_PROVEEDOR: 'otro' })).toThrow('PASARELA_PROVEEDOR');
    expect(() => validarConfiguracion({ ...base, PASARELA_CONSULTA_MINUTOS: '1.5' })).toThrow('PASARELA_CONSULTA_MINUTOS');
    expect(() => validarConfiguracion({ ...base, PASARELA_GRACIA_MINUTOS: '0' })).toThrow('PASARELA_GRACIA_MINUTOS');
  });
});
