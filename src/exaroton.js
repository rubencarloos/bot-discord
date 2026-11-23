// Conexión con el servidor de Minecraft alojado en exaroton (https://developers.exaroton.com)
// Variables en Railway: EXAROTON_TOKEN (clave de la API) y EXAROTON_SERVER_ID (ID del servidor del evento)

const API = 'https://api.exaroton.com/v1';

export const exarotonConfigurado = () => Boolean(process.env.EXAROTON_TOKEN && process.env.EXAROTON_SERVER_ID);

async function llamar(metodo, ruta, cuerpo) {
  if (!exarotonConfigurado()) throw new Error('Falta configurar EXAROTON_TOKEN o EXAROTON_SERVER_ID en Railway');
  const res = await fetch(`${API}/servers/${process.env.EXAROTON_SERVER_ID}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${process.env.EXAROTON_TOKEN}`,
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error || `exaroton respondió ${res.status}`);
  return json.data;
}

export const anadirWhitelist = (nametag) => llamar('PUT', '/playerlists/whitelist/', { entries: [nametag] });
export const quitarWhitelist = (nametag) => llamar('DELETE', '/playerlists/whitelist/', { entries: [nametag].flat() });
export const verWhitelist = () => llamar('GET', '/playerlists/whitelist/');
export const infoServidor = () => llamar('GET', '');
