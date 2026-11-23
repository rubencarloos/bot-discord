// Conexión con el plugin TmbVerificacion del servidor de Minecraft (carpeta plugin/ de este repo).
//  - El bot deja los códigos en plugins/TmbVerificacion/codigos.json (exaroton) y manda "tmbverif reload".
//  - El plugin hace la verificación dentro del juego y escribe en consola líneas "[TMBV] ...".
//  - El bot lee la consola en directo y avisa en Discord (publicación «🔐 Seguridad»).
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelFlags, ChannelType, EmbedBuilder, Events, MessageFlags,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import { Client as Exaroton } from 'exaroton';
import { verificacionMc as cfg } from '../config.js';
import { alCambiarCodigos, codigosParaPlugin, jugador, marcarVerificado } from '../datos.js';
import { exarotonConfigurado } from '../exaroton.js';
import { nivelDe, ts } from '../util.js';

const RE_TMBV = /\[TMBV\] (PENDIENTE|VERIFICADO|BAN|RECHAZADO|RESET) (\w{1,16})(?: (\S+))?(?: (.+))?$/;
const COLOR = { pendiente: 0xfee75c, ok: 0x57f287, ban: 0xed4245, rechazo: 0xe67e22, info: 0x5865f2 };

let servidor = null;
let discord = null;

async function cmd(linea) {
  try {
    await servidor.executeCommand(linea);
    return true;
  } catch (e) {
    console.error('exaroton comando:', linea.split(' ')[0], e.message);
    return false;
  }
}

// ─── Enviar los códigos al plugin ────────────────────────────────────────────
let pendienteSync = null;
export function programarSincronizacion() {
  if (!servidor) return;
  clearTimeout(pendienteSync);
  pendienteSync = setTimeout(sincronizar, 1500);
}

async function sincronizar() {
  try {
    await servidor.getFile(cfg.rutaCodigos).putContent(JSON.stringify(codigosParaPlugin(), null, 2));
    // Si el servidor está encendido, que lo recargue ya (si no, lo leerá al arrancar)
    await servidor.executeCommand('tmbverif reload').catch(() => {});
    console.log('🔐 Códigos enviados al plugin del servidor');
  } catch (e) {
    console.error('⚠️ No se pudieron enviar los códigos al servidor:', e.message);
    pendienteSync = setTimeout(sincronizar, 60_000); // reintentar
  }
}

// ─── Avisos en Discord (publicación «🔐 Seguridad») ──────────────────────────
let hiloSeguridad = null;
async function canalSeguridad() {
  if (hiloSeguridad) return hiloSeguridad;
  const canal = await discord.channels.fetch(cfg.seguridadId).catch(() => null);
  if (!canal) throw new Error(`No encuentro el canal de seguridad ${cfg.seguridadId}`);
  if (canal.type !== ChannelType.GuildForum) return (hiloSeguridad = canal);
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
      message: { embeds: [new EmbedBuilder().setTitle('🔐 Registro de seguridad').setColor(COLOR.info)
        .setDescription('Aquí se apuntan las verificaciones de los jugadores en el servidor de Minecraft, las conexiones rechazadas y los bloqueos de IP.\n\nLos bloqueos **no se quitan solos**. Para quitar uno, en la consola de exaroton: `pardon-ip IP`.')] },
    });
  }
  return hiloSeguridad;
}

async function avisar(embed, components = []) {
  try {
    const hilo = await canalSeguridad();
    if (hilo.archived) await hilo.setArchived(false).catch(() => {});
    await hilo.send({ embeds: [embed.setTimestamp()], components, allowedMentions: { parse: [] } });
  } catch (e) {
    console.error('Error avisando en seguridad:', e.message);
    hiloSeguridad = null;
  }
}

const discordDe = (j) => (j?.userId ? `<@${j.userId}>` : '_desconocido_');
const eventosDe = (j) => Object.values(j?.eventos ?? {}).join(', ') || '—';
const campoIp = (nombre, ip) => ({ name: nombre, value: `||${ip}||`, inline: true });

