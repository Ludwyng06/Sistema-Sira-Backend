// Datos de ejemplo de SIRA. Idempotente: se puede ejecutar varias veces sin duplicar.
// Todo dato de ejemplo se marca "(dato de ejemplo)" hasta tener los planos reales.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Rol, TipoSolicitante } from '../src/generated/prisma/enums.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const EJEMPLO = '(dato de ejemplo)';
const CONTRASENA_PRUEBA = 'Sira2026*';
const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);

// -----------------------------------------------------------------------------
// Parámetros (02-data-model.md §3.6 + cuenta de recaudo)
// -----------------------------------------------------------------------------
async function parametros() {
  const datos: [string, unknown, string][] = [
    ['dominios_institucionales', ['itp.edu.co', 'uniputumayo.edu.co'], 'Dominios de correo institucional.'],
    ['horas_plazo_revision', 72, 'Plazo de revisión de una solicitud enviada (RN-02a).'],
    ['horas_recordatorio_aprobador', 24, 'Horas para recordar al aprobador.'],
    ['horas_escalamiento_aprobador', 48, 'Horas para escalar la revisión.'],
    ['horas_plazo_pago', 48, 'Plazo de pago desde que queda cotizada (RN-02b).'],
    ['minutos_gracia_pago_pendiente', 120, 'Gracia para pagos con transacción pendiente (RN-02c).'],
    [
      'politica_cancelacion',
      [
        { diasAntes: 8, porcentaje: 100 },
        { diasAntes: 3, porcentaje: 50 },
        { diasAntes: 0, porcentaje: 0 },
      ],
      'Porcentaje reembolsable según los días de antelación (RN-14).',
    ],
    ['version_politica_datos', '2026-10', 'Versión vigente de la política de datos personales.'],
    ['minutos_vigencia_codigo', 15, 'Minutos de validez del código de verificación de correo.'],
    ['max_intentos_codigo', 5, 'Intentos permitidos por código de verificación.'],
    [
      'segundos_espera_reenvio_codigo',
      60,
      'Tiempo mínimo entre dos envíos del código (máximo 1 por minuto).',
    ],
    ['minutos_vigencia_enlace_recuperacion', 30, 'Minutos de validez del enlace para restablecer la contraseña.'],
    ['max_intentos_ingreso', 5, 'Intentos fallidos de ingreso antes de bloquear la cuenta (RF-AUT-10).'],
    ['minutos_bloqueo_ingreso', 15, 'Minutos que dura el bloqueo por intentos fallidos.'],
    [
      'cuenta_recaudo',
      {
        banco: '(por definir)',
        tipo: 'Ahorros',
        numero: '(por definir)',
        titular: 'Institución Universitaria del Putumayo',
        nit: '800.247.940-1',
      },
      'Cuenta donde se consignan los pagos.',
    ],
  ];
  for (const [clave, valor, descripcion] of datos) {
    await prisma.parametro.upsert({
      where: { clave },
      update: { valor: valor as never, descripcion },
      create: { clave, valor: valor as never, descripcion },
    });
  }
}

// -----------------------------------------------------------------------------
// Usuarios de prueba (se crean primero: dependencias y espacios los referencian)
// -----------------------------------------------------------------------------
interface UsuarioPrueba {
  correo: string;
  rol?: Rol;
  institucional: boolean;
}

const USUARIOS: UsuarioPrueba[] = [
  { correo: 'admin@itp.edu.co', rol: 'ADMINISTRADOR', institucional: true },
  { correo: 'vicerrectoria@itp.edu.co', rol: 'APROBADOR', institucional: true },
  // El responsable de espacio no es un UsuarioRol: se asigna con Espacio.responsableId.
  { correo: 'auditorio@itp.edu.co', institucional: true },
  { correo: 'tesoreria@itp.edu.co', rol: 'TESORERIA', institucional: true },
  { correo: 'control.interno@itp.edu.co', rol: 'AUDITOR', institucional: true },
  { correo: 'docente@itp.edu.co', rol: 'SOLICITANTE', institucional: true },
  { correo: 'empresa@ejemplo.com', rol: 'SOLICITANTE', institucional: false },
  { correo: 'persona@ejemplo.com', rol: 'SOLICITANTE', institucional: false },
];

async function usuarios() {
  const hashContrasena = await hash(CONTRASENA_PRUEBA, { type: argon2id });
  const ids = new Map<string, string>();
  for (const u of USUARIOS) {
    const usuario = await prisma.usuario.upsert({
      where: { correo: u.correo },
      // No se reescribe el hash: así la siembra repetida no cambia las contraseñas.
      update: { correoVerificado: true, esInstitucional: u.institucional, activo: true },
      create: {
        correo: u.correo,
        hashContrasena,
        correoVerificado: true,
        esInstitucional: u.institucional,
      },
    });
    ids.set(u.correo, usuario.id);
  }
  return ids;
}

/** `@@unique([usuarioId, rol, dependenciaId])` no deduplica NULL en PostgreSQL: se busca antes. */
async function asegurarRol(usuarioId: string, rol: Rol, dependenciaId: string | null) {
  const existe = await prisma.usuarioRol.findFirst({ where: { usuarioId, rol, dependenciaId } });
  if (!existe) await prisma.usuarioRol.create({ data: { usuarioId, rol, dependenciaId } });
}

