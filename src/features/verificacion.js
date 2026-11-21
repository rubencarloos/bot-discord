import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelFlags, ChannelType, EmbedBuilder, Events, MessageFlags,
} from 'discord.js';
import { verificacion as cfg } from '../config.js';
import { normas } from '../textos.js';
import { asegurarMensaje, crearModal, duracion, leerRespuestas, ts } from '../util.js';

const NORMAS_ID = 'verificacion:normas';
const ABRIR_ID = 'verificacion:abrir'; // + ':<hora en que aceptó las normas>'
const MODAL_ID = 'verificacion:formulario'; // + ':<hora en que aceptó las normas>'

function mensajePublico() {
  const embed = new EmbedBuilder()
    .setTitle(normas.titulo)
    .setDescription(`${normas.texto}\n\n**Para poder acceder al servidor tienes que aceptar las normas y rellenar el formulario.**`)
    .setColor(0x5865f2);
  const boton = new ButtonBuilder()
    .setCustomId(NORMAS_ID)
    .setLabel('He leído y acepto todas las normas y sus consecuencias.')
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(boton)] };
}

async function registrarEnForo(client, member, respuestas, aceptoNormas) {
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
      { name: '📜 Aceptó las normas', value: aceptoNormas ? ts(aceptoNormas) : '—', inline: true },
      { name: '📝 Hora a la que hizo el formulario', value: `${ts(ahora)}\n(tardó ${duracion(ahora - entro)})`, inline: true },
      { name: '📅 Tiempo en Discord', value: `${duracion(ahora - creada)}\n(cuenta creada el ${ts(creada, 'D')})` },
      ...respuestas.map((r) => ({ name: `❓ ${r.pregunta}`, value: r.respuesta.slice(0, 1024) || '—' })),
    )
    .setTimestamp(ahora);

  const obligaEtiqueta = foro.flags?.has(ChannelFlags.RequireTag) && foro.availableTags.length > 0;
  await foro.threads.create({
    name: `${member.user.username} (${member.id})`.slice(0, 100),
    message: { embeds: [embed] },
    appliedTags: obligaEtiqueta ? [foro.availableTags[0].id] : [],
  });
}

export function registrar(client) {
  client.once(Events.ClientReady, (c) =>
    asegurarMensaje(c, cfg.canalId, NORMAS_ID, mensajePublico(), [ABRIR_ID])
      .catch((e) => console.error('Verificación:', e)));

  // Al entrar: rol de "sin verificar"
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    await member.roles.add(cfg.rolSinVerificarId)
      .catch((e) => console.error('No pude dar el rol sin verificar:', e.message));
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // 1) Acepta las normas -> le aparece (solo a él) el botón del formulario
      if (interaction.isButton() && interaction.customId === NORMAS_ID) {
        if (interaction.member.roles.cache.has(cfg.rolVerificadoId)) {
          return interaction.reply({ content: '✅ Ya estás verificado.', flags: MessageFlags.Ephemeral });
        }
        const boton = new ButtonBuilder()
          .setCustomId(`${ABRIR_ID}:${Date.now()}`)
          .setLabel('Rellenar formulario').setEmoji('📝').setStyle(ButtonStyle.Primary);
        return interaction.reply({
          content: '✅ **Has aceptado las normas.** Ahora rellena el formulario para acceder al servidor:',
          components: [new ActionRowBuilder().addComponents(boton)],
          flags: MessageFlags.Ephemeral,
        });
      }

      // 2) Botón del formulario
      if (interaction.isButton() && interaction.customId.startsWith(ABRIR_ID)) {
        if (interaction.member.roles.cache.has(cfg.rolVerificadoId)) {
          return interaction.reply({ content: '✅ Ya estás verificado.', flags: MessageFlags.Ephemeral });
        }
        const acepto = interaction.customId.split(':')[2];
        if (!acepto) {
          return interaction.reply({ content: 'Primero tienes que aceptar las normas.', flags: MessageFlags.Ephemeral });
        }
        return interaction.showModal(crearModal(`${MODAL_ID}:${acepto}`, 'Formulario de acceso', cfg.preguntas));
      }

      // 3) Envía el formulario
      if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_ID)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const member = interaction.member;
        const aceptoNormas = Number(interaction.customId.split(':')[2]) || null;
        const respuestas = leerRespuestas(interaction, cfg.preguntas);

        await member.roles.add(cfg.rolVerificadoId);
        await member.roles.remove(cfg.rolSinVerificarId).catch(() => {});
        await registrarEnForo(interaction.client, member, respuestas, aceptoNormas)
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