// ─── Líneas del plugin ───────────────────────────────────────────────────────
export async function procesarLinea(linea) {
  const m = linea.match(RE_TMBV);
  if (!m) return;
  const [, tipo, nametag, ip, extra] = m;
  const j = jugador(nametag);
  const base = (color, titulo, texto) => new EmbedBuilder().setColor(color).setTitle(titulo).setDescription(texto);

  if (tipo === 'PENDIENTE') {
    const limite = Number(extra);
    return avisar(base(COLOR.pendiente, '⏳ Verificación pendiente',
      `\`${nametag}\` (${discordDe(j)}) ha entrado y tiene que poner su código${limite ? ` antes de las ${ts(limite, 'T')}` : ''}.`)
      .addFields(campoIp('🌐 IP', ip), { name: '🎮 Eventos', value: eventosDe(j), inline: true }));
  }
  if (tipo === 'VERIFICADO') {
    marcarVerificado(nametag, ip);
    return avisar(base(COLOR.ok, '✅ Verificado', `\`${nametag}\` (${discordDe(j)}) ha puesto su código correctamente.`)
      .addFields(campoIp('🌐 IP guardada', ip), { name: '🎮 Eventos', value: eventosDe(j), inline: true }));
  }
  if (tipo === 'BAN') {
    return avisar(base(COLOR.ban, '⛔ IP bloqueada', `Alguien intentó entrar como \`${nametag}\` (${discordDe(j)}) y **no pasó la verificación**.`)
      .addFields(
        { name: '📝 Motivo', value: extra || '—', inline: true },
        campoIp('🌐 IP bloqueada', ip),
        { name: '🎮 Eventos', value: eventosDe(j), inline: true },
        { name: '↩️ Para quitar el bloqueo', value: `En la consola de exaroton: \`pardon-ip ${ip}\`` },
      ));
  }
  if (tipo === 'RECHAZADO') {
    if (extra === 'duplicado') {
      return avisar(base(COLOR.rechazo, '🚷 Conexión rechazada',
        `Alguien intentó entrar como \`${nametag}\` (${discordDe(j)}) **mientras ya estaba conectado**. No se le ha dejado entrar y el jugador sigue en la partida.`)
        .addFields(campoIp('🌐 IP del intento', ip)));
    }
    const boton = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vmc:reset:${nametag}`).setLabel('Permitir nueva IP').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
    );
    return avisar(base(COLOR.rechazo, '🚷 Conexión rechazada',
      `Alguien intentó entrar como \`${nametag}\` (${discordDe(j)}) **desde una conexión distinta** a la verificada. No se le ha dejado entrar.\n\nSi es el jugador de verdad (por ejemplo, le ha cambiado la IP), pulsa **Permitir nueva IP**: podrá entrar y tendrá que volver a poner su código.`)
      .addFields(campoIp('🌐 IP del intento', ip), campoIp('🔐 IP verificada', j?.ip ?? '—')), [boton]);
  }
  if (tipo === 'RESET') marcarVerificado(nametag, null);
  return null;
}

async function botonReset(i, nametag) {
  if (nivelDe(i.member) < cfg.nivelDesbloquear) {
    return i.reply({ content: `⛔ Solo el nivel de autoridad ${cfg.nivelDesbloquear} o superior puede hacer esto.`, flags: MessageFlags.Ephemeral });
  }
  await i.deferUpdate();
  const ok = servidor && await cmd(`tmbverif reset ${nametag}`);
  if (!ok) return i.followUp({ content: '❌ No he podido hablar con el servidor de Minecraft (¿está apagado?). Prueba más tarde.', flags: MessageFlags.Ephemeral });
  marcarVerificado(nametag, null);
  const embed = EmbedBuilder.from(i.message.embeds[0]).setColor(COLOR.ok)
    .addFields({ name: '🔓 Desbloqueado', value: `${i.user} ha permitido una nueva conexión ${ts(Date.now(), 'R')}. Tendrá que volver a poner su código.` });
  return i.editReply({ embeds: [embed], components: [] });
}

export function registrarVerificacionMc(client) {
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton() || !i.customId.startsWith('vmc:reset:')) return;
    try {
      await botonReset(i, i.customId.split(':')[2]);
    } catch (e) {
      console.error('Botón verificación:', e);
    }
  });

  client.once(Events.ClientReady, () => {
    discord = client;
    if (!exarotonConfigurado()) return console.warn('⚠️ exaroton sin configurar: verificación en Minecraft desactivada');
    servidor = new Exaroton(process.env.EXAROTON_TOKEN).server(process.env.EXAROTON_SERVER_ID);
    servidor.on('console:line', (d) => procesarLinea(d.line).catch((e) => console.error('Verificación MC:', e)));
    servidor.subscribe('console');
    alCambiarCodigos.add(programarSincronizacion);
    programarSincronizacion();
    console.log('🔐 Verificación en Minecraft activa (plugin TmbVerificacion)');
  });
}

export const _test = { set: (srv, cli) => { servidor = srv; discord = cli; }, sincronizar };