// -----------------------------------------------------------------------------
// Dependencias y roles
// -----------------------------------------------------------------------------
async function dependencias(ids: Map<string, string>) {
  const lista = [
    { codigo: 'VICERRECTORIA_ADMINISTRATIVA', nombre: 'Vicerrectoría Administrativa', jefe: 'vicerrectoria@itp.edu.co' },
    { codigo: 'BIBLIOTECA', nombre: 'Biblioteca', jefe: undefined },
    { codigo: 'FACULTAD_INGENIERIA', nombre: 'Facultad de Ingeniería', jefe: undefined },
    { codigo: 'BIENESTAR_INSTITUCIONAL', nombre: 'Bienestar Institucional', jefe: undefined },
    { codigo: 'OFICINA_SISTEMAS', nombre: 'Oficina de Sistemas', jefe: undefined },
  ];
  const porCodigo = new Map<string, string>();
  for (const d of lista) {
    const jefeId = d.jefe ? ids.get(d.jefe) : undefined;
    const dependencia = await prisma.dependencia.upsert({
      where: { codigo: d.codigo },
      update: { nombre: d.nombre, ...(jefeId ? { jefeId } : {}) },
      create: { codigo: d.codigo, nombre: d.nombre, jefeId },
    });
    porCodigo.set(d.codigo, dependencia.id);
  }

  for (const u of USUARIOS) {
    if (!u.rol) continue;
    const usuarioId = ids.get(u.correo)!;
    // El aprobador queda con alcance en la Vicerrectoría Administrativa.
    const alcance = u.rol === 'APROBADOR' ? porCodigo.get('VICERRECTORIA_ADMINISTRATIVA')! : null;
    await asegurarRol(usuarioId, u.rol, alcance);
  }
  return porCodigo;
}

async function perfilesSolicitante(ids: Map<string, string>, deps: Map<string, string>) {
  const perfiles: {
    correo: string;
    tipo: TipoSolicitante;
    datos: Record<string, unknown>;
  }[] = [
    {
      correo: 'docente@itp.edu.co',
      tipo: 'INTERNO',
      datos: {
        nombres: 'Docente',
        apellidos: `de Ejemplo ${EJEMPLO}`,
        tipoDocumento: 'CC',
        numeroDocumento: '1000000001',
        telefono: '3000000001',
        dependenciaId: deps.get('FACULTAD_INGENIERIA'),
      },
    },
    {
      correo: 'empresa@ejemplo.com',
      tipo: 'EMPRESA',
      datos: {
        nombres: 'Representante',
        apellidos: `de Ejemplo ${EJEMPLO}`,
        razonSocial: `Empresa de Ejemplo S.A.S. ${EJEMPLO}`,
        tipoDocumento: 'NIT',
        numeroDocumento: '900123456-7',
        representanteLegal: 'Representante de Ejemplo',
        telefono: '3000000002',
        municipio: 'Mocoa',
      },
    },
    {
      correo: 'persona@ejemplo.com',
      tipo: 'PERSONA_NATURAL',
      datos: {
        nombres: 'Persona',
        apellidos: `de Ejemplo ${EJEMPLO}`,
        tipoDocumento: 'CC',
        numeroDocumento: '1000000002',
        telefono: '3000000003',
        municipio: 'Mocoa',
      },
    },
  ];
  for (const perfil of perfiles) {
    const usuarioId = ids.get(perfil.correo)!;
    const datos = { tipo: perfil.tipo, ...perfil.datos } as never;
    await prisma.solicitante.upsert({
      where: { usuarioId },
      update: datos,
      create: { usuarioId, ...(datos as object) } as never,
    });
  }
}

// -----------------------------------------------------------------------------
// Inventario
// -----------------------------------------------------------------------------
const TIPOS = [
  { codigo: 'AULA', nombre: 'Aula', dias: 2, poliza: null, base: 30000 },
  { codigo: 'SALA_INFORMATICA', nombre: 'Sala de informática', dias: 2, poliza: null, base: 45000 },
  { codigo: 'LABORATORIO', nombre: 'Laboratorio', dias: 3, poliza: null, base: 60000 },
  { codigo: 'AUDITORIO', nombre: 'Auditorio', dias: 2, poliza: 150, base: 250000 },
  { codigo: 'ESCENARIO_DEPORTIVO', nombre: 'Escenario deportivo', dias: 2, poliza: 150, base: 120000 },
  { codigo: 'SALA_JUNTAS', nombre: 'Sala de juntas', dias: 2, poliza: null, base: 40000 },
  { codigo: 'ZONA_VERDE', nombre: 'Zona verde', dias: 3, poliza: null, base: 20000 },
] as const;

