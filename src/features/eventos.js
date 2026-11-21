import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelFlags, ChannelType, EmbedBuilder, Events, MessageFlags,
  ModalBuilder, PermissionFlagsBits as P, StringSelectMenuBuilder,
} from 'discord.js';
import { eventos as cfg } from '../config.js';
import { normativaEvento, politicaPremios } from '../textos.js';
import { nivelDe, ts } from '../util.js';

const COLOR = { marca: 0x5865f2, paso: 0x3ba55c, aviso: 0xfee75c, peligro: 0xed4245, oro: 0xf1c40f, ok: 0x57f287 };
const TOTAL_PASOS = 4;
const NAMETAG_VALIDO = /^[A-Za-z0-9_]{3,16}$/;

// Formularios en curso: id del canal privado -> estado
const formularios = new Map();

const progreso = (n) => `${'🟩'.repeat(n)}${'⬛'.repeat(TOTAL_PASOS - n)}  ·  Paso ${n} de ${TOTAL_PASOS}`;
const btn = (id, label, emoji, estilo = ButtonStyle.Primary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(estilo);
const fila = (...b) => new ActionRowBuilder().addComponents(b);
// Sustituye los botones de un paso por un botón gris desactivado ("Normativa aceptada", etc.)
const hecho = (texto, emoji = '✅') =>
  [fila(new ButtonBuilder().setCustomId('x:hecho').setLabel(texto).setEmoji(emoji).setStyle(ButtonStyle.Secondary).setDisabled(true))];

async function buscarEvento(guild, id) {
  if (!/^\d{17,20}$/.test(id ?? '')) return null;
  return guild.scheduledEvents.fetch(id).catch(() => null);
}

function embedPaso(estado, n, titulo, color = COLOR.paso) {
  return new EmbedBuilder()
    .setAuthor({ name: `📋 Formulario · ${estado.eventoNombre}` })
    .setTitle(titulo)
    .setColor(color)
    .setFooter({ text: progreso(n) });
}

// ─── Mensaje público que publica /formulario ──────────────────────────────────
export async function publicarFormulario(interaction, eventoId) {
  if (nivelDe(interaction.member) < cfg.nivelPublicar) {
    return interaction.reply({ content: `⛔ Necesitas nivel de autoridad ${cfg.nivelPublicar}.`, flags: MessageFlags.Ephemeral });
  }
  const evento = await buscarEvento(interaction.guild, eventoId);
  if (!evento) {
    return interaction.reply({ content: '❌ No existe ningún evento del servidor con ese ID. Elige uno de la lista al escribir el comando.', flags: MessageFlags.Ephemeral });
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Tmb Studio · Inscripciones', iconURL: interaction.guild.iconURL() ?? undefined })
    .setTitle(`🎮 ${evento.name}`)
    .setDescription(`Las inscripciones para **${evento.name}** ya están abiertas.\n\nRellena el formulario de acceso para que el equipo de Tmb Studio evalúe tu candidatura. **Las plazas son limitadas.**`)
    .addFields(
      { name: '📅 Fecha', value: `${ts(evento.scheduledStartTimestamp)}\n${ts(evento.scheduledStartTimestamp, 'R')}`, inline: true },
      { name: '⏱️ Duración del formulario', value: 'Unos 2 minutos', inline: true },
      { name: '🧾 Cómo funciona', value: '> **1.** Pulsa el botón de abajo.\n> **2.** Se abrirá un canal privado solo para ti.\n> **3.** Responde las preguntas y acepta la normativa.\n> **4.** Si eres seleccionado, te avisaremos por mensaje privado.' },
    )
    .setColor(COLOR.marca)
    .setFooter({ text: 'Tmb Studio · Producción de eventos' });
  if (evento.description) embed.addFields({ name: '📝 Sobre el evento', value: evento.description.slice(0, 1024) });
  const portada = evento.coverImageURL({ size: 1024 });
  if (portada) embed.setImage(portada);
  else if (interaction.guild.iconURL()) embed.setThumbnail(interaction.guild.iconURL({ size: 256 }));

  await interaction.channel.send({
    embeds: [embed],
    components: [fila(
      btn(`ev:abrir:${evento.id}`, 'Rellena este formulario para poder acceder al evento', '📝', ButtonStyle.Success),
      new ButtonBuilder().setLabel('Ver evento').setEmoji('📅').setStyle(ButtonStyle.Link).setURL(evento.url),
    )],
  });
  return interaction.reply({ content: `✅ Formulario de **${evento.name}** publicado.`, flags: MessageFlags.Ephemeral });
}

export async function autocompletarEventos(interaction) {
  const texto = interaction.options.getFocused().toLowerCase();
  const lista = await interaction.guild.scheduledEvents.fetch().catch(() => null);
  const opciones = [...(lista?.values() ?? [])]
    .filter((e) => e.name.toLowerCase().includes(texto) || e.id.startsWith(texto))
    .sort((a, b) => a.scheduledStartTimestamp - b.scheduledStartTimestamp)
    .slice(0, 25)
    .map((e) => ({
      name: `${e.name} · ${new Date(e.scheduledStartTimestamp).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}`.slice(0, 100),
      value: e.id,
    }));
  await interaction.respond(opciones);
}

// ─── Canal privado ───────────────────────────────────────────────────────────
function reiniciarCaducidad(canal, estado) {
  clearTimeout(estado.timer);
  estado.timer = setTimeout(async () => {
    formularios.delete(canal.id);
    await canal.delete('Formulario de evento sin completar').catch(() => {});
  }, cfg.minutosParaCompletar * 60_000);
}

async function abrirFormulario(i, eventoId) {
  const evento = await buscarEvento(i.guild, eventoId);
  if (!evento) return i.reply({ content: '❌ Este evento ya no existe.', flags: MessageFlags.Ephemeral });

  const existente = i.guild.channels.cache.find((c) => c.topic?.includes(`<@${i.user.id}>`) && c.topic.includes(`evento:${eventoId}`));
  if (existente && formularios.has(existente.id)) {
    return i.reply({
      content: `📝 Ya tienes un formulario abierto para este evento: ${existente}`,
      components: [fila(new ButtonBuilder().setLabel('Ir al formulario').setEmoji('📝').setStyle(ButtonStyle.Link).setURL(existente.url))],
      flags: MessageFlags.Ephemeral,
    });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });

  const nombre = `📝・formulario-${i.user.username}`.toLowerCase().replace(/[^\p{L}\p{N}\p{Emoji_Presentation}・_-]/gu, '').slice(0, 100);
  const canal = await i.guild.channels.create({
    name: nombre,
    type: ChannelType.GuildText,
    parent: i.channel.parentId ?? undefined,
    topic: `Formulario de acceso de <@${i.user.id}> para ${evento.name} · evento:${evento.id}`,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.ManageChannels] },
      { id: i.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory], deny: [P.AttachFiles, P.CreatePublicThreads, P.CreatePrivateThreads] },
    ],
  });

  const estado = {
    userId: i.user.id, eventoId: evento.id, eventoNombre: evento.name, eventoFecha: evento.scheduledStartTimestamp,
    paso: 'bienvenida', nametag: null, microfono: null, mods: null, timer: null,
  };
  formularios.set(canal.id, estado);
  reiniciarCaducidad(canal, estado);

  const bienvenida = new EmbedBuilder()
    .setAuthor({ name: 'Tmb Studio · Proceso de selección', iconURL: i.guild.iconURL() ?? undefined })
    .setTitle(`📋 Formulario de acceso · ${evento.name}`)
    .setDescription(`Hola ${i.user}, bienvenido al proceso de inscripción.\n\nEste formulario nos permite conocer tu perfil y **evaluar si cumples los requisitos** para participar en **${evento.name}**. Todas tus respuestas serán revisadas por el equipo de administración de Tmb Studio.\n\nTe pedimos que respondas con sinceridad: cualquier dato falso supondrá la **descalificación automática**.`)
    .addFields(
      { name: '📅 Evento', value: `${ts(evento.scheduledStartTimestamp)}`, inline: true },
      { name: '⏳ Tiempo límite', value: `${cfg.minutosParaCompletar} minutos`, inline: true },
      { name: '🧾 Qué te pediremos', value: '> ⛏️ Tu nametag de Minecraft\n> 🎙️ Requisitos técnicos\n> 📜 Aceptar la normativa del evento\n> 🏆 Aceptar la política de premios' },
      { name: '🔒 Privacidad', value: '> Este canal es **privado**: solo lo ves tú y el bot. Se eliminará automáticamente al terminar.' },
    )
    .setThumbnail(i.user.displayAvatarURL({ size: 256 }))
    .setColor(COLOR.marca)
    .setFooter({ text: 'Pulsa «Aceptar y comenzar» cuando estés listo' });

  await canal.send({
    content: `${i.user}`,
    embeds: [bienvenida],
    components: [fila(btn('evf:comenzar', 'Aceptar y comenzar', '✅', ButtonStyle.Success), btn('evf:cancelar', 'Cancelar', '✖️', ButtonStyle.Secondary))],
  });
  await i.editReply({
    content: `✅ Tu formulario está listo en ${canal}`,
    components: [fila(new ButtonBuilder().setLabel('Ir al formulario').setEmoji('📝').setStyle(ButtonStyle.Link).setURL(canal.url))],
  });
}

