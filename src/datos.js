// Datos que tienen que sobrevivir a los reinicios del bot (códigos de verificación e IPs).
// En Railway se guardan en el volumen montado en /data. Si no existe, en ./data (se pierde al redesplegar).
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = process.env.DATA_DIR || (existsSync('/data') ? '/data' : path.resolve('data'));
const ARCHIVO = path.join(DIR, 'verificacion.json');
if (DIR !== '/data' && !process.env.DATA_DIR) console.warn(`⚠️ No hay volumen en /data: los códigos se guardan en ${DIR} y se perderán al redesplegar.`);

// jugadores: nametag (minúsculas) -> { nametag, userId, codigo, eventos: { id: nombre }, ip, verificadoEn }
let datos = { jugadores: {} };
try {
  datos = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
} catch { /* primera vez */ }

// Funciones que se avisan cuando cambian los códigos (para mandarlos al plugin del servidor)
export const alCambiarCodigos = new Set();

function guardar(cambianCodigos = true) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${ARCHIVO}.tmp`, JSON.stringify(datos, null, 2));
  renameSync(`${ARCHIVO}.tmp`, ARCHIVO);
  if (cambianCodigos) for (const f of alCambiarCodigos) f();
}

// Lo que se manda al plugin: nametag -> código
export function codigosParaPlugin() {
  const jugadores = {};
  for (const [clave, j] of Object.entries(datos.jugadores)) jugadores[clave] = { nametag: j.nametag, codigo: j.codigo };
  return { generado: new Date().toISOString(), jugadores };
}

export const jugador = (nametag) => datos.jugadores[nametag.toLowerCase()] ?? null;

// Al aceptar un formulario: si ya tenía código activo (otro evento a la vez) se mantiene; si no, uno nuevo.
export function darAlta({ nametag, userId, eventoId, eventoNombre }) {
  const clave = nametag.toLowerCase();
  const previo = datos.jugadores[clave];
  const j = previo && previo.userId === userId
    ? previo
    : { nametag, userId, codigo: String(randomInt(100000, 1000000)), eventos: {}, ip: null, verificadoEn: null };
  j.nametag = nametag;
  j.eventos[eventoId] = eventoNombre;
  datos.jugadores[clave] = j;
  guardar();
  return j;
}

export function marcarVerificado(nametag, ip) {
  const j = jugador(nametag);
  if (!j) return;
  j.ip = ip;
  j.verificadoEn = ip ? Date.now() : null;
  guardar(false);
}

// Eventos con formularios aceptados guardados: [{ id, nombre, jugadores }]
export function eventosGuardados() {
  const mapa = new Map();
  for (const j of Object.values(datos.jugadores)) {
    for (const [id, nombre] of Object.entries(j.eventos)) {
      const e = mapa.get(id) ?? { id, nombre, jugadores: 0 };
      e.jugadores++;
      mapa.set(id, e);
    }
  }
  return [...mapa.values()];
}

// Quita un evento: devuelve los nametags que se quedan sin ningún evento (código e IP borrados)
export function quitarEvento(eventoId) {
  const sinEventos = [];
  for (const [clave, j] of Object.entries(datos.jugadores)) {
    if (!(eventoId in j.eventos)) continue;
    delete j.eventos[eventoId];
    if (!Object.keys(j.eventos).length) {
      sinEventos.push(j.nametag);
      delete datos.jugadores[clave];
    }
  }
  guardar();
  return sinEventos;
}