const BLOQUES = [
  {
    codigo: 'A',
    nombre: 'Bloque A',
    pisos: 1,
    descripcion: 'Zona A · Aulas 105–125, Salas de informática 118–123 y Oficinas 101–104 (1 piso)',
  },
  {
    codigo: 'B',
    nombre: 'Bloque B',
    pisos: 2,
    descripcion: 'Bloque B · Piso 1: Aulas B101–B105 y Baterías Sanitarias · Piso 2: Aulas B201–B205 (2 pisos)',
  },
  {
    codigo: 'C',
    nombre: 'Bloque C',
    pisos: 2,
    descripcion: 'Bloque C · Piso 1: Aulas C101–C104 y Baterías Sanitarias · Piso 2: Aulas C201–C204 (2 pisos)',
  },
  {
    codigo: 'D',
    nombre: 'Edificio de Laboratorios, Auditorio y Cafetería',
    pisos: 2,
    descripcion: 'Auditorio Aula Múltiple (Aula 1 y Aula 2), Laboratorios de Ingeniería (Ambiental, Civil, Forestal, Sistemas, Mecánica de Fluidos), Hemeroteca, Xiloteca, Herbario y Cafetería (2 niveles)',
  },
  {
    codigo: 'E',
    nombre: 'Escenarios Deportivos',
    pisos: 1,
    descripcion: 'Cancha Sintética y Coliseo cubierto del campus Mocoa',
  },
  {
    codigo: 'F',
    nombre: 'Biblioteca, Administración y CIECYT',
    pisos: 1,
    descripcion: 'Biblioteca, Rectoría, Vicerrectorías, Tesorería, Presupuesto, Control Interno, Talento Humano, Jurídica, Archivo, CIECYT, Laboratorio y Meteorología',
  },
] as const;

interface EspacioEjemplo {
  codigo: string;
  nombre: string;
  tipo: (typeof TIPOS)[number]['codigo'];
  capacidad: number;
  piso?: number;
  areaM2?: number;
  elementos: [nombre: string, cantidad: number][];
  extra?: { minutosMontaje: number; minutosDesmontaje: number; depositoPorcentaje: number };
}