// ─── Pasos ───────────────────────────────────────────────────────────────────
async function pasoNametag(canal, estado) {
  estado.paso = 'nametag';
  const embed = embedPaso(estado, 1, '⛏️ ¿Cuál es tu nametag (nombre) en Minecraft?')
    .setDescription('Escribe tu nametag **en este canal** como un mensaje normal.')
    .addFields(
      { name: '⚠️ ADVERTENCIA', value: '> Coloca bien el nametag, **sin espacios** y respetando mayúsculas y minúsculas. Si no, **no se te podrá agregar a la lista blanca**.' },
      { name: '✅ Ejemplo válido', value: '`Steve_123`', inline: true },
      { name: '❌ Ejemplo no válido', value: '`Steve 123`', inline: true },
    );
  await canal.send({ embeds: [embed] });
}

async function pasoCasillas(canal, estado) {
  estado.paso = 'casillas';
  const embed = embedPaso(estado, 2, '🎙️ Requisitos técnicos')
    .setDescription('Responde las casillas que confirmes que **posees o tienes conocimiento**.\n\nPulsa el botón de abajo y marca solo las que sean ciertas.')
    .addFields(
      { name: '🎙️ Micrófono', value: '> ¿Posees micrófono para el evento?', inline: true },
      { name: '🧩 Mods', value: '> ¿Sabes instalar los mods por tu cuenta?', inline: true },
    );
  await canal.send({ embeds: [embed], components: [fila(btn('evf:casillas', 'Seleccionar casillas', '☑️'))] });
}

