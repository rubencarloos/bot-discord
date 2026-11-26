// /mensajewhitelist: envía un mensaje privado (con archivos) a los jugadores que rellenaron el formulario de un evento
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { eventos as cfg } from '../config.js';
import { jugador } from '../datos.js';
import { nivelDe } from '../util.js';
import { precargarEventos } from './eliminarFormularios.js';
import { mensajesDelRegistro } from './whitelist.js';

const NIVEL = 5;
const MAX_MENSAJE = 1800;
const PAUSA_MS = 1200; // entre mensaje y mensaje, para no parecer spam a ojos de Discord
const borradores = new Map(); // id de la interacción -> { eventoId, soloAceptados, archivos }

// codigo: el código de verificación del jugador (o null si no hay que ponerlo)
const cabecera = (texto, conArchivos, codigo = null) =>
  `**Desde Tmb Studio te han enviado:**\n**Mensaje:**\n${texto}`
  + (codigo ? `\n\n🔐 **RECUERDA QUE TU CÓDIGO DE VERIFICACIÓN ES \`${codigo}\` Y SI NO LO PONES, SERÁS BANEADO**` : '')
  + (conArchivos ? '\n**Archivos:**' : '');

// Código de verificación del jugador, solo si ese nametag es de esa misma cuenta de Discord
function codigoDe(d) {
  const j = jugador(d.nametag);
  return j && j.userId === d.userId ? j.codigo : null;
}

