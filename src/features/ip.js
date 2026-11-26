// /ip: crea un canal privado solo con los jugadores aceptados de un evento y, a la hora indicada
// (o tras una cuenta atrás), publica la IP en grande mencionándolos a todos a la vez.
// La publicación programada se guarda en disco, así que sobrevive a los reinicios del bot.
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Events, MessageFlags,
  PermissionFlagsBits as P,
} from 'discord.js';
import { ipsProgramadas, programarIp, quitarIpProgramada } from '../datos.js';
import { nivelDe, rolesDesdeNivel, ts } from '../util.js';
import { madridAUtc } from './crearEvento.js';
import { nombreEventoRegistro, precargarEventos } from './eliminarFormularios.js';
import { destinatarios } from './mensajeWhitelist.js';

export const ipCfg = {
  categoriaId: '1573652090109038602', // categoría donde se crea el canal de la IP
  nivel: 5, // quién puede usar /ip y borrar el canal
  nivelStaffVe: 1, // el staff desde este nivel también ve el canal
};

const MAX_ESPERA = 2 ** 31 - 1; // límite de setTimeout (~24 días)
const temporizadores = new Map(); // id del canal -> timeout
const nombreCanal = (nombre) => `ip-${nombre}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'ip-evento';

// "HH:MM" de hoy en hora española -> timestamp (o null si no es válida)
function horaDeHoy(texto) {
  const m = texto.trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (!m) return null;
  const hoy = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return madridAUtc(Number(hoy.year), Number(hoy.month), Number(hoy.day), Number(m[1]), Number(m[2]));
}

const menciones = (ids) => ids.map((id) => `<@${id}>`);

// ─── Publicar la IP ──────────────────────────────────────────────────────────
async function publicar(client, canalId) {
  temporizadores.delete(canalId);
  const p = ipsProgramadas().find((x) => x.canalId === canalId);
  if (!p) return;
  quitarIpProgramada(canalId);
  const canal = await client.channels.fetch(canalId).catch(() => null);
  if (!canal) return; // lo borraron antes de tiempo
  const ids = p.usuarios;
  await canal.send({
    content: `# 🚀 LA IP ES: \`${p.ip}\`\n${menciones(ids.slice(0, 60)).join(' ')}`,
    allowedMentions: { users: ids.slice(0, 60) },
  });
  for (let n = 60; n < ids.length; n += 60) {
    await canal.send({ content: menciones(ids.slice(n, n + 60)).join(' '), allowedMentions: { users: ids.slice(n, n + 60) } });
  }
  await canal.send({
    embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`📋 Copia la IP: \`${p.ip}\`\n🔐 Al entrar, recuerda poner \`/verificacion TUCODIGO\`.\n\n¡Mucha suerte! 🍀`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ip:borrar').setLabel('Borrar canal (staff)').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    )],
  });
}

function agendar(client, canalId, cuando) {
  clearTimeout(temporizadores.get(canalId));
  const espera = cuando - Date.now();
  // Para esperas muy largas se vuelve a programar por tramos
  const t = espera > MAX_ESPERA
    ? setTimeout(() => agendar(client, canalId, cuando), MAX_ESPERA)
    : setTimeout(() => publicar(client, canalId).catch((e) => console.error('Publicando IP:', e)), Math.max(0, espera));
  temporizadores.set(canalId, t);
}