async function pasoNormativa(canal, estado) {
  estado.paso = 'normativa';
  const embed = embedPaso(estado, 3, normativaEvento.titulo, COLOR.aviso)
    .setDescription(normativaEvento.intro)
    .addFields(normativaEvento.secciones.map(([name, value]) => ({ name, value: `> ${value}` })));
  await canal.send({
    embeds: [embed],
    components: [fila(btn('evf:normas', 'He leído y acepto todas las normas y sus consecuencias.', '📜', ButtonStyle.Success))],
  });
}

async function pasoPremios(canal, estado) {
  estado.paso = 'premios';
  const embed = embedPaso(estado, 4, politicaPremios.titulo, COLOR.oro).setDescription(politicaPremios.texto)
    .addFields({ name: '🎁 Formato del premio', value: '> 💳 Tarjeta regalo digital\n> 🚫 Sin canje por dinero en efectivo ni transferencias', inline: true },
      { name: '🥇 Destinatario', value: '> Solo el ganador oficial, tras validar la grabación', inline: true });
  await canal.send({
    embeds: [embed],
    components: [fila(btn('evf:premios', 'Acepto las condiciones de participación y entrega del premio.', '🏆', ButtonStyle.Success))],
  });
}

async function finalizar(canal, estado, usuario) {
  estado.paso = 'fin';
  clearTimeout(estado.timer);
  const borrado = Date.now() + 30_000;
  const embed = new EmbedBuilder()
    .setTitle('✅ Formulario completado')
    .setDescription(`¡Gracias, ${usuario}! Hemos recibido tu inscripción para **${estado.eventoNombre}**.\n\n📩 En caso de que se te acepte, **se te avisará por privado**. Asegúrate de tener los mensajes directos abiertos.\n\n🗑️ Este canal se eliminará ${ts(borrado, 'R')}.`)
    .addFields(
      { name: '⛏️ Nametag', value: `\`${estado.nametag}\``, inline: true },
      { name: '🎙️ Micrófono', value: estado.microfono ? '✅ Sí' : '❌ No', inline: true },
      { name: '🧩 Mods', value: estado.mods ? '✅ Sí' : '❌ No', inline: true },
    )
    .setColor(COLOR.ok)
    .setFooter({ text: 'Tmb Studio · Proceso de selección' });
  await canal.send({ embeds: [embed] });

  await registrar(canal.guild, estado, usuario).catch((e) => console.error('Formulario evento: no pude registrar:', e));
  setTimeout(() => {
    formularios.delete(canal.id);
    canal.delete('Formulario de evento completado').catch(() => {});
  }, 30_000);
}

