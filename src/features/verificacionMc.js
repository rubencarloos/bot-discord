// Verificación de identidad dentro de Minecraft.
// El bot escucha la consola del servidor (exaroton) en tiempo real:
//  - Cuando entra un jugador aceptado en un evento desde una IP no verificada, lo pasa a espectador
//    y le pide /verificacion CODIGO. Tiene X segundos.
//  - Código correcto: vuelve a donde estaba, en modo aventura, y se guarda su IP para el evento.
//  - Código incorrecto o sin código a tiempo: ban-ip permanente (nunca se quita solo).
import { ChannelFlags, ChannelType, EmbedBuilder, Events, ThreadAutoArchiveDuration } from 'discord.js';
import { Client as Exaroton } from 'exaroton';
import { verificacionMc as cfg } from '../config.js';
import { jugador, marcarVerificado } from '../datos.js';
import { exarotonConfigurado } from '../exaroton.js';
import { ts } from '../util.js';

const RE_ENTRA = /]: (\w{3,16})\[\/([^\]]+):\d+\] logged in with entity id \d+ at \(\[[^\]]*\]([-\d.]+), ([-\d.]+), ([-\d.]+)\)/;
const RE_COMANDO = /]: (\w{3,16}) issued server command: \/verificacion\b\s*(\S*)/i;
const RE_SALE = /]: (\w{3,16}) (?:left the game|lost connection)/;

const pendientes = new Map(); // nametag (minúsculas) -> { nametag, ip, pos, limite, timers }
let servidor = null;
let discord = null;

// ─── Utilidades ──────────────────────────────────────────────────────────────
async function cmd(linea) {
  try {
    await servidor.executeCommand(linea);
  } catch (e) {
    console.error('exaroton comando:', linea.split(' ')[0], e.message);
  }
}

const texto = (partes) => JSON.stringify(['', ...partes]);
const decir = (nametag, partes) => cmd(`tellraw ${nametag} ${texto(partes)}`);
const tiempo = (s) => `${Math.floor(s / 60) ? `${Math.floor(s / 60)} min ` : ''}${s % 60 ? `${s % 60} s` : ''}`.trim();

// Publicación «🔐 Seguridad» en el foro (se crea una vez y se reutiliza)
let hiloSeguridad = null;
async function avisar(embed) {
  try {
    if (!hiloSeguridad) {
      const canal = await discord.channels.fetch(cfg.seguridadId).catch(() => null);
      if (!canal) return console.error('⚠️ No encuentro el canal de seguridad', cfg.seguridadId);
      if (canal.type !== ChannelType.GuildForum) {
        hiloSeguridad = canal;
      } else {
        const activos = await canal.threads.fetchActive();
        const archivados = await canal.threads.fetchArchived({ limit: 50 }).catch(() => ({ threads: new Map() }));
        hiloSeguridad = [...activos.threads.values(), ...archivados.threads.values()]
          .find((h) => h.parentId === canal.id && h.name === '🔐 Seguridad' && h.ownerId === discord.user.id);
        if (!hiloSeguridad) {
          const obligaEtiqueta = canal.flags?.has(ChannelFlags.RequireTag) && canal.availableTags.length > 0;
          hiloSeguridad = await canal.threads.create({
            name: '🔐 Seguridad',
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            appliedTags: obligaEtiqueta ? [canal.availableTags[0].id] : [],
            message: { embeds: [new EmbedBuilder().setTitle('🔐 Registro de seguridad').setColor(0x5865f2)
              .setDescription('Aquí se apuntan las verificaciones de los jugadores en el servidor de Minecraft y los bloqueos de IP.\n\nLos bloqueos **no se quitan solos**. Para quitar uno, en la consola de exaroton: `pardon-ip IP`.')] },
          });
        }
      }
    }
    if (hiloSeguridad.archived) await hiloSeguridad.setArchived(false).catch(() => {});
    await hiloSeguridad.send({ embeds: [embed.setTimestamp()], allowedMentions: { parse: [] } });
  } catch (e) {
    console.error('Error avisando en seguridad:', e.message);
    hiloSeguridad = null;
  }
}