const ESPACIOS: EspacioEjemplo[] = [
  // ===========================================================================
  // BLOQUE A (Zona A — 1 piso según plano TOPOGRAFIA UNIPUTUMAYO.dwg)
  // ===========================================================================
  { codigo: 'A-101', nombre: 'OF. 101', tipo: 'SALA_JUNTAS', piso: 1, capacidad: 10, elementos: [['Tablero', 1], ['Escritorio', 2]] },
  { codigo: 'A-102', nombre: 'OF. 102', tipo: 'SALA_JUNTAS', piso: 1, capacidad: 10, elementos: [['Tablero', 1], ['Escritorio', 2]] },
  { codigo: 'A-103', nombre: 'OF. 103', tipo: 'SALA_JUNTAS', piso: 1, capacidad: 10, elementos: [['Tablero', 1], ['Escritorio', 2]] },
  { codigo: 'A-104', nombre: 'OF. 104', tipo: 'SALA_JUNTAS', piso: 1, capacidad: 10, elementos: [['Tablero', 1], ['Escritorio', 2]] },
  { codigo: 'A-105', nombre: 'Aula 105', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-106', nombre: 'Aula 106', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-107', nombre: 'Aula 107', tipo: 'AULA', piso: 1, capacidad: 35, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 35]] },
  { codigo: 'A-108', nombre: 'Aula 108', tipo: 'AULA', piso: 1, capacidad: 35, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 35]] },
  { codigo: 'A-109', nombre: 'Aula 109', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-110', nombre: 'Aula 110', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-111', nombre: 'Aula 111', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-112', nombre: 'Aula 112', tipo: 'AULA', piso: 1, capacidad: 35, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 35]] },
  { codigo: 'A-113', nombre: 'Aula 113', tipo: 'AULA', piso: 1, capacidad: 35, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 35]] },
  { codigo: 'A-114', nombre: 'Aula 114', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-115', nombre: 'Aula 115', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-116', nombre: 'Aula 116', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-117', nombre: 'Aula 117', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-118', nombre: 'Sala de info. 118', tipo: 'SALA_INFORMATICA', piso: 1, capacidad: 30, elementos: [['Computadores', 30], ['Videobeam', 1], ['Tablero', 1]] },
  { codigo: 'A-119', nombre: 'Sala de info. 119', tipo: 'SALA_INFORMATICA', piso: 1, capacidad: 30, elementos: [['Computadores', 30], ['Videobeam', 1], ['Tablero', 1]] },
  { codigo: 'A-120', nombre: 'Sala de info. 120', tipo: 'SALA_INFORMATICA', piso: 1, capacidad: 30, elementos: [['Computadores', 30], ['Videobeam', 1], ['Tablero', 1]] },
  { codigo: 'A-121', nombre: 'Sala de info. 121', tipo: 'SALA_INFORMATICA', piso: 1, capacidad: 30, elementos: [['Computadores', 30], ['Videobeam', 1], ['Tablero', 1]] },
  { codigo: 'A-122', nombre: 'Aula 122', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-123', nombre: 'Sala de info. 123', tipo: 'SALA_INFORMATICA', piso: 1, capacidad: 30, elementos: [['Computadores', 30], ['Videobeam', 1], ['Tablero', 1]] },
  { codigo: 'A-124', nombre: 'Aula 124', tipo: 'AULA', piso: 1, capacidad: 45, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 45]] },
  { codigo: 'A-125', nombre: 'Aula 125', tipo: 'AULA', piso: 1, capacidad: 45, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 45]] },

  // ===========================================================================
  // BLOQUE B (2 pisos: P1. B101–B105 y P2. B201–B205 según plano DWG)
  // ===========================================================================
  { codigo: 'B-101', nombre: 'Aula B101 (P1. B101)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-102', nombre: 'Aula B102 (P1. B102)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-103', nombre: 'Aula B103 (P1. B103)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-104', nombre: 'Aula B104 (P1. B104)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-105', nombre: 'Aula B105 (P1. B105)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-201', nombre: 'Aula B201 (P2. B201)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-202', nombre: 'Aula B202 (P2. B202)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-203', nombre: 'Aula B203 (P2. B203)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-204', nombre: 'Aula B204 (P2. B204)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'B-205', nombre: 'Aula B205 (P2. B205)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },

  // ===========================================================================
  // BLOQUE C (2 pisos: P1. C101–C104 y P2. C201–C204 según plano DWG)
  // ===========================================================================
  { codigo: 'C-101', nombre: 'Aula C101 (P1. C101)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'C-102', nombre: 'Aula C102 (P1. C102)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'C-103', nombre: 'Aula C103 (P1. C103)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'C-104', nombre: 'Aula C104 (P1. C104)', tipo: 'AULA', piso: 1, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'C-201', nombre: 'Aula C201 (P2. C201)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'C-202', nombre: 'Aula C202 (P2. C202)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'C-203', nombre: 'Aula C203 (P2. C203)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'C-204', nombre: 'Aula C204 (P2. C204)', tipo: 'AULA', piso: 2, capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },

  // ===========================================================================
  // BLOQUE D (Edificio de Laboratorios, Auditorio y Cafetería — 2 niveles N 0.00m y +4.70m)
  // ===========================================================================
  {
    codigo: 'D-101',
    nombre: 'Auditorio Aula Múltiple (divisible en Aula 1 y Aula 2)',
    tipo: 'AUDITORIO',
    piso: 1,
    areaM2: 304,
    capacidad: 216,
    elementos: [['Sonido del auditorio', 1], ['Videobeam', 2], ['Escenario y camerinos', 1], ['Sillas universitarias', 216]],
    extra: { minutosMontaje: 120, minutosDesmontaje: 60, depositoPorcentaje: 20 },
  },
  { codigo: 'D-102', nombre: 'Laboratorio Ingeniería Ambiental', tipo: 'LABORATORIO', piso: 1, areaM2: 86, capacidad: 30, elementos: [['Cromatografía y absorción atómica', 1], ['Mesas de laboratorio', 8], ['Tablero', 1]] },
  { codigo: 'D-103', nombre: 'Laboratorio mecánica de fluidos e hidráulica', tipo: 'LABORATORIO', piso: 1, areaM2: 38, capacidad: 10, elementos: [['Banco hidráulico', 1], ['Tablero', 1]] },
  { codigo: 'D-104', nombre: 'Laboratorio Ingeniería Civil', tipo: 'LABORATORIO', piso: 1, areaM2: 173, capacidad: 30, elementos: [['Máquina de los Ángeles', 1], ['Prensa CBR y granulometría', 1], ['Tablero', 1]] },
  { codigo: 'D-105', nombre: 'Laboratorio Ingeniería Forestal', tipo: 'LABORATORIO', piso: 1, areaM2: 126, capacidad: 30, elementos: [['Mesas de pesaje y lavado', 6], ['Tablero', 1]] },
  { codigo: 'D-106', nombre: 'Herbario', tipo: 'LABORATORIO', piso: 1, capacidad: 20, elementos: [['Gabinetes botánicos', 10], ['Mesas de estudio', 4]] },
  { codigo: 'D-107', nombre: 'Hemeroteca', tipo: 'SALA_JUNTAS', piso: 1, capacidad: 25, elementos: [['Estanterías de consulta', 8], ['Mesas de lectura', 6]] },
  { codigo: 'D-108', nombre: 'Xiloteca', tipo: 'LABORATORIO', piso: 1, capacidad: 20, elementos: [['Colección de maderas', 1], ['Mesas de observación', 4]] },
  { codigo: 'D-109', nombre: 'Cafetería · Mesas internas y Patio de mesas', tipo: 'ZONA_VERDE', piso: 1, areaM2: 324, capacidad: 112, elementos: [['Mesas internas (52 pers.)', 13], ['Mesas externas (60 pers.)', 15]] },
  { codigo: 'D-201', nombre: 'Laboratorios Ingeniería de Sistemas', tipo: 'LABORATORIO', piso: 2, capacidad: 30, elementos: [['Switches y servidores', 6], ['Computadores', 30], ['Tablero', 1]] },
  { codigo: 'D-202', nombre: 'Aula Informática 1 (Nivel +4.70)', tipo: 'SALA_INFORMATICA', piso: 2, areaM2: 61, capacidad: 24, elementos: [['Computadores', 24], ['Videobeam', 1], ['Tablero', 1]] },
  { codigo: 'D-203', nombre: 'Aula Informática 2 (Nivel +4.70)', tipo: 'SALA_INFORMATICA', piso: 2, areaM2: 61, capacidad: 24, elementos: [['Computadores', 24], ['Videobeam', 1], ['Tablero', 1]] },
  { codigo: 'D-204', nombre: 'Espacio Multifuncional (Cubierta espacio de trabajo)', tipo: 'AULA', piso: 2, capacidad: 60, elementos: [['Videobeam', 1], ['Mesas de trabajo colaborativo', 12]] },

  // ===========================================================================
  // BLOQUE E (Escenarios Deportivos del Campus)
  // ===========================================================================
  { codigo: 'E-101', nombre: 'Cancha Sintética', tipo: 'ESCENARIO_DEPORTIVO', piso: 1, capacidad: 200, elementos: [['Arcos de fútbol', 2], ['Malla perimetral e iluminación', 1]] },
  { codigo: 'E-102', nombre: 'Coliseo', tipo: 'ESCENARIO_DEPORTIVO', piso: 1, capacidad: 500, elementos: [['Cancha múltiple cubierta', 1], ['Graderías', 1], ['Sonido ambiental', 1]] },

  // ===========================================================================
  // BLOQUE F (Biblioteca, Administración, CIECYT y Laboratorio Central)
  // ===========================================================================
  { codigo: 'F-101', nombre: 'Biblioteca', tipo: 'SALA_JUNTAS', piso: 1, capacidad: 60, elementos: [['Mesas de lectura', 15], ['Videobeam', 1], ['Estanterías', 20]] },
  { codigo: 'F-102', nombre: 'CIECYT · Área de Trabajo', tipo: 'SALA_JUNTAS', piso: 1, capacidad: 25, elementos: [['Videobeam', 1], ['Tablero', 1], ['Mesas de investigación', 6]] },
  { codigo: 'F-103', nombre: 'Laboratorio Central', tipo: 'LABORATORIO', piso: 1, capacidad: 25, elementos: [['Mesas de laboratorio', 6], ['Tablero', 1]] },
  { codigo: 'F-104', nombre: 'Estación de Meteorología y Huerta', tipo: 'ZONA_VERDE', piso: 1, capacidad: 30, elementos: [['Caseta meteorológica', 1], ['Área de huerta', 1]] },
];