// ─── Registro y aceptación ───────────────────────────────────────────────────
async function registrar(guild, estado, usuario) {
  const reg = await guild.channels.fetch(cfg.registroId).catch(() => null);
  if (!reg) throw new Error('No encuentro el canal de registro de eventos');
  const embed = new EmbedBuilder()
    .setAuthor({ name: `🎮 ${estado.eventoNombre}`, iconURL: guild.iconURL() ?? undefined })
    .setTitle('📋 Nueva inscripción')
    .setThumbnail(usuario.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 Usuario de Discord', value: `${usuario}\n\`${usuario.username}\` · \`${usuario.id}\``, inline: true },
      { name: '⛏️ Usuario Minecraft', value: `\`${estado.nametag}\``, inline: true },
      { name: '​', value: '​', inline: true },
      { name: '🎙️ Dispone de micrófono', value: estado.microfono ? '✅ Sí' : '❌ No', inline: true },
      { name: '🧩 Puede instalar mods', value: estado.mods ? '✅ Sí' : '❌ No', inline: true },
      { name: '​', value: '​', inline: true },
    )
    .setColor(COLOR.marca)
    .setFooter({ text: `Pendiente de revisión · evento:${estado.eventoId}` })
    .setTimestamp();
  const payload = {
    embeds: [embed],
    components: [fila(btn(`ev:aceptar:${estado.eventoId}:${usuario.id}`, 'Aceptar usuario', '✅', ButtonStyle.Success))],
    allowedMentions: { parse: [] },
  };
  if (reg.type === ChannelType.GuildForum) {
    const obligaEtiqueta = reg.flags?.has(ChannelFlags.RequireTag) && reg.availableTags.length > 0;
    await reg.threads.create({
      name: `${estado.nametag} · ${estado.eventoNombre}`.slice(0, 100),
      message: payload,
      appliedTags: obligaEtiqueta ? [reg.availableTags[0].id] : [],
    });
  } else {
    await reg.send(payload);
  }
}

