interface CorreoListado {
  ID: string;
  Created: string;
}

interface ResultadoBusqueda {
  messages: CorreoListado[];
}

interface MensajeMailpit {
  Subject: string;
  HTML: string;
  Text: string;
}

export interface CorreoRecibido {
  asunto: string;
  html: string;
  texto: string;
}

const URL_MAILPIT = 'http://localhost:8025';
const PAUSA_REINTENTO_MS = 250;
const TIEMPO_MAXIMO_MS = 10_000;

async function buscarCorreos(correo: string): Promise<CorreoListado[]> {
  const consulta = new URLSearchParams({ query: `to:${correo}` });
  const respuesta = await fetch(`${URL_MAILPIT}/api/v1/search?${consulta}`, {
    signal: AbortSignal.timeout(1_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Mailpit respondió ${respuesta.status} al buscar correos para ${correo}.`);
  }

  const resultado = (await respuesta.json()) as ResultadoBusqueda;
  return resultado.messages;
}

export async function consultarCorreos(correo: string): Promise<CorreoListado[]> {
  return buscarCorreos(correo);
}

export async function esperarUltimoCorreo(correo: string): Promise<CorreoRecibido> {
  const limite = Date.now() + TIEMPO_MAXIMO_MS;

  while (Date.now() < limite) {
    const mensajes = await buscarCorreos(correo);
    const ultimo = mensajes.reduce<CorreoListado | undefined>(
      (actual, mensaje) =>
        !actual || Date.parse(mensaje.Created) > Date.parse(actual.Created) ? mensaje : actual,
      undefined,
    );

    if (ultimo) {
      const respuesta = await fetch(
        `${URL_MAILPIT}/api/v1/message/${encodeURIComponent(ultimo.ID)}`,
        { signal: AbortSignal.timeout(1_000) },
      );
      if (!respuesta.ok) {
        throw new Error(`Mailpit respondió ${respuesta.status} al leer el correo ${ultimo.ID}.`);
      }

      const mensaje = (await respuesta.json()) as MensajeMailpit;
      return { asunto: mensaje.Subject, html: mensaje.HTML, texto: mensaje.Text };
    }

    await new Promise((resolver) => setTimeout(resolver, PAUSA_REINTENTO_MS));
  }

  throw new Error(`No llegó ningún correo a ${correo} en ${TIEMPO_MAXIMO_MS} ms.`);
}