/** Tarifa por hora de prueba según el tipo de solicitante. */
const FACTOR: Record<'PERSONA_NATURAL' | 'EMPRESA' | 'ENTIDAD' | 'INTERNO', number> = {
  PERSONA_NATURAL: 1,
  EMPRESA: 1.5,
  ENTIDAD: 1.2,
  INTERNO: 0,
};

async function inventario(ids: Map<string, string>, deps: Map<string, string>) {
  const sede = await prisma.sede.upsert({
    where: { codigo: 'MOC' },
    update: {},
    create: {
      codigo: 'MOC',
      nombre: 'Mocoa',
      municipio: 'Mocoa',
      direccion: 'Sede principal "Aire Libre", barrio Luis Carlos Galán',
      orden: 1,
    },
  });

  const bloques = new Map<string, string>();
  for (const [indice, b] of BLOQUES.entries()) {
    const bloque = await prisma.bloque.upsert({
      where: { sedeId_codigo: { sedeId: sede.id, codigo: b.codigo } },
      update: {
        nombre: b.nombre,
        descripcion: b.descripcion,
        numeroPisos: b.pisos,
        orden: indice + 1,
      },
      create: {
        sedeId: sede.id,
        codigo: b.codigo,
        nombre: b.nombre,
        descripcion: b.descripcion,
        numeroPisos: b.pisos,
        orden: indice + 1,
      },
    });
    bloques.set(b.codigo, bloque.id);
  }

  // Dejar fuera de servicio espacios que no pertenezcan al plano real de la sede (p. ej. piso 3 inexistente A-301, A-201, A-202)
  await prisma.espacio.updateMany({
    where: {
      codigo: { notIn: ESPACIOS.map((e) => e.codigo) },
      bloqueId: { in: [...bloques.values()] },
    },
    data: { estado: 'FUERA_DE_SERVICIO' },
  });

  const tipos = new Map<string, { id: string; base: number }>();
  for (const t of TIPOS) {
    const tipo = await prisma.tipoEspacio.upsert({
      where: { codigo: t.codigo },
      update: {
        nombre: t.nombre,
        anticipacionMinimaDias: t.dias,
        anticipacionEnHabiles: true,
        aforoExigePoliza: t.poliza,
      },
      create: {
        codigo: t.codigo,
        nombre: t.nombre,
        anticipacionMinimaDias: t.dias,
        anticipacionEnHabiles: true,
        aforoExigePoliza: t.poliza,
      },
    });
    tipos.set(t.codigo, { id: tipo.id, base: t.base });
  }

  const responsableAuditorio = ids.get('auditorio@itp.edu.co')!;
  const espacios = new Map<string, string>();
  for (const e of ESPACIOS) {
    const bloqueId = bloques.get(e.codigo.charAt(0))!;
    const tipo = tipos.get(e.tipo)!;
    const piso = e.piso ?? Number(e.codigo.split('-')[1].charAt(0));
    const datos = {
      bloqueId,
      tipoEspacioId: tipo.id,
      dependenciaId: deps.get('VICERRECTORIA_ADMINISTRATIVA'),
      responsableId: e.codigo === 'D-101' ? responsableAuditorio : null,
      nombre: e.nombre,
      piso,
      areaM2: e.areaM2 ?? null,
      capacidadPersonas: e.capacidad,
      descripcion: `${e.nombre} · Sede Mocoa`,
      estado: 'DISPONIBLE' as const,
      minutosMontaje: e.extra?.minutosMontaje ?? 0,
      minutosDesmontaje: e.extra?.minutosDesmontaje ?? 0,
      depositoPorcentaje: e.extra?.depositoPorcentaje ?? null,
    };
    const espacio = await prisma.espacio.upsert({
      where: { codigo: e.codigo },
      update: datos,
      create: { codigo: e.codigo, ...datos },
    });
    espacios.set(e.codigo, espacio.id);

    // Dotación de ejemplo (la placa de inventario es la clave de idempotencia).
    for (const [indice, [nombre, cantidad]] of e.elementos.entries()) {
      const placaInventario = `EJ-${e.codigo}-${indice + 1}`;
      await prisma.elemento.upsert({
        where: { placaInventario },
        update: { nombre, cantidad },
        create: {
          espacioId: espacio.id,
          placaInventario,
          nombre: `${nombre}`,
          cantidad,
          esPrestable: false,
        },
      });
    }

    // Tarifas por hora de prueba.
    for (const tipoSolicitante of ['PERSONA_NATURAL', 'EMPRESA', 'ENTIDAD', 'INTERNO'] as const) {
      const valor = Math.round((tipo.base * FACTOR[tipoSolicitante]) / 1000) * 1000;
      const vigenciaDesde = fecha('2026-01-01');
      const existente = await prisma.tarifa.findFirst({
        where: { espacioId: espacio.id, tipoSolicitante, unidad: 'HORA', vigenciaDesde },
      });
      const datosTarifa = {
        valor,
        acuerdoSoporte: 'VALORES DE PRUEBA - pendiente acuerdo de tarifas',
      };
      if (existente) {
        await prisma.tarifa.update({ where: { id: existente.id }, data: datosTarifa });
      } else {
        await prisma.tarifa.create({
          data: {
            espacioId: espacio.id,
            tipoSolicitante,
            unidad: 'HORA',
            vigenciaDesde,
            ...datosTarifa,
          },
        });
      }
    }
  }
  return espacios;
}