// Inscripciones del evento: [{ userId, nametag, aceptado }] sin repetir usuarios
export async function destinatarios(guild, eventoId, soloAceptados) {
  const reg = await guild.channels.fetch(cfg.registroId).catch(() => null);
  if (!reg) throw new Error('No encuentro el canal de registro de eventos');
  const vistos = new Map();
  for (const m of await mensajesDelRegistro(reg)) {
    const e = m.embeds[0];
    if (!e?.footer?.text?.endsWith(`evento:${eventoId}`)) continue;
    const aceptado = e.footer.text.startsWith('Aceptado');
    if (soloAceptados && !aceptado) continue;
    const campo = (t) => e.fields.find((f) => f.name.includes(t))?.value ?? '';
    const userId = campo('Usuario de Discord').match(/`(\d{15,})`/)?.[1];
    if (userId && !vistos.has(userId)) vistos.set(userId, { userId, nametag: campo('Usuario Minecraft').match(/`([^`]+)`/)?.[1] ?? '?', aceptado });
  }
  return [...vistos.values()];
}

export async function comandoMensajeWhitelist(i) {
  if (nivelDe(i.member) < NIVEL) {
    return i.reply({ content: `⛔ Solo el nivel de autoridad ${NIVEL} puede usar este comando.`, flags: MessageFlags.Ephemeral });
  }
  const eventoId = i.options.getString('evento', true).match(/\d{15,}/)?.[0];
  if (!eventoId) return i.reply({ content: '❌ Elige el evento de la lista.', flags: MessageFlags.Ephemeral });
  const archivos = [1, 2, 3, 4, 5].map((n) => i.options.getAttachment(`archivo${n}`)).filter(Boolean);
  const grande = archivos.find((a) => a.size > 10 * 1024 * 1024);
  if (grande) return i.reply({ content: `❌ El archivo **${grande.name}** pesa más de 10 MB y el bot no puede enviarlo.`, flags: MessageFlags.Ephemeral });

  borradores.set(i.id, {
    eventoId,
    soloAceptados: (i.options.getString('destinatarios') ?? 'aceptados') === 'aceptados',
    conCodigo: i.options.getBoolean('codigo') ?? false,
    archivos,
  });
  setTimeout(() => borradores.delete(i.id), 15 * 60_000).unref();

  // El mensaje se escribe en un formulario para poder usar saltos de línea, como un mensaje normal
  return i.showModal(new ModalBuilder()
    .setCustomId(`mwl:modal:${i.id}`)
    .setTitle('Mensaje para los jugadores')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('texto')
      .setLabel('Mensaje')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Escribe aquí el mensaje. Puedes usar saltos de línea, **negrita**, enlaces...')
      .setMaxLength(MAX_MENSAJE)
      .setRequired(true))));
}

export async function modalMensajeWhitelist(i) {
  const id = i.customId.split(':')[2];
  const b = borradores.get(id);
  if (!b) return i.reply({ content: '⌛ Este borrador ha caducado. Vuelve a usar /mensajewhitelist.', flags: MessageFlags.Ephemeral });
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  b.texto = i.fields.getTextInputValue('texto').trim();

  const lista = await destinatarios(i.guild, b.eventoId, b.soloAceptados).catch((e) => e);
  if (lista instanceof Error) return i.editReply(`❌ ${lista.message}`);
  if (!lista.length) return i.editReply(`ℹ️ No hay jugadores ${b.soloAceptados ? 'aceptados' : 'inscritos'} en ese evento.`);
  b.lista = lista;
  const sinCodigo = b.conCodigo ? lista.filter((d) => !codigoDe(d)).length : 0;
  const nombre = (await i.guild.scheduledEvents.fetch(b.eventoId).catch(() => null))?.name ?? 'el evento';

  // Vista previa: exactamente lo que recibirán
  await i.editReply({
    content: `👀 **Vista previa** · se enviará por privado a **${lista.length}** jugador(es) ${b.soloAceptados ? 'aceptados' : 'inscritos'} en **${nombre}**:`
      + (b.conCodigo ? '\n🔐 Cada uno verá **su propio código** (aquí sale `123456` de ejemplo).' : '')
      + (sinCodigo ? `\n⚠️ ${sinCodigo} no tienen código (sin aceptar, o el nametag es de otra cuenta): les llegará sin la línea del código.` : '')
      + '\n─────────────',
    flags: MessageFlags.Ephemeral,
  });
  await i.followUp({
    content: cabecera(b.texto, b.archivos.length, b.conCodigo ? '123456' : null),
    files: b.archivos.map((a) => ({ attachment: a.url, name: a.name })),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
  return i.followUp({
    content: '¿Lo envío?',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mwl:enviar:${id}`).setLabel(`Enviar a ${lista.length}`).setEmoji('📨').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`mwl:cancelar:${id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
    )],
    flags: MessageFlags.Ephemeral,
  });
}

export async function botonMensajeWhitelist(i) {
  const [, accion, id] = i.customId.split(':');
  const b = borradores.get(id);
  if (!b?.lista) return i.update({ content: '⌛ Este borrador ha caducado. Vuelve a usar /mensajewhitelist.', components: [] });
  borradores.delete(id);
  if (accion === 'cancelar') return i.update({ content: '❎ Cancelado, no se ha enviado nada.', components: [] });

  await i.update({ content: `⏳ Enviando a ${b.lista.length} jugador(es)…`, components: [] });
  const fallos = [];
  let enviados = 0;
  for (const d of b.lista) {
    const ok = await i.client.users.fetch(d.userId)
      .then((u) => u.send({ content: cabecera(b.texto, b.archivos.length, b.conCodigo ? codigoDe(d) : null), files: b.archivos.map((a) => ({ attachment: a.url, name: a.name })), allowedMentions: { parse: [] } }))
      .then(() => true)
      .catch(() => false);
    if (ok) enviados++;
    else fallos.push(d);
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  const resumen = new EmbedBuilder()
    .setTitle('📨 Mensaje enviado')
    .setColor(fallos.length ? 0xfee75c : 0x57f287)
    .addFields({ name: '✅ Enviados', value: `${enviados}`, inline: true }, { name: '❌ No recibidos', value: `${fallos.length}`, inline: true });
  if (fallos.length) {
    resumen.addFields({
      name: 'Tienen los MD cerrados (o salieron del servidor)',
      value: fallos.map((f) => `<@${f.userId}> · \`${f.nametag}\``).join('\n').slice(0, 1024),
    });
  }
  return i.editReply({ content: '', embeds: [resumen] });
}

export function registrarMensajeWhitelist(client) {
  // Leer el registro al arrancar para que la lista de eventos salga al momento
  client.once('clientReady', () => { for (const g of client.guilds.cache.values()) precargarEventos(g); });
  client.on('interactionCreate', async (i) => {
    try {
      if (i.isModalSubmit() && i.customId.startsWith('mwl:modal:')) return await modalMensajeWhitelist(i);
      if (i.isButton() && i.customId.startsWith('mwl:')) return await botonMensajeWhitelist(i);
    } catch (e) {
      console.error('Mensaje whitelist:', e);
      const msg = '❌ Algo ha fallado al enviar el mensaje.';
      if (i.deferred || i.replied) await i.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      else if (i.isRepliable()) await i.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return null;
  });
}
