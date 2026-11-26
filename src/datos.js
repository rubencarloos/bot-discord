// Datos que tienen que sobrevivir a los reinicios del bot (códigos de verificación, IPs y dueños de nametags).
// En Railway se guardan en el volumen montado en /data. Si no existe, en ./data (se pierde al redesplegar).
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = process.env.DATA_DIR || (existsSync('/data') ? '/data' : path.resolve('data'));
const ARCHIVO = path.join(DIR, 'verificacion.json');
export const almacenamientoPersistente = DIR === '/data' || Boolean(process.env.DATA_DIR);
if (DIR !== '/data' && !process.env.DATA_DIR) console.warn(`⚠️ No hay volumen en /data: los códigos se guardan en ${DIR} y se perderán al redesplegar.`);

// jugadores: nametag (minúsculas) -> { nametag, userId, codigo, eventos: { id: nombre }, ip, verificadoEn }
// staff:     nametag (minúsculas) -> { nametag, userId, codigo, ip, verificadoEn, desde }   (códigos fijos de /micodigo)
// duenos:    nametag (minúsculas) -> { nametag, userId, desde }   (vínculo permanente nametag <-> cuenta de Discord)
let datos = {};
try {
  datos = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
} catch { /* primera vez */ }
datos.jugadores ??= {};
datos.staff ??= {};
datos.duenos ??= {};
// Los aceptados de antes de existir los dueños pasan a ser dueños de su nametag
for (const [clave, j] of Object.entries(datos.jugadores)) datos.duenos[clave] ??= { nametag: j.nametag, userId: j.userId, desde: Date.now() };

const k = (nametag) => nametag.toLowerCase();
const nuevoCodigo = () => String(randomInt(100000, 1000000));

// Funciones que se avisan cuando cambian los códigos (para mandarlos al plugin del servidor)
export const alCambiarCodigos = new Set();

function guardar(cambianCodigos = true) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${ARCHIVO}.tmp`, JSON.stringify(datos, null, 2));
  renameSync(`${ARCHIVO}.tmp`, ARCHIVO);
  if (cambianCodigos) for (const f of alCambiarCodigos) f();
}

// Lo que se manda al plugin: nametag -> código (el del staff manda sobre el de los eventos)
export function codigosParaPlugin() {
  const jugadores = {};
  for (const [clave, j] of [...Object.entries(datos.jugadores), ...Object.entries(datos.staff)]) {
    jugadores[clave] = { nametag: j.nametag, codigo: j.codigo };
  }
  return { generado: new Date().toISOString(), jugadores };
}

// Jugador de evento o miembro del staff con ese nametag (o null)
export function jugador(nametag) {
  const c = k(nametag);
  const s = datos.staff[c];
  if (s) return { ...s, eventos: datos.jugadores[c]?.eventos ?? {}, esStaff: true };
  return datos.jugadores[c] ?? null;
}

// ─── Dueños de nametag ───────────────────────────────────────────────────────
export const duenoDe = (nametag) => datos.duenos[k(nametag)] ?? null;
export const staffDe = (nametag) => datos.staff[k(nametag)] ?? null;
export const staffDeUsuario = (userId) => Object.values(datos.staff).find((s) => s.userId === userId) ?? null;

export function asignarDueno(nametag, userId) {
  datos.duenos[k(nametag)] = { nametag, userId, desde: Date.now() };
  guardar(false);
}

// Quita el dueño y, si era del staff, también su código fijo
export function liberarDueno(nametag) {
  const c = k(nametag);
  const habia = { dueno: datos.duenos[c] ?? null, staff: Boolean(datos.staff[c]) };
  delete datos.duenos[c];
  delete datos.staff[c];
  guardar(habia.staff);
  return habia;
}

// ─── Formularios de eventos ──────────────────────────────────────────────────
// Al aceptar: si ya tenía código activo (otro evento a la vez) se mantiene; si es staff, usa su código fijo.
export function darAlta({ nametag, userId, eventoId, eventoNombre }) {
  const clave = k(nametag);
  const previo = datos.jugadores[clave];
  const staff = datos.staff[clave];
  const j = previo && previo.userId === userId
    ? previo
    : { nametag, userId, codigo: nuevoCodigo(), eventos: {}, ip: null, verificadoEn: null };
  if (staff && staff.userId === userId) j.codigo = staff.codigo;
  j.nametag = nametag;
  j.eventos[eventoId] = eventoNombre;
  datos.jugadores[clave] = j;
  datos.duenos[clave] = { nametag, userId, desde: datos.duenos[clave]?.userId === userId ? datos.duenos[clave].desde : Date.now() };
  guardar();
  return j;
}

export function marcarVerificado(nametag, ip) {
  for (const lista of [datos.jugadores, datos.staff]) {
    const j = lista[k(nametag)];
    if (!j) continue;
    j.ip = ip;
    j.verificadoEn = ip ? Date.now() : null;
  }
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

// Quita un evento: devuelve los nametags que se quedan sin ningún evento (código e IP borrados).
// Los dueños de nametag se mantienen. Los del staff conservan su código fijo y no se devuelven.
export function quitarEvento(eventoId) {
  const sinEventos = [];
  for (const [clave, j] of Object.entries(datos.jugadores)) {
    if (!(eventoId in j.eventos)) continue;
    delete j.eventos[eventoId];
    if (!Object.keys(j.eventos).length) {
      if (!datos.staff[clave]) sinEventos.push(j.nametag);
      delete datos.jugadores[clave];
    }
  }
  guardar();
  return sinEventos;
}

// ─── Staff (/micodigo) ───────────────────────────────────────────────────────
// Registra (o cambia) el nametag de un miembro del staff. nuevo = true genera otro código (y obliga a verificarse otra vez).
export function registrarStaff(userId, nametag, nuevo = false) {
  const previo = staffDeUsuario(userId);
  const mismo = previo && k(previo.nametag) === k(nametag);
  if (previo && !mismo) delete datos.staff[k(previo.nametag)];
  const s = mismo && !nuevo
    ? previo
    : { nametag, userId, codigo: nuevoCodigo(), ip: null, verificadoEn: null, desde: Date.now() };
  s.nametag = nametag;
  datos.staff[k(nametag)] = s;
  datos.duenos[k(nametag)] = { nametag, userId, desde: Date.now() };
  // Si también está en algún evento, usa el mismo código
  if (datos.jugadores[k(nametag)]?.userId === userId) datos.jugadores[k(nametag)].codigo = s.codigo;
  guardar();
  return { staff: s, anterior: previo && !mismo ? previo.nametag : null };
}