// ─── Comando ─────────────────────────────────────────────────────────────────
export async function comandoIp(i) {
  if (nivelDe(i.member) < ipCfg.nivel) {
    return i.reply({ content: `⛔ Solo el nivel de autoridad ${ipCfg.nivel} puede usar este comando.`, flags: MessageFlags.Ephemeral });
  }
  const ip = i.options.getString('ip', true).trim();
  const eventoId = i.options.getString('evento', true).match(/\d{15,}/)?.[0];
  const horaTexto = i.options.getString('hora');
  if (!eventoId) return i.reply({ content: '❌ Elige el evento de la lista.', flags: MessageFlags.Ephemeral });

  let cuando;
  if (horaTexto) {
    cuando = horaDeHoy(horaTexto);
    if (!cuando) return i.reply({ content: '❌ La hora tiene que ir en formato **HH:MM** (por ejemplo `18:30`).', flags: MessageFlags.Ephemeral });
    if (cuando <= Date.now()) return i.reply({ content: `❌ Las **${horaTexto.trim()}** de hoy ya han pasado. Pon una hora más tarde.`, flags: MessageFlags.Ephemeral });
  } else {
    cuando = Date.now() + (i.options.getInteger('cuenta_atras') ?? 10) * 1000;
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });

  const categoria = await i.guild.channels.fetch(ipCfg.categoriaId).catch(() => null);
  if (!categoria) return i.editReply(`❌ No encuentro la categoría ${ipCfg.categoriaId}.`);

  // Jugadores aceptados de ese evento que siguen en el servidor
  const lista = await destinatarios(i.guild, eventoId, true).catch((e) => e);
  if (lista instanceof Error) return i.editReply(`❌ ${lista.message}`);
  const dentro = [];
  const fuera = [];
  for (const d of lista) {
    if (await i.guild.members.fetch(d.userId).catch(() => null)) dentro.push(d);
    else fuera.push(d);
  }
  if (!dentro.length) return i.editReply('ℹ️ No hay jugadores aceptados de ese evento en el servidor.');
  if (dentro.length > 90) return i.editReply(`❌ Son ${dentro.length} jugadores y un canal solo admite unos 90 permisos individuales.`);

  const evento = await i.guild.scheduledEvents.fetch(eventoId).catch(() => null);
  if (!evento && !nombreEventoRegistro(eventoId)) await precargarEventos(i.guild);
  const nombre = evento?.name ?? nombreEventoRegistro(eventoId) ?? 'evento';
  const ids = dentro.map((d) => d.userId);

  const canal = await i.guild.channels.create({
    name: nombreCanal(nombre),
    type: ChannelType.GuildText,
    parent: categoria.type === ChannelType.GuildCategory ? categoria.id : categoria.parentId ?? undefined,
    topic: `IP del evento ${nombre} · evento:${eventoId}`,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.ManageChannels] },
      ...rolesDesdeNivel(i.guild, ipCfg.nivelStaffVe).map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory] })),
      // Los jugadores solo pueden leer (así nadie tapa la IP escribiendo)
      ...ids.map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads, P.CreatePrivateThreads] })),
    ],
  });

  // Se guarda antes de avisar, por si el bot se reinicia mientras espera
  programarIp(canal.id, { ip, cuando, usuarios: ids, nombre });
  agendar(i.client, canal.id, cuando);

  await canal.send({
    embeds: [new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`⏳ IP del evento · ${nombre}`)
      .setDescription(`La IP aparecerá aquí **${horaTexto ? `a las ${ts(cuando, 't')}` : 'en unos segundos'}** (${ts(cuando, 'R')}).\n\nCuando salga, **os mencionaré a todos a la vez**. Estad atentos: **entrarán los más rápidos**. 🏁`)],
  });
  return i.editReply(`✅ Canal ${canal} creado con **${ids.length}** jugador(es). La IP se publicará ${ts(cuando, 'F')} (${ts(cuando, 'R')}) mencionándolos a todos.${fuera.length ? `\n⚠️ ${fuera.length} aceptado(s) ya no están en el servidor: ${fuera.map((f) => `\`${f.nametag}\``).join(', ')}` : ''}`);
}

export function registrarIp(client) {
  // Al arrancar, volver a programar las IPs pendientes (si la hora ya pasó, se publican ya)
  client.once(Events.ClientReady, () => {
    for (const p of ipsProgramadas()) agendar(client, p.canalId, p.cuando);
  });

  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton() || i.customId !== 'ip:borrar') return;
    if (nivelDe(i.member) < ipCfg.nivel) {
      await i.reply({ content: `⛔ Solo el nivel de autoridad ${ipCfg.nivel} puede borrar este canal.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    await i.reply({ content: '🗑️ Borrando el canal en 5 segundos…' }).catch(() => {});
    setTimeout(() => i.channel?.delete('Canal de IP del evento borrado por el staff').catch(() => {}), 5000);
  });

  // Si borran el canal antes de que salga la IP, se cancela
  client.on(Events.ChannelDelete, (c) => {
    if (!temporizadores.has(c.id)) return;
    clearTimeout(temporizadores.get(c.id));
    temporizadores.delete(c.id);
    quitarIpProgramada(c.id);
  });
}

export const _test = { horaDeHoy, publicar, agendar };
