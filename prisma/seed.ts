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
  { codigo: 'A', nombre: 'Bloque A', pisos: 3 },
  { codigo: 'B', nombre: 'Bloque B', pisos: 2 },
  { codigo: 'C', nombre: 'Bloque C', pisos: 2 },
] as const;

interface EspacioEjemplo {
  codigo: string;
  nombre: string;
  tipo: (typeof TIPOS)[number]['codigo'];
  capacidad: number;
  elementos: [nombre: string, cantidad: number][];
  extra?: { minutosMontaje: number; minutosDesmontaje: number; depositoPorcentaje: number };
}

const ESPACIOS: EspacioEjemplo[] = [
  { codigo: 'A-101', nombre: 'Aula 101', tipo: 'AULA', capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-102', nombre: 'Aula 102', tipo: 'AULA', capacidad: 40, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 40]] },
  { codigo: 'A-201', nombre: 'Aula 201', tipo: 'AULA', capacidad: 35, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 35]] },
  { codigo: 'A-202', nombre: 'Sala de informática A-202', tipo: 'SALA_INFORMATICA', capacidad: 30, elementos: [['Computadores', 30], ['Videobeam', 1], ['Tablero', 1]] },
  { codigo: 'A-301', nombre: 'Sala de juntas A-301', tipo: 'SALA_JUNTAS', capacidad: 12, elementos: [['Videobeam', 1], ['Tablero', 1]] },
  {
    codigo: 'B-101',
    nombre: 'Auditorio Mayor',
    tipo: 'AUDITORIO',
    capacidad: 300,
    elementos: [['Sonido del auditorio', 1], ['Videobeam', 2], ['Sillas universitarias', 300]],
    extra: { minutosMontaje: 120, minutosDesmontaje: 60, depositoPorcentaje: 20 },
  },
  { codigo: 'B-102', nombre: 'Laboratorio de Redes', tipo: 'LABORATORIO', capacidad: 25, elementos: [['Switches', 6], ['Computadores', 25], ['Tablero', 1]] },
  { codigo: 'B-201', nombre: 'Laboratorio de Química', tipo: 'LABORATORIO', capacidad: 20, elementos: [['Tablero', 1]] },
  { codigo: 'B-202', nombre: 'Aula audiovisual', tipo: 'AULA', capacidad: 50, elementos: [['Videobeam', 1], ['Sillas universitarias', 50]] },
  { codigo: 'C-101', nombre: 'Cancha múltiple', tipo: 'ESCENARIO_DEPORTIVO', capacidad: 200, elementos: [] },
  { codigo: 'C-102', nombre: 'Sala de informática C-102', tipo: 'SALA_INFORMATICA', capacidad: 35, elementos: [['Computadores', 35], ['Videobeam', 1]] },
  { codigo: 'C-201', nombre: 'Aula 201 (bloque C)', tipo: 'AULA', capacidad: 45, elementos: [['Videobeam', 1], ['Tablero', 1], ['Sillas universitarias', 45]] },
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
      update: {},
      create: {
        sedeId: sede.id,
        codigo: b.codigo,
        nombre: b.nombre,
        descripcion: `${b.nombre} de la sede Mocoa ${EJEMPLO}`,
        numeroPisos: b.pisos,
        orden: indice + 1,
      },
    });
    bloques.set(b.codigo, bloque.id);
  }

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
    const piso = Number(e.codigo.split('-')[1].charAt(0));
    const datos = {
      bloqueId,
      tipoEspacioId: tipo.id,
      dependenciaId: deps.get('VICERRECTORIA_ADMINISTRATIVA'),
      responsableId: e.codigo === 'B-101' ? responsableAuditorio : null,
      nombre: e.nombre,
      piso,
      capacidadPersonas: e.capacidad,
      descripcion: `${e.nombre} ${EJEMPLO}`,
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

  const catalogo = [
    { proveedor: 'Grupo de danzas', nombre: 'Presentación del grupo de danzas', categoria: 'CULTURAL', unidad: 'EVENTO' },
    { proveedor: 'Coro institucional', nombre: 'Presentación del coro', categoria: 'CULTURAL', unidad: 'EVENTO' },
    { proveedor: 'Oficina de Sistemas', nombre: 'Sonido', categoria: 'TECNICO', unidad: 'HORA' },
    { proveedor: 'Oficina de Sistemas', nombre: 'Videobeam', categoria: 'TECNICO', unidad: 'HORA' },
    { proveedor: 'Catering', nombre: 'Refrigerio', categoria: 'ALIMENTACION', unidad: 'PERSONA' },
  ] as const;
  for (const s of catalogo) {
    const proveedorId = idDe(s.proveedor);
    const existente = await prisma.servicioComplementario.findFirst({
      where: { proveedorId, nombre: s.nombre },
    });
    if (existente) {
      await prisma.servicioComplementario.update({
        where: { id: existente.id },
        data: { categoria: s.categoria, unidadCobro: s.unidad },
      });
    } else {
      await prisma.servicioComplementario.create({
        data: {
          proveedorId,
          nombre: s.nombre,
          categoria: s.categoria,
          unidadCobro: s.unidad,
          descripcion: EJEMPLO,
        },
      });
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
  await bloqueos(ids, espacios);
  await servicios();
  console.log('Siembra completada: sede MOC, bloques A/B/C, 12 espacios y usuarios de prueba.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