async function aceptarUsuario(i, eventoId, userId) {
  if (nivelDe(i.member) < cfg.nivelAceptar) {
    return i.reply({ content: `⛔ Solo el nivel de autoridad ${cfg.nivelAceptar} puede aceptar usuarios.`, flags: MessageFlags.Ephemeral });
  }
  await i.deferUpdate();
  const evento = await buscarEvento(i.guild, eventoId);
  const nombre = evento?.name ?? i.message.embeds[0]?.author?.name?.replace(/^🎮 /, '') ?? 'el evento';
  const usuario = await i.client.users.fetch(userId).catch(() => null);

  const dm = new EmbedBuilder()
    .setAuthor({ name: 'Tmb Studio', iconURL: i.guild.iconURL() ?? undefined })
    .setTitle('🎉 ¡Felicidades!')
    .setDescription(`¡Has sido **aceptado** para el evento **${nombre}**!\n\n📅 Recuerda estar presente en la fecha ${evento ? `**${ts(evento.scheduledStartTimestamp)}** (${ts(evento.scheduledStartTimestamp, 'R')})` : 'indicada'} o, si no, **no podrás participar**.\n\n¡Nos vemos! 👋`)
    .setColor(COLOR.ok)
    .setFooter({ text: `Tmb Studio · ${i.guild.name}` })
    .setTimestamp();
  const portada = evento?.coverImageURL({ size: 1024 });
  if (portada) dm.setImage(portada);
  else if (i.guild.iconURL()) dm.setThumbnail(i.guild.iconURL({ size: 256 }));

  let enviado = false;
  if (usuario) {
    enviado = await usuario.send({
      embeds: [dm],
      components: evento ? [fila(new ButtonBuilder().setLabel('Ver evento').setEmoji('📅').setStyle(ButtonStyle.Link).setURL(evento.url))] : [],
    }).then(() => true).catch(() => false);
  }

  const actualizado = EmbedBuilder.from(i.message.embeds[0])
    .setTitle('✅ Inscripción aceptada')
    .setColor(COLOR.ok)
    .addFields({ name: '🛡️ Estado', value: `Aceptado por ${i.user} ${ts(Date.now(), 'R')}${enviado ? '\n📩 Mensaje privado enviado' : '\n⚠️ No se pudo enviar el mensaje privado (tiene los MD cerrados)'}` })
    .setFooter({ text: `Aceptado · evento:${eventoId}` });
  await i.editReply({
    embeds: [actualizado],
    components: [fila(new ButtonBuilder().setCustomId(`x:${i.message.id}`).setLabel(`Aceptado por ${i.user.username}`).setEmoji('✅').setStyle(ButtonStyle.Secondary).setDisabled(true))],
  });
  if (!enviado) {
    await i.followUp({ content: `⚠️ Usuario aceptado, pero no he podido enviarle el mensaje privado${usuario ? ` a ${usuario}` : ''}. Avísale tú.`, flags: MessageFlags.Ephemeral });
  }
}

// ─── Casillas (formulario emergente con checkboxes; si falla, menú desplegable) ─
function modalCasillas() {
  return new ModalBuilder()
    .setCustomId('evf:casillas-modal')
    .setTitle('Requisitos técnicos')
    .addTextDisplayComponents((t) => t.setContent('Marca **solo** las casillas que confirmes que posees o tienes conocimiento.'))
    .addLabelComponents(
      (l) => l.setLabel('¿Posees micrófono para el evento?').setCheckboxComponent((c) => c.setCustomId('microfono')),
      (l) => l.setLabel('¿Sabes instalar los mods por tu cuenta?')
        .setDescription('¿Tienes conocimiento para instalar los mods por tu propia cuenta?')
        .setCheckboxComponent((c) => c.setCustomId('mods')),
    );
}

function selectorCasillas() {
  return fila(new StringSelectMenuBuilder()
    .setCustomId('evf:casillas-select')
    .setPlaceholder('Marca lo que confirmes…')
    .setMinValues(1).setMaxValues(2)
    .addOptions(
      { label: 'Poseo micrófono para el evento', value: 'microfono', emoji: '🎙️' },
      { label: 'Sé instalar los mods por mi cuenta', value: 'mods', emoji: '🧩' },
      { label: 'Ninguna de las dos', value: 'ninguna', emoji: '❌' },
    ));
}

async function guardarCasillas(i, estado, microfono, mods) {
  estado.microfono = microfono;
  estado.mods = mods;
  const resumen = `🎙️ Micrófono: ${microfono ? '✅ Sí' : '❌ No'}  ·  🧩 Mods: ${mods ? '✅ Sí' : '❌ No'}`;
  if (i.isFromMessage?.() || i.isStringSelectMenu()) {
    await i.update({ components: hecho(resumen, '☑️') });
  } else {
    await i.reply({ content: resumen });
  }
  await pasoNormativa(i.channel, estado);
}