// -----------------------------------------------------------------------------
// Tarifario auxiliar: recargos, festivos y SMMLV
// -----------------------------------------------------------------------------
async function tarifario() {
  const recargos = [
    { tipo: 'NOCTURNO', porcentaje: 20, desdeHora: '18:00' },
    { tipo: 'DOMINICAL', porcentaje: 25, desdeHora: null },
    { tipo: 'FESTIVO', porcentaje: 25, desdeHora: null },
  ] as const;
  for (const r of recargos) {
    await prisma.recargo.upsert({
      where: { tipo: r.tipo },
      update: { porcentaje: r.porcentaje, desdeHora: r.desdeHora },
      create: { tipo: r.tipo, porcentaje: r.porcentaje, desdeHora: r.desdeHora },
    });
  }

  const festivos: [string, string][] = [
    ['2026-01-01', 'Año Nuevo'],
    ['2026-01-12', 'Día de los Reyes Magos'],
    ['2026-03-23', 'Día de San José'],
    ['2026-04-02', 'Jueves Santo'],
    ['2026-04-03', 'Viernes Santo'],
    ['2026-05-01', 'Día del Trabajo'],
    ['2026-05-18', 'Ascensión del Señor'],
    ['2026-06-08', 'Corpus Christi'],
    ['2026-06-15', 'Sagrado Corazón'],
    ['2026-06-29', 'San Pedro y San Pablo'],
    ['2026-07-20', 'Día de la Independencia'],
    ['2026-08-07', 'Batalla de Boyacá'],
    ['2026-08-17', 'Asunción de la Virgen'],
    ['2026-10-12', 'Día de la Raza'],
    ['2026-11-02', 'Día de Todos los Santos'],
    ['2026-11-16', 'Independencia de Cartagena'],
    ['2026-12-08', 'Inmaculada Concepción'],
    ['2026-12-25', 'Navidad'],
  ];
  for (const [iso, nombre] of festivos) {
    await prisma.festivo.upsert({
      where: { fecha: fecha(iso) },
      update: { nombre },
      create: { fecha: fecha(iso), nombre },
    });
  }

  // ⚠️ Verificar el valor oficial del decreto del SMMLV 2026 antes de usarlo.
  await prisma.smmlv.upsert({
    where: { anio: 2026 },
    update: { valor: 1750905 },
    create: { anio: 2026, valor: 1750905 },
  });
}

// -----------------------------------------------------------------------------
// Bloqueos de ejemplo: una clase recurrente y un mantenimiento
// -----------------------------------------------------------------------------
// Ids fijos: así la siembra repetida actualiza las mismas filas en vez de duplicarlas.
const ID_BLOQUEO_CLASE = '00000000-0000-4000-8000-000000000001';
const ID_BLOQUEO_MANTENIMIENTO = '00000000-0000-4000-8000-000000000002';
const idFranja = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