const discordDe = (j) => (j?.userId ? `<@${j.userId}>` : '_desconocido_');
const eventosDe = (j) => Object.values(j?.eventos ?? {}).join(', ') || '—';

// ─── Flujo ───────────────────────────────────────────────────────────────────
async function alEntrar(nametag, ip, pos) {
  const j = jugador(nametag);
  if (!j) return; // no es jugador de ningún evento (staff, etc.): no se toca
  if (j.ip && j.ip === ip) return; // ya verificado desde esta conexión

  const clave = nametag.toLowerCase();
  const previo = pendientes.get(clave);
  if (previo) { // volvió a entrar sin verificarse: el plazo sigue corriendo
    previo.ip = ip;
    previo.pos = pos;
  } else {
    const p = { nametag, ip, pos, limite: Date.now() + cfg.segundos * 1000, timers: [] };
    p.timers.push(setTimeout(() => banear(clave, 'No introdujo el código a tiempo'), cfg.segundos * 1000));
    if (cfg.segundos > 45) p.timers.push(setTimeout(() => recordar(clave), (cfg.segundos - 30) * 1000));
    pendientes.set(clave, p);
  }

  // Esperar a que cargue el jugador antes de mandarle cosas
  setTimeout(async () => {
    const p = pendientes.get(clave);
    if (!p) return;
    const quedan = Math.max(0, Math.round((p.limite - Date.now()) / 1000));
    // Para el alias de commands.yml (/verificacion -> /trigger verificacion set CODIGO), sin "Unknown command"
    await cmd('scoreboard objectives add verificacion trigger');
    await cmd(`scoreboard players enable ${nametag} verificacion`);
    await cmd(`gamemode spectator ${nametag}`);
    await cmd(`title ${nametag} times 10 100 20`);
    await cmd(`title ${nametag} title ${JSON.stringify({ text: 'Verificación', color: 'gold', bold: true })}`);
    await cmd(`title ${nametag} subtitle ${JSON.stringify({ text: `/verificacion TUCODIGOAQUI  ·  ${tiempo(quedan)}`, color: 'yellow' })}`);
    await decir(nametag, [
      { text: '\n[Tmb Studio] ', color: 'gold', bold: true },
      { text: 'Escribe el código que recibiste en tu Discord al ser aceptado en el formulario del evento.\n', color: 'white' },
      { text: 'A continuación pon ', color: 'white' },
      { text: '/verificacion TUCODIGOAQUI', color: 'yellow', bold: true },
      { text: `\nTienes ${tiempo(quedan)}. `, color: 'white' },
      { text: 'Si no lo pones, o lo pones mal, serás baneado por motivos de seguridad.\n', color: 'red', bold: true },
    ]);
  }, 1500);

  await avisar(new EmbedBuilder().setColor(0xfee75c).setTitle('⏳ Verificación pendiente')
    .setDescription(`\`${nametag}\` (${discordDe(j)}) ha entrado${j.ip ? ' desde una **IP distinta** a la verificada' : ''}.\nTiene hasta ${ts(pendientes.get(clave).limite, 'T')} para poner su código.`)
    .addFields({ name: '🌐 IP', value: `||${ip}||`, inline: true }, { name: '🎮 Eventos', value: eventosDe(j), inline: true }));
}

async function recordar(clave) {
  const p = pendientes.get(clave);
  if (!p) return;
  await decir(p.nametag, [
    { text: '[Tmb Studio] ', color: 'gold', bold: true },
    { text: 'Te quedan 30 segundos para poner ', color: 'red' },
    { text: '/verificacion TUCODIGOAQUI', color: 'yellow', bold: true },
    { text: ' o serás baneado.', color: 'red' },
  ]);
}

