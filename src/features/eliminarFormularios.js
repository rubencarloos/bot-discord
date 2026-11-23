// /eliminar formularios: borra las inscripciones de un evento, quita a sus jugadores de la whitelist
// e invalida sus códigos de verificación e IPs guardadas (en el siguiente formulario tendrán un código nuevo).
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { eventos as cfg } from '../config.js';
import { eventosGuardados, jugador, quitarEvento } from '../datos.js';
import { exarotonConfigurado, quitarWhitelist } from '../exaroton.js';
import { nivelDe } from '../util.js';
import { leerAceptado, mensajesDelRegistro } from './whitelist.js';

const NIVEL = 5;
const deEvento = (m, id) => m.embeds[0]?.footer?.text?.endsWith(`evento:${id}`);

export async function autocompletar(i) {
  const texto = i.options.getFocused().toLowerCase();
  const mapa = new Map(eventosGuardados().map((e) => [e.id, `${e.nombre} · ${e.jugadores} aceptado(s)`]));
  const programados = await i.guild.scheduledEvents.fetch().catch(() => new Map());
  for (const ev of programados.values()) if (!mapa.has(ev.id)) mapa.set(ev.id, ev.name);
  const opciones = [...mapa].filter(([, n]) => !texto || n.toLowerCase().includes(texto)).slice(0, 25);
  return i.respond(opciones.map(([value, name]) => ({ name: name.slice(0, 100), value })));
}

export async function eliminarFormularios(i) {
  if (nivelDe(i.member) < NIVEL) {
    return i.reply({ content: `⛔ Solo el nivel de autoridad ${NIVEL} puede usar este comando.`, flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const eventoId = i.options.getString('evento', true).trim().match(/\d{15,}/)?.[0];
  if (!eventoId) return i.editReply('❌ Elige el evento de la lista.');

  const reg = await i.guild.channels.fetch(cfg.registroId).catch(() => null);
  if (!reg) return i.editReply('❌ No encuentro el canal de registro de eventos.');
  const inscripciones = (await mensajesDelRegistro(reg)).filter((m) => deEvento(m, eventoId));
  const aceptadas = inscripciones.map(leerAceptado).filter(Boolean);
  const guardado = eventosGuardados().find((e) => e.id === eventoId);
  const nombre = guardado?.nombre
    ?? (await i.guild.scheduledEvents.fetch(eventoId).catch(() => null))?.name
    ?? inscripciones[0]?.embeds[0]?.author?.name?.replace(/^🎮 /, '')
    ?? eventoId;

  if (!inscripciones.length && !guardado) return i.editReply(`ℹ️ No hay formularios del evento **${nombre}**.`);

  const fila = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('elim:si').setLabel('Sí, eliminar todo').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('elim:no').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  );
  const aviso = new EmbedBuilder()
    .setTitle(`🗑️ Eliminar formularios · ${nombre}`)
    .setColor(0xed4245)
    .setDescription([
      `Se van a borrar **${inscripciones.length}** inscripción(es) del registro (${aceptadas.length} aceptada(s)).`,
      'Los jugadores aceptados se **quitarán de la whitelist** y se **borrarán sus códigos de verificación e IPs**.',
      'En el siguiente formulario que hagan recibirán un código nuevo.',
      '',
      '⚠️ **No se puede deshacer.** Los baneos de IP se mantienen.',
    ].join('\n'));
  const respuesta = await i.editReply({ embeds: [aviso], components: [fila] });

  const boton = await respuesta.awaitMessageComponent({ filter: (b) => b.user.id === i.user.id, time: 60_000 }).catch(() => null);
  if (!boton || boton.customId === 'elim:no') {
    return i.editReply({ content: boton ? '❎ Cancelado.' : '⌛ Tiempo agotado, no se ha borrado nada.', embeds: [], components: [] });
  }
  await boton.update({ content: '⏳ Eliminando…', embeds: [], components: [] });

  // Nametags a quitar de la whitelist: los que se quedan sin ningún evento activo
  const sinEventos = quitarEvento(eventoId);
  const antiguos = aceptadas.map((a) => a.nametag).filter((n) => n !== '?' && !jugador(n)); // aceptados antes de los códigos
  const nametags = [...new Map([...sinEventos, ...antiguos].map((n) => [n.toLowerCase(), n])).values()];

  let whitelist = '—';
  if (nametags.length) {
    if (!exarotonConfigurado()) whitelist = '⚠️ exaroton no está configurado, quítalos a mano.';
    else {
      whitelist = await quitarWhitelist(nametags)
        .then(() => `🚫 Quitados ${nametags.length}: ${nametags.map((n) => `\`${n}\``).join(', ')}`)
        .catch((e) => `❌ No se pudo quitar de la whitelist: ${e.message}`);
    }
  }

  let borradas = 0;
  for (const m of inscripciones) {
    const ok = reg.type === ChannelType.GuildForum && m.channel?.isThread?.()
      ? await m.channel.delete('Formularios del evento eliminados').then(() => true).catch(() => false)
      : await m.delete().then(() => true).catch(() => false);
    if (ok) borradas++;
  }

  return i.editReply({
    content: '',
    embeds: [new EmbedBuilder()
      .setTitle(`✅ Formularios eliminados · ${nombre}`)
      .setColor(0x57f287)
      .addFields(
        { name: '🗂️ Inscripciones borradas', value: `${borradas} de ${inscripciones.length}`, inline: true },
        { name: '🔐 Códigos e IPs borrados', value: `${sinEventos.length}`, inline: true },
        { name: '📃 Whitelist', value: whitelist.slice(0, 1024) },
      )],
  });
}
