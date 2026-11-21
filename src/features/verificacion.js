import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelFlags, ChannelType, EmbedBuilder, Events,
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { verificacion as cfg } from '../config.js';

const BOTON_ID = 'verificacion:abrir';
const MODAL_ID = 'verificacion:formulario';
const ts = (ms, f = 'F') => `<t:${Math.floor(ms / 1000)}:${f}>`;

// Convierte milisegundos en algo como "2 años y 3 meses"
function duracion(ms) {
  const unidades = [['año', 'años', 525600], ['mes', 'meses', 43200], ['día', 'días', 1440], ['hora', 'horas', 60], ['minuto', 'minutos', 1]];
  let resto = Math.floor(ms / 60000);
  const partes = [];
  for (const [uno, varios, valor] of unidades) {
    const n = Math.floor(resto / valor);
    if (n > 0) {
      partes.push(`${n} ${n === 1 ? uno : varios}`);
      resto -= n * valor;
    }
    if (partes.length === 2) break;
  }
  return partes.length ? partes.join(' y ') : 'menos de 1 minuto';
}

// Publica el mensaje con el botón si todavía no existe en el canal
async function asegurarMensaje(client) {
  const canal = await client.channels.fetch(cfg.canalId).catch(() => null);
  if (!canal?.isTextBased()) return console.error('⚠️ Verificación: no encuentro el canal', cfg.canalId);

  const recientes = await canal.messages.fetch({ limit: 50 });
  const yaExiste = recientes.some((m) =>
    m.author.id === client.user.id &&
    m.components.some((fila) => fila.components?.some((c) => c.customId === BOTON_ID)));
  if (yaExiste) return console.log('Verificación: el mensaje del formulario ya existe.');

  const embed = new EmbedBuilder()
    .setTitle('📋 Verificación')
    .setDescription('Para poder acceder al servidor tienes que rellenar este formulario.\n\nPulsa el botón de abajo para empezar.')
    .setColor(0x5865f2);
  const boton = new ButtonBuilder()
    .setCustomId(BOTON_ID).setLabel('Rellenar formulario').setEmoji('📝').setStyle(ButtonStyle.Primary);
  await canal.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(boton)] });
  console.log('Verificación: mensaje del formulario publicado.');
}

function crearModal() {
  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Formulario de acceso');
  for (const p of cfg.preguntas.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(p.id)
      .setLabel(p.texto.slice(0, 45))
      .setStyle(p.estilo === 'largo' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setMaxLength(p.max ?? 400)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

async function registrarEnForo(client, member, respuestas) {
  const foro = await client.channels.fetch(cfg.foroRegistroId).catch(() => null);
  if (foro?.type !== ChannelType.GuildForum) {
    return console.error('⚠️ Verificación: el canal de registro no es un foro', cfg.foroRegistroId);
  }
  const ahora = Date.now();
  const entro = member.joinedTimestamp ?? ahora;
  const creada = member.user.createdTimestamp;

  const embed = new EmbedBuilder()
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setColor(0x57f287)
    .addFields(
      { name: '👤 Usuario', value: `${member} · \`${member.id}\`` },
      { name: '🚪 Hora a la que entró al servidor', value: ts(entro), inline: true },
      { name: '📝 Hora a la que hizo el formulario', value: `${ts(ahora)}\n(tardó ${duracion(ahora - entro)})`, inline: true },
      { name: '📅 Tiempo en Discord', value: `${duracion(ahora - creada)}\n(cuenta creada el ${ts(creada, 'D')})` },
      ...respuestas.map((r) => ({ name: `❓ ${r.pregunta}`, value: r.respuesta.slice(0, 1024) || '—' })),
    )
    .setTimestamp(ahora);

  // Si el foro obliga a poner etiqueta, usa la primera disponible
  const obligaEtiqueta = foro.flags?.has(ChannelFlags.RequireTag) && foro.availableTags.length > 0;
  await foro.threads.create({
    name: `${member.user.username} (${member.id})`.slice(0, 100),
    message: { embeds: [embed] },
    appliedTags: obligaEtiqueta ? [foro.availableTags[0].id] : [],
  });
}

export function registrar(client) {
  client.once(Events.ClientReady, (c) => asegurarMensaje(c).catch((e) => console.error('Verificación:', e)));

  // Al entrar: rol de "sin verificar"
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    await member.roles.add(cfg.rolSinVerificarId)
      .catch((e) => console.error('No pude dar el rol sin verificar:', e.message));
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton() && interaction.customId === BOTON_ID) {
        if (interaction.member.roles.cache.has(cfg.rolVerificadoId)) {
          return interaction.reply({ content: '✅ Ya estás verificado.', flags: MessageFlags.Ephemeral });
        }
        return interaction.showModal(crearModal());
      }

      if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const member = interaction.member;
        const respuestas = cfg.preguntas.slice(0, 5).map((p) => ({
          pregunta: p.texto,
          respuesta: interaction.fields.getTextInputValue(p.id).trim(),
        }));

        await member.roles.add(cfg.rolVerificadoId);
        await member.roles.remove(cfg.rolSinVerificarId).catch(() => {});
        await registrarEnForo(interaction.client, member, respuestas)
          .catch((e) => console.error('No pude registrar en el foro:', e));

        await interaction.editReply('🎉 ¡Formulario completado! Ya tienes acceso al servidor.');
      }
    } catch (err) {
      console.error('Verificación:', err);
      const msg = '❌ Algo ha fallado. Avisa a un administrador.';
      if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => {});
      else if (interaction.isRepliable()) await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}