// -----------------------------------------------------------------------------
// Horario de operación (RN-19). Lunes a viernes 06:00-22:00, sábado 06:00-18:00; domingo cerrado.
// 0 = domingo ... 6 = sábado. Valores de prueba hasta que Vicerrectoría confirme los reales.
// -----------------------------------------------------------------------------
const HORARIO_OPERACION: [number, string, string][] = [
  [1, '06:00', '22:00'],
  [2, '06:00', '22:00'],
  [3, '06:00', '22:00'],
  [4, '06:00', '22:00'],
  [5, '06:00', '22:00'],
  [6, '06:00', '18:00'],
];

async function horarios(espacios: Map<string, string>) {
  for (const espacioId of espacios.values()) {
    for (const [diaSemana, abre, cierra] of HORARIO_OPERACION) {
      await prisma.horarioOperacion.upsert({
        where: { espacioId_diaSemana: { espacioId, diaSemana } },
        update: { abre, cierra },
        create: { espacioId, diaSemana, abre, cierra },
      });
    }
  }
}

async function bloqueos(ids: Map<string, string>, espacios: Map<string, string>) {
  const creadoPorId = ids.get('admin@itp.edu.co')!;
  const aulaA101 = espacios.get('A-101')!;
  const labB102 = espacios.get('B-102')!;

  // Lunes de 7:00 a 9:00 (Bogotá = UTC-5) durante 8 semanas desde el 19 de octubre de 2026.
  const MS_SEMANA = 7 * 24 * 60 * 60 * 1000;
  const primerLunes = Date.parse('2026-10-19T12:00:00Z');
  const clases = Array.from({ length: 8 }, (_, i) => ({
    inicio: new Date(primerLunes + i * MS_SEMANA),
    fin: new Date(primerLunes + i * MS_SEMANA + 2 * 60 * 60 * 1000),
  }));

  await prisma.bloqueoCalendario.upsert({
    where: { id: ID_BLOQUEO_CLASE },
    update: {},
    create: {
      id: ID_BLOQUEO_CLASE,
      espacioId: aulaA101,
      motivo: 'CLASE',
      descripcion: `Clase recurrente de ejemplo ${EJEMPLO}`,
      inicio: clases[0].inicio,
      fin: clases[0].fin,
      rrule: 'FREQ=WEEKLY;COUNT=8;BYDAY=MO',
      repetirHasta: clases[7].fin,
      origen: 'MANUAL',
      creadoPorId,
    },
  });
  for (const [i, clase] of clases.entries()) {
    await prisma.franjaOcupada.upsert({
      where: { id: idFranja(i + 1) },
      update: { inicio: clase.inicio, fin: clase.fin },
      create: {
        id: idFranja(i + 1),
        espacioId: aulaA101,
        inicio: clase.inicio,
        fin: clase.fin,
        estado: 'BLOQUEO',
        origen: 'CLASE',
        bloqueoId: ID_BLOQUEO_CLASE,
        etiquetaPublica: 'Clase',
      },
    });
  }

  // Mantenimiento del laboratorio de redes: jueves 22 de octubre, 14:00 a 18:00 (Bogotá).
  const inicioMantenimiento = new Date('2026-10-22T19:00:00Z');
  const finMantenimiento = new Date('2026-10-22T23:00:00Z');
  await prisma.bloqueoCalendario.upsert({
    where: { id: ID_BLOQUEO_MANTENIMIENTO },
    update: {},
    create: {
      id: ID_BLOQUEO_MANTENIMIENTO,
      espacioId: labB102,
      motivo: 'MANTENIMIENTO',
      descripcion: `Mantenimiento de equipos de red ${EJEMPLO}`,
      inicio: inicioMantenimiento,
      fin: finMantenimiento,
      origen: 'MANUAL',
      creadoPorId,
    },
  });
  await prisma.franjaOcupada.upsert({
    where: { id: idFranja(20) },
    update: { inicio: inicioMantenimiento, fin: finMantenimiento },
    create: {
      id: idFranja(20),
      espacioId: labB102,
      inicio: inicioMantenimiento,
      fin: finMantenimiento,
      estado: 'BLOQUEO',
      origen: 'MANTENIMIENTO',
      bloqueoId: ID_BLOQUEO_MANTENIMIENTO,
      etiquetaPublica: 'Mantenimiento',
    },
  });
}

