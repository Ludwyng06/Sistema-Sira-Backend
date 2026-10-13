-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SOLICITANTE', 'RESPONSABLE_ESPACIO', 'APROBADOR', 'TESORERIA', 'ADMINISTRADOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "TipoSolicitante" AS ENUM ('PERSONA_NATURAL', 'EMPRESA', 'ENTIDAD', 'INTERNO');

-- CreateEnum
CREATE TYPE "TipoDocumentoIdentidad" AS ENUM ('CC', 'CE', 'NIT', 'PASAPORTE', 'TI');

-- CreateEnum
CREATE TYPE "EstadoEspacio" AS ENUM ('DISPONIBLE', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO');

-- CreateEnum
CREATE TYPE "EstadoFisico" AS ENUM ('BUENO', 'REGULAR', 'MALO');

-- CreateEnum
CREATE TYPE "EstadoElemento" AS ENUM ('EN_SERVICIO', 'EN_REPARACION', 'DADO_DE_BAJA');

-- CreateEnum
CREATE TYPE "UnidadCobroTarifa" AS ENUM ('HORA', 'JORNADA_MANANA', 'JORNADA_TARDE', 'JORNADA_NOCHE', 'DIA');

-- CreateEnum
CREATE TYPE "UnidadCobroServicio" AS ENUM ('EVENTO', 'HORA', 'PERSONA', 'UNIDAD');

-- CreateEnum
CREATE TYPE "CategoriaServicio" AS ENUM ('CULTURAL', 'COMUNICACIONES', 'ALIMENTACION', 'TECNICO', 'LOGISTICA');

-- CreateEnum
CREATE TYPE "TipoProveedor" AS ENUM ('INTERNO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "TipoRecargo" AS ENUM ('NOCTURNO', 'DOMINICAL', 'FESTIVO');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('BORRADOR', 'ENVIADA', 'EN_REVISION', 'COTIZADA', 'PAGO_PENDIENTE', 'CONFIRMADA', 'EN_USO', 'FINALIZADA', 'CERRADA', 'RECHAZADA', 'VENCIDA', 'CANCELADA', 'REEMBOLSADA');

-- CreateEnum
CREATE TYPE "TipoDecision" AS ENUM ('AVAL', 'APROBACION');

-- CreateEnum
CREATE TYPE "ResultadoDecision" AS ENUM ('APROBADA', 'RECHAZADA', 'DEVUELTA', 'RECLASIFICADA');

-- CreateEnum
CREATE TYPE "EstadoConfirmacionServicio" AS ENUM ('PENDIENTE', 'ACEPTADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "TipoDocumentoAdjunto" AS ENUM ('CARTA_SOLICITUD', 'RUT', 'CAMARA_COMERCIO', 'CEDULA_REPRESENTANTE', 'POLIZA', 'ORDEN_SERVICIO', 'OTRO');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('PASARELA', 'CONSIGNACION', 'ORDEN_SERVICIO');

-- CreateEnum
CREATE TYPE "EstadoOrdenPago" AS ENUM ('PENDIENTE', 'EN_VERIFICACION', 'APROBADA', 'RECHAZADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoReembolso" AS ENUM ('SOLICITADO', 'APLICADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "EstadoFranja" AS ENUM ('RETENIDA', 'CONFIRMADA', 'BLOQUEO', 'LIBERADA');

-- CreateEnum
CREATE TYPE "OrigenFranja" AS ENUM ('RESERVA', 'CLASE', 'MANTENIMIENTO', 'FESTIVO', 'EVENTO_INSTITUCIONAL', 'BLOQUEO_MANUAL');

-- CreateEnum
CREATE TYPE "TipoActa" AS ENUM ('ENTREGA', 'DEVOLUCION');

-- CreateEnum
CREATE TYPE "TipoConsecutivo" AS ENUM ('SOLICITUD', 'COTIZACION', 'ORDEN_PAGO', 'ACTA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "correo_verificado" BOOLEAN NOT NULL DEFAULT false,
    "es_institucional" BOOLEAN NOT NULL DEFAULT false,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(3),
    "mfa_secreto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_ingreso_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_rol" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "rol" "Rol" NOT NULL,
    "dependencia_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion_refresh" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "hash_token" TEXT NOT NULL,
    "familia" UUID NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "revocado_en" TIMESTAMPTZ(3),
    "ip" TEXT,
    "user_agent" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigo_verificacion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "proposito" TEXT NOT NULL,
    "hash_codigo" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usado_en" TIMESTAMPTZ(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimiento_datos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "version_politica" TEXT NOT NULL,
    "aceptado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT,

    CONSTRAINT "consentimiento_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitante" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoSolicitante" NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT,
    "razon_social" TEXT,
    "tipo_documento" "TipoDocumentoIdentidad" NOT NULL,
    "numero_documento" TEXT NOT NULL,
    "representante_legal" TEXT,
    "telefono" TEXT NOT NULL,
    "direccion" TEXT,
    "municipio" TEXT,
    "dependencia_id" UUID,
    "anonimizado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "solicitante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependencia" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "centro_costo" TEXT,
    "jefe_id" UUID,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sede" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "municipio" TEXT NOT NULL,
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "telefono" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloque" (
    "id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "plano_url" TEXT,
    "numero_pisos" INTEGER NOT NULL DEFAULT 1,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bloque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_espacio" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "anticipacion_minima_dias" INTEGER NOT NULL DEFAULT 3,
    "anticipacion_en_habiles" BOOLEAN NOT NULL DEFAULT true,
    "aforo_exige_poliza" INTEGER,
    "icono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_espacio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espacio" (
    "id" UUID NOT NULL,
    "bloque_id" UUID NOT NULL,
    "tipo_espacio_id" UUID NOT NULL,
    "dependencia_id" UUID,
    "responsable_id" UUID,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "piso" INTEGER NOT NULL DEFAULT 1,
    "capacidad_personas" INTEGER NOT NULL,
    "area_m2" DECIMAL(8,2),
    "descripcion" TEXT,
    "condiciones_uso" TEXT,
    "requiere_aval" BOOLEAN NOT NULL DEFAULT true,
    "es_reservable" BOOLEAN NOT NULL DEFAULT true,
    "estado" "EstadoEspacio" NOT NULL DEFAULT 'DISPONIBLE',
    "valor_comercial_referencia" INTEGER,
    "minutos_montaje" INTEGER NOT NULL DEFAULT 0,
    "minutos_desmontaje" INTEGER NOT NULL DEFAULT 0,
    "deposito_valor_fijo" INTEGER,
    "deposito_porcentaje" DECIMAL(5,2),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "archivado_en" TIMESTAMPTZ(3),

    CONSTRAINT "espacio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horario_operacion" (
    "id" UUID NOT NULL,
    "espacio_id" UUID NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "abre" TEXT NOT NULL,
    "cierra" TEXT NOT NULL,

    CONSTRAINT "horario_operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elemento" (
    "id" UUID NOT NULL,
    "espacio_id" UUID NOT NULL,
    "placa_inventario" TEXT,
    "lote" TEXT,
    "nombre" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "serie" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "estado_fisico" "EstadoFisico" NOT NULL DEFAULT 'BUENO',
    "estado" "EstadoElemento" NOT NULL DEFAULT 'EN_SERVICIO',
    "valor_unitario" INTEGER,
    "fecha_adquisicion" DATE,
    "vida_util_meses" INTEGER,
    "es_prestable" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "elemento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_estado_elemento" (
    "id" UUID NOT NULL,
    "elemento_id" UUID NOT NULL,
    "estado_anterior" "EstadoElemento" NOT NULL,
    "estado_nuevo" "EstadoElemento" NOT NULL,
    "observacion" TEXT,
    "usuario_id" UUID NOT NULL,
    "ocurrio_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_estado_elemento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotografia" (
    "id" UUID NOT NULL,
    "espacio_id" UUID,
    "elemento_id" UUID,
    "servicio_id" UUID,
    "url_detalle" TEXT NOT NULL,
    "url_tarjeta" TEXT NOT NULL,
    "url_miniatura" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "es_portada" BOOLEAN NOT NULL DEFAULT false,
    "texto_alternativo" TEXT NOT NULL,
    "tomada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotografia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" UUID NOT NULL,
    "tipo" "TipoProveedor" NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "contacto_nombre" TEXT,
    "contacto_correo" TEXT,
    "contacto_telefono" TEXT,
    "porcentaje_administracion" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicio_complementario" (
    "id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaServicio" NOT NULL,
    "descripcion" TEXT,
    "unidad_cobro" "UnidadCobroServicio" NOT NULL,
    "requiere_confirmacion" BOOLEAN NOT NULL DEFAULT true,
    "anticipacion_minima_dias" INTEGER NOT NULL DEFAULT 3,
    "cantidad_maxima" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "servicio_complementario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifa" (
    "id" UUID NOT NULL,
    "espacio_id" UUID,
    "servicio_id" UUID,
    "tipo_solicitante" "TipoSolicitante" NOT NULL,
    "unidad" "UnidadCobroTarifa",
    "valor" INTEGER NOT NULL,
    "valor_en_smmlv" DECIMAL(10,4),
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "acuerdo_soporte" TEXT,
    "iva_aplica" BOOLEAN NOT NULL DEFAULT false,
    "porcentaje_iva" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recargo" (
    "id" UUID NOT NULL,
    "tipo" "TipoRecargo" NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "desde_hora" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "recargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "festivo" (
    "fecha" DATE NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "festivo_pkey" PRIMARY KEY ("fecha")
);

-- CreateTable
CREATE TABLE "smmlv" (
    "anio" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,

    CONSTRAINT "smmlv_pkey" PRIMARY KEY ("anio")
);

-- CreateTable
CREATE TABLE "bloqueo_calendario" (
    "id" UUID NOT NULL,
    "espacio_id" UUID NOT NULL,
    "motivo" "OrigenFranja" NOT NULL,
    "descripcion" TEXT,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "rrule" TEXT,
    "repetir_hasta" TIMESTAMPTZ(3),
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(3),

    CONSTRAINT "bloqueo_calendario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franja_ocupada" (
    "id" UUID NOT NULL,
    "espacio_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "periodo" tstzrange,
    "estado" "EstadoFranja" NOT NULL,
    "origen" "OrigenFranja" NOT NULL,
    "reserva_item_id" UUID,
    "bloqueo_id" UUID,
    "retenida_hasta" TIMESTAMPTZ(3),
    "etiqueta_publica" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "franja_ocupada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud" (
    "id" UUID NOT NULL,
    "consecutivo" TEXT,
    "solicitante_id" UUID NOT NULL,
    "dependencia_id" UUID,
    "objeto_evento" TEXT NOT NULL,
    "descripcion" TEXT,
    "asistentes_estimados" INTEGER NOT NULL,
    "responsable_en_sitio" TEXT,
    "telefono_contacto" TEXT,
    "evento_publico" BOOLEAN NOT NULL DEFAULT false,
    "declara_uso_institucional" BOOLEAN NOT NULL DEFAULT false,
    "es_exenta" BOOLEAN NOT NULL DEFAULT false,
    "tipo_tarifa" "TipoSolicitante" NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'BORRADOR',
    "enviada_en" TIMESTAMPTZ(3),
    "vence_en" TIMESTAMPTZ(3),
    "motivo_cancelacion" TEXT,
    "cancelada_por_institucion" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_estado_solicitud" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "estado_anterior" "EstadoSolicitud",
    "estado_nuevo" "EstadoSolicitud" NOT NULL,
    "usuario_id" UUID,
    "observacion" TEXT,
    "ocurrio_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_estado_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva_item" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "espacio_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "tarifa_id" UUID,
    "unidad" "UnidadCobroTarifa",
    "cantidad" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "valor_unitario" INTEGER NOT NULL DEFAULT 0,
    "recargos" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reserva_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicio_item" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "valor_unitario" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "estado_confirmacion" "EstadoConfirmacionServicio" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones" TEXT,

    CONSTRAINT "servicio_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_adjunto" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "tipo" "TipoDocumentoAdjunto" NOT NULL,
    "nombre" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_adjunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "tipo" "TipoDecision" NOT NULL,
    "resultado" "ResultadoDecision" NOT NULL,
    "motivo" TEXT,
    "decidida_por_id" UUID NOT NULL,
    "decidida_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" UUID NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "descuento" INTEGER NOT NULL DEFAULT 0,
    "iva" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "deposito_garantia" INTEGER NOT NULL DEFAULT 0,
    "valor_referencia" INTEGER NOT NULL DEFAULT 0,
    "es_exenta" BOOLEAN NOT NULL DEFAULT false,
    "valida_hasta" TIMESTAMPTZ(3) NOT NULL,
    "desglose" JSONB NOT NULL,
    "pdf_url" TEXT,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_pago" (
    "id" UUID NOT NULL,
    "referencia" TEXT NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "valor" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "estado" "EstadoOrdenPago" NOT NULL DEFAULT 'PENDIENTE',
    "pasarela" TEXT,
    "transaccion_externa_id" TEXT,
    "soporte_url" TEXT,
    "verificada_por_id" UUID,
    "observacion_tesoreria" TEXT,
    "pagado_en" TIMESTAMPTZ(3),
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orden_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_pasarela" (
    "id" UUID NOT NULL,
    "proveedor" TEXT NOT NULL,
    "id_evento_externo" TEXT NOT NULL,
    "orden_pago_id" UUID,
    "cuerpo" JSONB NOT NULL,
    "firma_valida" BOOLEAN NOT NULL,
    "procesado_en" TIMESTAMPTZ(3),
    "error" TEXT,
    "recibido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_pasarela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reembolso" (
    "id" UUID NOT NULL,
    "orden_pago_id" UUID NOT NULL,
    "valor" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "EstadoReembolso" NOT NULL DEFAULT 'SOLICITADO',
    "soporte_url" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicado_en" TIMESTAMPTZ(3),

    CONSTRAINT "reembolso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acta" (
    "id" UUID NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "tipo" "TipoActa" NOT NULL,
    "checklist" JSONB NOT NULL,
    "observaciones" TEXT,
    "fotos_urls" TEXT[],
    "firma_responsable_url" TEXT,
    "firma_solicitante_url" TEXT,
    "pdf_url" TEXT,
    "generada_por_id" UUID NOT NULL,
    "generada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novedad" (
    "id" UUID NOT NULL,
    "acta_id" UUID NOT NULL,
    "elemento_id" UUID,
    "descripcion" TEXT NOT NULL,
    "valor_dano" INTEGER NOT NULL DEFAULT 0,
    "tratamiento" TEXT NOT NULL,
    "resuelta_en" TIMESTAMPTZ(3),

    CONSTRAINT "novedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consecutivo" (
    "tipo" "TipoConsecutivo" NOT NULL,
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "consecutivo_pkey" PRIMARY KEY ("tipo","anio")
);

-- CreateTable
CREATE TABLE "bitacora" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" UUID,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "datos_antes" JSONB,
    "datos_despues" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "correlacion_id" TEXT,
    "ocurrio_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "enlace" TEXT,
    "leida_en" TIMESTAMPTZ(3),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_correo" (
    "codigo" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpo_html" TEXT NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plantilla_correo_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "parametro" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "descripcion" TEXT,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parametro_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "_ServicioPermitidoEnTipo" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ServicioPermitidoEnTipo_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_rol_usuario_id_rol_dependencia_id_key" ON "usuario_rol"("usuario_id", "rol", "dependencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_refresh_hash_token_key" ON "sesion_refresh"("hash_token");

-- CreateIndex
CREATE INDEX "sesion_refresh_usuario_id_idx" ON "sesion_refresh"("usuario_id");

-- CreateIndex
CREATE INDEX "codigo_verificacion_usuario_id_proposito_idx" ON "codigo_verificacion"("usuario_id", "proposito");

-- CreateIndex
CREATE UNIQUE INDEX "solicitante_usuario_id_key" ON "solicitante"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "solicitante_tipo_documento_numero_documento_key" ON "solicitante"("tipo_documento", "numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "dependencia_codigo_key" ON "dependencia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sede_codigo_key" ON "sede"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "bloque_sede_id_codigo_key" ON "bloque"("sede_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_espacio_codigo_key" ON "tipo_espacio"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "espacio_codigo_key" ON "espacio"("codigo");

-- CreateIndex
CREATE INDEX "espacio_bloque_id_idx" ON "espacio"("bloque_id");

-- CreateIndex
CREATE INDEX "espacio_tipo_espacio_id_idx" ON "espacio"("tipo_espacio_id");

-- CreateIndex
CREATE INDEX "espacio_capacidad_personas_idx" ON "espacio"("capacidad_personas");

-- CreateIndex
CREATE UNIQUE INDEX "horario_operacion_espacio_id_dia_semana_key" ON "horario_operacion"("espacio_id", "dia_semana");

-- CreateIndex
CREATE UNIQUE INDEX "elemento_placa_inventario_key" ON "elemento"("placa_inventario");

-- CreateIndex
CREATE INDEX "elemento_espacio_id_idx" ON "elemento"("espacio_id");

-- CreateIndex
CREATE INDEX "tarifa_espacio_id_tipo_solicitante_vigencia_desde_idx" ON "tarifa"("espacio_id", "tipo_solicitante", "vigencia_desde");

-- CreateIndex
CREATE INDEX "tarifa_servicio_id_tipo_solicitante_vigencia_desde_idx" ON "tarifa"("servicio_id", "tipo_solicitante", "vigencia_desde");

-- CreateIndex
CREATE UNIQUE INDEX "recargo_tipo_key" ON "recargo"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "franja_ocupada_reserva_item_id_key" ON "franja_ocupada"("reserva_item_id");

-- CreateIndex
CREATE INDEX "franja_ocupada_espacio_id_inicio_idx" ON "franja_ocupada"("espacio_id", "inicio");

-- CreateIndex
CREATE INDEX "franja_ocupada_estado_retenida_hasta_idx" ON "franja_ocupada"("estado", "retenida_hasta");

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_consecutivo_key" ON "solicitud"("consecutivo");

-- CreateIndex
CREATE INDEX "solicitud_estado_vence_en_idx" ON "solicitud"("estado", "vence_en");

-- CreateIndex
CREATE INDEX "solicitud_solicitante_id_idx" ON "solicitud"("solicitante_id");

-- CreateIndex
CREATE INDEX "historial_estado_solicitud_solicitud_id_idx" ON "historial_estado_solicitud"("solicitud_id");

-- CreateIndex
CREATE INDEX "reserva_item_solicitud_id_idx" ON "reserva_item"("solicitud_id");

-- CreateIndex
CREATE INDEX "decision_solicitud_id_idx" ON "decision"("solicitud_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_consecutivo_key" ON "cotizacion"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "orden_pago_referencia_key" ON "orden_pago"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "orden_pago_transaccion_externa_id_key" ON "orden_pago"("transaccion_externa_id");

-- CreateIndex
CREATE INDEX "orden_pago_estado_vence_en_idx" ON "orden_pago"("estado", "vence_en");

-- CreateIndex
CREATE UNIQUE INDEX "evento_pasarela_proveedor_id_evento_externo_key" ON "evento_pasarela"("proveedor", "id_evento_externo");

-- CreateIndex
CREATE UNIQUE INDEX "acta_consecutivo_key" ON "acta"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "acta_solicitud_id_tipo_key" ON "acta"("solicitud_id", "tipo");

-- CreateIndex
CREATE INDEX "bitacora_entidad_entidad_id_idx" ON "bitacora"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "bitacora_usuario_id_ocurrio_en_idx" ON "bitacora"("usuario_id", "ocurrio_en");

-- CreateIndex
CREATE INDEX "bitacora_ocurrio_en_idx" ON "bitacora"("ocurrio_en");

-- CreateIndex
CREATE INDEX "notificacion_usuario_id_leida_en_idx" ON "notificacion"("usuario_id", "leida_en");

-- CreateIndex
CREATE INDEX "_ServicioPermitidoEnTipo_B_index" ON "_ServicioPermitidoEnTipo"("B");

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_dependencia_id_fkey" FOREIGN KEY ("dependencia_id") REFERENCES "dependencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_refresh" ADD CONSTRAINT "sesion_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_verificacion" ADD CONSTRAINT "codigo_verificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimiento_datos" ADD CONSTRAINT "consentimiento_datos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitante" ADD CONSTRAINT "solicitante_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitante" ADD CONSTRAINT "solicitante_dependencia_id_fkey" FOREIGN KEY ("dependencia_id") REFERENCES "dependencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencia" ADD CONSTRAINT "dependencia_jefe_id_fkey" FOREIGN KEY ("jefe_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloque" ADD CONSTRAINT "bloque_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espacio" ADD CONSTRAINT "espacio_bloque_id_fkey" FOREIGN KEY ("bloque_id") REFERENCES "bloque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espacio" ADD CONSTRAINT "espacio_tipo_espacio_id_fkey" FOREIGN KEY ("tipo_espacio_id") REFERENCES "tipo_espacio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espacio" ADD CONSTRAINT "espacio_dependencia_id_fkey" FOREIGN KEY ("dependencia_id") REFERENCES "dependencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espacio" ADD CONSTRAINT "espacio_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_operacion" ADD CONSTRAINT "horario_operacion_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elemento" ADD CONSTRAINT "elemento_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estado_elemento" ADD CONSTRAINT "historial_estado_elemento_elemento_id_fkey" FOREIGN KEY ("elemento_id") REFERENCES "elemento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotografia" ADD CONSTRAINT "fotografia_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotografia" ADD CONSTRAINT "fotografia_elemento_id_fkey" FOREIGN KEY ("elemento_id") REFERENCES "elemento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotografia" ADD CONSTRAINT "fotografia_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicio_complementario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicio_complementario" ADD CONSTRAINT "servicio_complementario_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifa" ADD CONSTRAINT "tarifa_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifa" ADD CONSTRAINT "tarifa_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicio_complementario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueo_calendario" ADD CONSTRAINT "bloqueo_calendario_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franja_ocupada" ADD CONSTRAINT "franja_ocupada_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franja_ocupada" ADD CONSTRAINT "franja_ocupada_reserva_item_id_fkey" FOREIGN KEY ("reserva_item_id") REFERENCES "reserva_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franja_ocupada" ADD CONSTRAINT "franja_ocupada_bloqueo_id_fkey" FOREIGN KEY ("bloqueo_id") REFERENCES "bloqueo_calendario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "solicitante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_dependencia_id_fkey" FOREIGN KEY ("dependencia_id") REFERENCES "dependencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estado_solicitud" ADD CONSTRAINT "historial_estado_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_item" ADD CONSTRAINT "reserva_item_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_item" ADD CONSTRAINT "reserva_item_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicio_item" ADD CONSTRAINT "servicio_item_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicio_item" ADD CONSTRAINT "servicio_item_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicio_complementario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_adjunto" ADD CONSTRAINT "documento_adjunto_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_decidida_por_id_fkey" FOREIGN KEY ("decidida_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_pago" ADD CONSTRAINT "orden_pago_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_pasarela" ADD CONSTRAINT "evento_pasarela_orden_pago_id_fkey" FOREIGN KEY ("orden_pago_id") REFERENCES "orden_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reembolso" ADD CONSTRAINT "reembolso_orden_pago_id_fkey" FOREIGN KEY ("orden_pago_id") REFERENCES "orden_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta" ADD CONSTRAINT "acta_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedad" ADD CONSTRAINT "novedad_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "acta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServicioPermitidoEnTipo" ADD CONSTRAINT "_ServicioPermitidoEnTipo_A_fkey" FOREIGN KEY ("A") REFERENCES "servicio_complementario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServicioPermitidoEnTipo" ADD CONSTRAINT "_ServicioPermitidoEnTipo_B_fkey" FOREIGN KEY ("B") REFERENCES "tipo_espacio"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===== restricciones.sql (anexado por db:init) =====
-- =============================================================================
-- SIRA · Restricciones que Prisma no puede expresar en schema.prisma
-- Este archivo se ANEXA a la migración inicial con `pnpm db:init`
-- (ver scripts/crear-migracion-inicial.mjs). Es idempotente.
-- =============================================================================

-- RN-01 · RN-03 · RNF-05 -----------------------------------------------------
-- Una sola tabla de ocupación para reservas y bloqueos. Dos franjas activas del
-- mismo espacio NO pueden solaparse, aunque la validación de la app falle o
-- lleguen dos peticiones al mismo tiempo. '[)' = el fin es abierto, así una
-- reserva de 8:00-10:00 y otra de 10:00-12:00 no chocan.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prisma crea `periodo` como columna normal (Unsupported). Se reemplaza por
-- una columna GENERADA que el motor calcula siempre a partir de inicio y fin.
ALTER TABLE franja_ocupada DROP COLUMN IF EXISTS periodo;
ALTER TABLE franja_ocupada
  ADD COLUMN periodo tstzrange
  GENERATED ALWAYS AS (tstzrange(inicio, fin, '[)')) STORED;

ALTER TABLE franja_ocupada
  DROP CONSTRAINT IF EXISTS franja_fin_mayor_inicio;
ALTER TABLE franja_ocupada
  ADD CONSTRAINT franja_fin_mayor_inicio CHECK (fin > inicio);

ALTER TABLE franja_ocupada
  DROP CONSTRAINT IF EXISTS sin_solapamiento;
ALTER TABLE franja_ocupada
  ADD CONSTRAINT sin_solapamiento
  EXCLUDE USING gist (espacio_id WITH =, periodo WITH &&)
  WHERE (estado <> 'LIBERADA');

-- RNF-02: la restricción de exclusión crea por sí misma un índice GiST sobre
-- (espacio_id, periodo). Las consultas de disponibilidad deben filtrar con
-- `espacio_id = $1 AND periodo && tstzrange($2, $3)` para usarlo.

ALTER TABLE reserva_item
  DROP CONSTRAINT IF EXISTS reserva_fin_mayor_inicio;
ALTER TABLE reserva_item
  ADD CONSTRAINT reserva_fin_mayor_inicio CHECK (fin > inicio);

-- Integridad de tablas "polimórficas" ----------------------------------------
-- Una foto pertenece exactamente a un espacio, un elemento o un servicio.
ALTER TABLE fotografia DROP CONSTRAINT IF EXISTS fotografia_un_dueno;
ALTER TABLE fotografia ADD CONSTRAINT fotografia_un_dueno CHECK (
  num_nonnulls(espacio_id, elemento_id, servicio_id) = 1
);

-- Una tarifa aplica exactamente a un espacio o a un servicio.
ALTER TABLE tarifa DROP CONSTRAINT IF EXISTS tarifa_un_objeto;
ALTER TABLE tarifa ADD CONSTRAINT tarifa_un_objeto CHECK (
  num_nonnulls(espacio_id, servicio_id) = 1
);

-- "Solo una portada por espacio" se garantiza en FotografiaService (un índice
-- parcial aquí sería borrado por Prisma en la siguiente migración).

-- Dinero nunca negativo.
ALTER TABLE tarifa DROP CONSTRAINT IF EXISTS tarifa_valor_no_negativo;
ALTER TABLE tarifa ADD CONSTRAINT tarifa_valor_no_negativo CHECK (valor >= 0);
ALTER TABLE orden_pago DROP CONSTRAINT IF EXISTS orden_pago_valor_positivo;
ALTER TABLE orden_pago ADD CONSTRAINT orden_pago_valor_positivo CHECK (valor > 0);

-- RF-AUD-03 · Bitácora inmutable --------------------------------------------
-- Ningún rol, ni siquiera la aplicación, puede editar o borrar registros.
CREATE OR REPLACE FUNCTION bitacora_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es inmutable: % no permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bitacora_sin_cambios ON bitacora;
CREATE TRIGGER bitacora_sin_cambios
  BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();

-- Tampoco se puede TRUNCATE.
DROP TRIGGER IF EXISTS bitacora_sin_truncate ON bitacora;
CREATE TRIGGER bitacora_sin_truncate
  BEFORE TRUNCATE ON bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_inmutable();
