// /ip: crea un canal privado solo con los jugadores aceptados de un evento y, tras una cuenta atrás,
// publica la IP en grande a la vez para todos (así entran los más rápidos, no a los que antes les llega un MD).
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Events, MessageFlags,
  PermissionFlagsBits as P,
} from 'discord.js';
import { nivelDe, rolesDesdeNivel, ts } from '../util.js';
import { nombreEventoRegistro, precargarEventos } from './eliminarFormularios.js';
import { destinatarios } from './mensajeWhitelist.js';

export const ipCfg = {
  categoriaId: '1573652090109038602', // categoría donde se crea el canal de la IP
  nivel: 5, // quién puede usar /ip y borrar el canal
  nivelStaffVe: 1, // el staff desde este nivel también ve el canal
};

const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });
const nombreCanal = (nombre) => `ip-${nombre}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'ip-evento';

export async function comandoIp(i) {
  if (nivelDe(i.member) < ipCfg.nivel) {
    return i.reply({ content: `⛔ Solo el nivel de autoridad ${ipCfg.nivel} puede usar este comando.`, flags: MessageFlags.Ephemeral });
  }
  const ip = i.options.getString('ip', true).trim();
  const eventoId = i.options.getString('evento', true).match(/\d{15,}/)?.[0];
  const segundos = i.options.getInteger('cuenta_atras') ?? 10;
  if (!eventoId) return i.reply({ content: '❌ Elige el evento de la lista.', flags: MessageFlags.Ephemeral });
  await i.deferReply({ flags: MessageFlags.Ephemeral });

  const categoria = await i.guild.channels.fetch(ipCfg.categoriaId).catch(() => null);
  if (!categoria) return i.editReply(`❌ No encuentro la categoría ${ipCfg.categoriaId}.`);

  // Jugadores aceptados de ese evento que siguen en el servidor
  const lista = await destinatarios(i.guild, eventoId, true).catch((e) => e);
  if (lista instanceof Error) return i.editReply(`❌ ${lista.message}`);
  const miembros = [];
  const fuera = [];
  for (const d of lista) {
    const m = await i.guild.members.fetch(d.userId).catch(() => null);
    if (m) miembros.push({ ...d, miembro: m });
    else fuera.push(d);
  }
  if (!miembros.length) return i.editReply('ℹ️ No hay jugadores aceptados de ese evento en el servidor.');
  if (miembros.length > 90) return i.editReply(`❌ Son ${miembros.length} jugadores y un canal solo admite unos 90 permisos individuales.`);

  const evento = await i.guild.scheduledEvents.fetch(eventoId).catch(() => null);
  if (!evento && !nombreEventoRegistro(eventoId)) await precargarEventos(i.guild);
  const nombre = evento?.name ?? nombreEventoRegistro(eventoId) ?? 'evento';

  const canal = await i.guild.channels.create({
    name: nombreCanal(nombre),
    type: ChannelType.GuildText,
    parent: categoria.type === ChannelType.GuildCategory ? categoria.id : categoria.parentId ?? undefined,
    topic: `IP del evento ${nombre} · evento:${eventoId}`,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.ManageChannels, P.MentionEveryone] },
      ...rolesDesdeNivel(i.guild, ipCfg.nivelStaffVe).map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory] })),
      // Los jugadores solo pueden leer (así nadie tapa la IP escribiendo)
      ...miembros.map((m) => ({ id: m.userId, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads, P.CreatePrivateThreads] })),
    ],
  });

  const lanzamiento = Date.now() + segundos * 1000;
  const menciones = miembros.map((m) => `<@${m.userId}>`);
  // Aviso con cuenta atrás: todos entran al canal antes de que salga la IP
  for (let n = 0; n < menciones.length; n += 60) {
    await canal.send({
      content: n === 0
        ? `${menciones.slice(0, 60).join(' ')}\n\n# ⏳ La IP del evento **${nombre}** aparecerá aquí ${ts(lanzamiento, 'R')}\nEstad atentos: **entrarán los más rápidos**. 🏁`
        : menciones.slice(n, n + 60).join(' '),
      allowedMentions: { users: miembros.slice(n, n + 60).map((m) => m.userId) },
    });
  }
  await i.editReply(`✅ Canal ${canal} creado con **${miembros.length}** jugador(es). La IP se publicará ${ts(lanzamiento, 'R')}.${fuera.length ? `\n⚠️ ${fuera.length} aceptado(s) ya no están en el servidor: ${fuera.map((f) => `\`${f.nametag}\``).join(', ')}` : ''}`);

  await esperar(Math.max(0, lanzamiento - Date.now()));
  await canal.send({
    content: `# 🚀 LA IP ES: \`${ip}\`\n${menciones.slice(0, 60).join(' ')}`,
    allowedMentions: { users: miembros.slice(0, 60).map((m) => m.userId) },
  });
  await canal.send({
    embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`📋 Copia la IP: \`${ip}\`\n🔐 Al entrar, recuerda poner \`/verificacion TUCODIGO\`.\n\n¡Mucha suerte! 🍀`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ip:borrar').setLabel('Borrar canal (staff)').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    )],
  });
  return null;
}

export function registrarIp(client) {
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton() || i.customId !== 'ip:borrar') return;
    if (nivelDe(i.member) < ipCfg.nivel) {
      await i.reply({ content: `⛔ Solo el nivel de autoridad ${ipCfg.nivel} puede borrar este canal.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    await i.reply({ content: '🗑️ Borrando el canal en 5 segundos…' }).catch(() => {});
    setTimeout(() => i.channel?.delete('Canal de IP del evento borrado por el staff').catch(() => {}), 5000);
  });
}