// -----------------------------------------------------------------------------
// Proveedores y servicios complementarios
// -----------------------------------------------------------------------------
async function servicios() {
  const proveedores = [
    { nombre: `Grupo de danzas Uniputumayo ${EJEMPLO}`, tipo: 'INTERNO', admin: 0 },
    { nombre: `Coro institucional ${EJEMPLO}`, tipo: 'INTERNO', admin: 0 },
    { nombre: `Oficina de Sistemas · sonido y video ${EJEMPLO}`, tipo: 'INTERNO', admin: 0 },
    { nombre: `Catering de ejemplo ${EJEMPLO}`, tipo: 'EXTERNO', admin: 10 },
  ] as const;
  const ids = new Map<string, string>();
  for (const p of proveedores) {
    const existente = await prisma.proveedor.findFirst({ where: { nombre: p.nombre } });
    const proveedor = existente
      ? await prisma.proveedor.update({
          where: { id: existente.id },
          data: { tipo: p.tipo, porcentajeAdministracion: p.admin },
        })
      : await prisma.proveedor.create({
          data: { nombre: p.nombre, tipo: p.tipo, porcentajeAdministracion: p.admin },
        });
    ids.set(p.nombre, proveedor.id);
  }
  const idDe = (prefijo: string) =>
    [...ids.entries()].find(([nombre]) => nombre.startsWith(prefijo))![1];

  // Restricciones de ejemplo (RF-SVC-04) hasta que la institución defina las reales.
  // Lista vacía = el servicio aplica a todos los tipos de espacio.
  const ESCENICOS = ['AUDITORIO', 'ESCENARIO_DEPORTIVO', 'ZONA_VERDE'];
  const SIN_LABORATORIOS = TIPOS.map((t) => t.codigo).filter(
    (c) => c !== 'LABORATORIO' && c !== 'SALA_INFORMATICA',
  );
  const catalogo: {
    proveedor: string;
    nombre: string;
    categoria: 'CULTURAL' | 'TECNICO' | 'ALIMENTACION';
    unidad: 'EVENTO' | 'HORA' | 'PERSONA';
    /** Tarifa de ejemplo para persona natural; las demás salen de FACTOR. */
    base: number;
    tipos: string[];
  }[] = [
    { proveedor: 'Grupo de danzas', nombre: 'Presentación del grupo de danzas', categoria: 'CULTURAL', unidad: 'EVENTO', base: 400_000, tipos: ESCENICOS },
    { proveedor: 'Coro institucional', nombre: 'Presentación del coro', categoria: 'CULTURAL', unidad: 'EVENTO', base: 350_000, tipos: ESCENICOS },
    { proveedor: 'Oficina de Sistemas', nombre: 'Sonido', categoria: 'TECNICO', unidad: 'HORA', base: 50_000, tipos: [] },
    { proveedor: 'Oficina de Sistemas', nombre: 'Videobeam', categoria: 'TECNICO', unidad: 'HORA', base: 30_000, tipos: [] },
    { proveedor: 'Catering', nombre: 'Refrigerio', categoria: 'ALIMENTACION', unidad: 'PERSONA', base: 8_000, tipos: SIN_LABORATORIOS },
  ];
  for (const s of catalogo) {
    const proveedorId = idDe(s.proveedor);
    const tipoIds = (
      await prisma.tipoEspacio.findMany({ where: { codigo: { in: s.tipos } }, select: { id: true } })
    ).map((t) => ({ id: t.id }));
    const existente = await prisma.servicioComplementario.findFirst({
      where: { proveedorId, nombre: s.nombre },
    });
    let servicioId: string;
    if (existente) {
      servicioId = existente.id;
      await prisma.servicioComplementario.update({
        where: { id: existente.id },
        data: { categoria: s.categoria, unidadCobro: s.unidad, tiposPermitidos: { set: tipoIds } },
      });
    } else {
      servicioId = (await prisma.servicioComplementario.create({
        data: {
          proveedorId,
          nombre: s.nombre,
          categoria: s.categoria,
          unidadCobro: s.unidad,
          descripcion: EJEMPLO,
          tiposPermitidos: { connect: tipoIds },
        },
      })).id;
    }

    // Tarifas de ejemplo por tipo de solicitante. En servicios `unidad` va nula: la define el servicio
    // (`unidadCobro`: EVENTO, HORA o PERSONA), y `agregarServicio` la busca sin filtrar por unidad.
    for (const tipoSolicitante of ['PERSONA_NATURAL', 'EMPRESA', 'ENTIDAD', 'INTERNO'] as const) {
      const vigenciaDesde = fecha('2026-01-01');
      const datosTarifa = {
        valor: Math.round((s.base * FACTOR[tipoSolicitante]) / 1000) * 1000,
        ivaAplica: false,
        porcentajeIva: 0,
        acuerdoSoporte: 'VALORES DE PRUEBA - pendiente acuerdo de tarifas',
      };
      const tarifaExistente = await prisma.tarifa.findFirst({
        where: { servicioId, tipoSolicitante, vigenciaDesde },
      });
      if (tarifaExistente) {
        await prisma.tarifa.update({ where: { id: tarifaExistente.id }, data: datosTarifa });
      } else {
        await prisma.tarifa.create({ data: { servicioId, tipoSolicitante, vigenciaDesde, ...datosTarifa } });
      }
    }
  }
}

async function main() {
  await parametros();
  const ids = await usuarios();
  const deps = await dependencias(ids);
  await perfilesSolicitante(ids, deps);
  const espacios = await inventario(ids, deps);
  await tarifario();
  await horarios(espacios);
  await bloqueos(ids, espacios);
  await servicios();
  console.log(`Siembra completada: sede MOC, ${BLOQUES.length} bloques del plano DWG y ${ESPACIOS.length} espacios con horario y usuarios de prueba.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