async function alComando(nametag, codigo) {
  const clave = nametag.toLowerCase();
  const p = pendientes.get(clave);
  const j = jugador(nametag);
  if (!p) {
    await decir(nametag, [{ text: '[Tmb Studio] ', color: 'gold', bold: true },
      { text: j ? 'Ya estás verificado. ¡Suerte en el evento!' : 'No necesitas verificarte.', color: 'green' }]);
    return;
  }
  if (!j) return limpiar(clave);
  if (codigo !== j.codigo) return banear(clave, codigo ? 'Código incorrecto' : 'Usó /verificacion sin código');

  limpiar(clave);
  marcarVerificado(nametag, p.ip);
  if (p.pos) await cmd(`tp ${nametag} ${p.pos.join(' ')}`);
  await cmd(`gamemode ${cfg.modoJuego} ${nametag}`);
  await cmd(`title ${nametag} title ${JSON.stringify({ text: 'Verificado', color: 'green', bold: true })}`);
  await cmd(`title ${nametag} subtitle ${JSON.stringify({ text: '¡Suerte en el evento!', color: 'white' })}`);
  await decir(nametag, [{ text: '[Tmb Studio] ', color: 'gold', bold: true }, { text: 'Verificado correctamente. ¡Suerte en el evento!', color: 'green' }]);
  await avisar(new EmbedBuilder().setColor(0x57f287).setTitle('✅ Verificado')
    .setDescription(`\`${nametag}\` (${discordDe(j)}) ha puesto su código correctamente.`)
    .addFields({ name: '🌐 IP guardada', value: `||${p.ip}||`, inline: true }, { name: '🎮 Eventos', value: eventosDe(j), inline: true }));
}

function limpiar(clave) {
  const p = pendientes.get(clave);
  p?.timers.forEach(clearTimeout);
  pendientes.delete(clave);
}

async function banear(clave, motivo) {
  const p = pendientes.get(clave);
  if (!p) return;
  limpiar(clave);
  const j = jugador(p.nametag);
  // ban-ip expulsa al momento a cualquiera conectado desde esa IP
  await cmd(`ban-ip ${p.ip} Tmb Studio - Bloqueado por seguridad: verificación fallida`);
  await avisar(new EmbedBuilder().setColor(0xed4245).setTitle('⛔ IP bloqueada')
    .setDescription(`Alguien intentó entrar como \`${p.nametag}\` (${discordDe(j)}) y **no pasó la verificación**.`)
    .addFields(
      { name: '📝 Motivo', value: motivo, inline: true },
      { name: '🌐 IP bloqueada', value: `||${p.ip}||`, inline: true },
      { name: '🎮 Eventos', value: eventosDe(j), inline: true },
      { name: '↩️ Para quitar el bloqueo', value: `En la consola de exaroton: \`pardon-ip ${p.ip}\`` },
    ));
}

// ─── Lectura de la consola ───────────────────────────────────────────────────
export function procesarLinea(linea) {
  let m = linea.match(RE_ENTRA);
  if (m) return alEntrar(m[1], m[2], [m[3], m[4], m[5]]);
  m = linea.match(RE_COMANDO);
  if (m) return alComando(m[1], m[2]);
  m = linea.match(RE_SALE);
  // Si sale sin verificarse, el plazo sigue corriendo: si no vuelve y lo pone a tiempo, ban-ip
  if (m && cfg.banSiSale === false) limpiar(m[1].toLowerCase());
  return null;
}

export function registrarVerificacionMc(client) {
  client.once(Events.ClientReady, () => {
    discord = client;
    if (!exarotonConfigurado()) return console.warn('⚠️ exaroton sin configurar: verificación en Minecraft desactivada');
    servidor = new Exaroton(process.env.EXAROTON_TOKEN).server(process.env.EXAROTON_SERVER_ID);
    servidor.on('console:line', (d) => Promise.resolve(procesarLinea(d.line)).catch((e) => console.error('Verificación MC:', e)));
    servidor.subscribe('console');
    console.log('🔐 Verificación en Minecraft activa (escuchando la consola de exaroton)');
  });
}

export const _test = {
  set: (srv, cli) => { servidor = srv; discord = cli; },
  pendientes,
};