// ─── Listeners ───────────────────────────────────────────────────────────────
export function registrarEventos(client) {
  // Los formularios a medias no sobreviven a un reinicio: se borran sus canales
  client.once(Events.ClientReady, async (c) => {
    for (const guild of c.guilds.cache.values()) {
      for (const canal of guild.channels.cache.values()) {
        if (canal.name?.includes('formulario-') && canal.topic?.includes('· evento:')) {
          await canal.delete('Formulario de evento interrumpido por un reinicio del bot').catch(() => {});
        }
      }
    }
  });

  client.on(Events.MessageCreate, async (m) => {
    const estado = formularios.get(m.channelId);
    if (!estado || m.author.id !== estado.userId || estado.paso !== 'nametag') return;
    const nametag = m.content.trim();
    if (!NAMETAG_VALIDO.test(nametag)) {
      const aviso = new EmbedBuilder()
        .setTitle('⚠️ Nametag no válido')
        .setDescription('El nametag debe tener **entre 3 y 16 caracteres** y solo puede contener **letras, números y guion bajo (_)**, sin espacios.\n\nEscríbelo de nuevo.')
        .setColor(COLOR.peligro);
      return m.reply({ embeds: [aviso] }).catch(() => {});
    }
    estado.nametag = nametag;
    reiniciarCaducidad(m.channel, estado);
    await m.react('✅').catch(() => {});
    await pasoCasillas(m.channel, estado);
  });

  client.on(Events.InteractionCreate, async (i) => {
    try {
      // Botones del mensaje público y del registro
      if (i.isButton() && i.customId.startsWith('ev:')) {
        const [, accion, eventoId, userId] = i.customId.split(':');
        if (accion === 'abrir') return await abrirFormulario(i, eventoId);
        if (accion === 'aceptar') return await aceptarUsuario(i, eventoId, userId);
        return;
      }

      // Interacciones dentro del canal privado
      if (!i.customId?.startsWith('evf:')) return;
      const estado = formularios.get(i.channelId);
      if (!estado) {
        return await i.reply({ content: '⌛ Este formulario ha caducado. Vuelve a pulsar el botón del evento para empezar de nuevo.', flags: MessageFlags.Ephemeral });
      }
      if (i.user.id !== estado.userId) {
        return await i.reply({ content: 'Este formulario no es tuyo.', flags: MessageFlags.Ephemeral });
      }
      reiniciarCaducidad(i.channel, estado);
      const accion = i.customId.slice(4);

      if (accion === 'cancelar' && estado.paso === 'bienvenida') {
        formularios.delete(i.channelId);
        clearTimeout(estado.timer);
        await i.reply('🗑️ Formulario cancelado. Este canal se eliminará en 5 segundos.');
        setTimeout(() => i.channel.delete('Formulario cancelado').catch(() => {}), 5000);
        return;
      }
      if (accion === 'comenzar' && estado.paso === 'bienvenida') {
        await i.update({ components: hecho('Formulario iniciado') });
        return await pasoNametag(i.channel, estado);
      }
      if (accion === 'casillas' && estado.paso === 'casillas') {
        try {
          return await i.showModal(modalCasillas());
        } catch (e) {
          console.warn('Casillas en formulario no disponibles, uso menú desplegable:', e.message);
          return await i.reply({ content: 'Marca lo que confirmes que posees o tienes conocimiento:', components: [selectorCasillas()] });
        }
      }
      if (accion === 'casillas-modal' && i.isModalSubmit() && estado.paso === 'casillas') {
        return await guardarCasillas(i, estado, i.fields.getCheckbox('microfono'), i.fields.getCheckbox('mods'));
      }
      if (accion === 'casillas-select' && i.isStringSelectMenu() && estado.paso === 'casillas') {
        const v = i.values.includes('ninguna') ? [] : i.values;
        return await guardarCasillas(i, estado, v.includes('microfono'), v.includes('mods'));
      }
      if (accion === 'normas' && estado.paso === 'normativa') {
        await i.update({ components: hecho('Normativa aceptada', '📜') });
        return await pasoPremios(i.channel, estado);
      }
      if (accion === 'premios' && estado.paso === 'premios') {
        await i.update({ components: hecho('Condiciones aceptadas', '🏆') });
        return await finalizar(i.channel, estado, i.user);
      }
      // Botón de un paso ya superado
      if (i.isRepliable() && !i.replied) await i.deferUpdate().catch(() => {});
    } catch (err) {
      console.error('Formulario evento:', err);
      const msg = '❌ Algo ha fallado. Avisa a un administrador.';
      if (i.deferred || i.replied) await i.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      else if (i.isRepliable()) await i.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}
