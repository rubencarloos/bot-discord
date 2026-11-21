import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, MessageFlags,
} from 'discord.js';
import { canales, tiposCaso } from '../config.js';
import { eventos, normas, servidor } from '../textos.js';
import { asegurarMensaje, crearModal, leerRespuestas } from '../util.js';
import { buscarCasoAbierto, crearCaso } from './casos.js';

const CADUCIDAD_MIN = 3; // el menú privado se borra solo tras estos minutos sin usarlo
const PIE = `Tmb Studio · Centro de ayuda · Este menú se cierra solo tras ${CADUCIDAD_MIN} min sin usarlo`;

const COLOR = {
  inicio: 0x2b2d31, info: 0x5865f2, soporte: 0x57f287, reportar: 0xed4245,
  ayuda: 0xf0a020, postu: 0x9b59b6, aviso: 0xfee75c, ok: 0x57f287,
};

// ─── Menús (todos los botones empiezan por "m:") ──────────────────────────────
const MENUS = {
  inicio: {
    ruta: ['Inicio'], color: COLOR.inicio,
    titulo: '🧭 Centro de Información y Soporte',
    texto: 'Bienvenido al centro de ayuda de **Tmb Studio**. Desde aquí puedes consultar todo lo que necesitas saber del servidor o contactar con el equipo de administración.\n\nElige una sección para continuar:',
    opciones: [
      { label: 'Información', accion: 'nav:info', emoji: '📖', desc: 'Normas de la comunidad, cómo funciona el servidor y cómo son nuestros eventos.' },
      { label: 'Soporte', accion: 'nav:soporte', emoji: '🎫', desc: 'Reporta un problema, pide ayuda al staff o postúlate para formar parte del estudio.' },
    ],
  },
  info: {
    ruta: ['Inicio', 'Información'], color: COLOR.info, volver: 'nav:inicio',
    titulo: '📖 Información',
    texto: 'Aquí tienes toda la información oficial de **Tmb Studio**. Te recomendamos leerla entera antes de participar en cualquier evento.',
    opciones: [
      { label: 'Reglas Comunidad', accion: 'ver:reglas', emoji: '📜', desc: 'La normativa oficial. Incumplirla puede suponer una sanción o expulsión.' },
      { label: 'Servidor', accion: 'ver:servidor', emoji: '🎬', desc: 'Qué es Tmb Studio y para qué sirve cada canal del servidor.' },
      { label: 'Eventos', accion: 'ver:eventos', emoji: '🎮', desc: 'Cómo se organizan los eventos, cómo se selecciona a los participantes y los premios.' },
    ],
  },
  soporte: {
    ruta: ['Inicio', 'Soporte'], color: COLOR.soporte, volver: 'nav:inicio',
    titulo: '🎫 Soporte',
    texto: 'Abre un **caso privado** con el equipo de administración. Solo tú y el staff podréis verlo.\n\n¿Qué necesitas?',
    opciones: [
      { label: 'Reportar', accion: 'nav:reportar', emoji: '🚨', desc: 'Denuncia a un usuario, un problema en Discord o algo que haya pasado en un evento.' },
      { label: 'Ayuda', accion: 'nav:ayuda', emoji: '🆘', desc: 'Resuelve dudas sobre eventos, sobre el servidor de Discord o cualquier otra cosa.' },
      { label: 'Postulación Estudio', accion: 'conf:postulacion', emoji: '📝', desc: '¿Quieres formar parte del equipo de Tmb Studio? Envía tu postulación.' },
    ],
  },
  reportar: {
    ruta: ['Inicio', 'Soporte', 'Reportar'], color: COLOR.reportar, volver: 'nav:soporte',
    titulo: '🚨 Reportar',
    texto: 'Los reportes son **confidenciales**: la persona reportada no sabrá quién la ha reportado.\n\n¿Qué quieres reportar?',
    opciones: [
      { label: 'Usuario', accion: 'nav:reportar-usuario', emoji: '👤', desc: 'Un jugador o miembro que haya incumplido las normas.' },
      { label: 'Discord', accion: 'conf:reporte-discord', emoji: '💬', desc: 'Un problema en el servidor: canales, bots, spam, enlaces sospechosos…' },
      { label: 'Evento', accion: 'conf:reporte-evento', emoji: '🎮', desc: 'Algo que haya ocurrido durante un evento: trampas, bugs, comportamiento…' },
    ],
  },
  'reportar-usuario': {
    ruta: ['Inicio', 'Soporte', 'Reportar', 'Usuario'], color: COLOR.reportar, volver: 'nav:reportar',
    titulo: '👤 Reportar usuario',
    texto: 'Indica dónde ha ocurrido. Si tienes **pruebas** (capturas o vídeos), podrás enviarlas dentro del caso.',
    opciones: [
      { label: 'Minecraft', accion: 'conf:reporte-usuario-mc', emoji: '⛏️', desc: 'Dentro del servidor de Minecraft o durante una partida.' },
      { label: 'Discord', accion: 'conf:reporte-usuario-dc', emoji: '💬', desc: 'En canales, canales de voz o mensajes directos.' },
    ],
  },
  ayuda: {
    ruta: ['Inicio', 'Soporte', 'Ayuda'], color: COLOR.ayuda, volver: 'nav:soporte',
    titulo: '🆘 Ayuda',
    texto: 'Antes de abrir un caso, revisa la sección de **📖 Información**: puede que tu duda ya esté resuelta.\n\n¿Sobre qué necesitas ayuda?',
    opciones: [
      { label: 'Evento', accion: 'conf:ayuda-evento', emoji: '🎮', desc: 'Inscripciones, lista blanca, horarios, requisitos o premios.' },
      { label: 'Discord', accion: 'conf:ayuda-discord', emoji: '💬', desc: 'Roles, permisos, canales o cualquier problema con el servidor.' },
      { label: 'General', accion: 'conf:ayuda-general', emoji: '❓', desc: 'Cualquier otra consulta para el equipo de Tmb Studio.' },
    ],
  },
};

const PAGINAS = {
  reglas: { ...normas, ruta: ['Inicio', 'Información', 'Reglas'], emoji: '📜' },
  servidor: { ...servidor, ruta: ['Inicio', 'Información', 'Servidor'], emoji: '🎬' },
  eventos: { ...eventos, ruta: ['Inicio', 'Información', 'Eventos'], emoji: '🎮' },
};

// ─── Piezas de las vistas ─────────────────────────────────────────────────────
const boton = (label, accion, emoji, estilo = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(`m:${accion}`).setLabel(label).setEmoji(emoji).setStyle(estilo);

// Fila de navegación: Volver · Inicio · Cerrar menú
function filaNavegacion(volver) {
  const botones = [];
  if (volver) botones.push(boton('Volver', volver, '⬅️'));
  if (volver && volver !== 'nav:inicio') botones.push(boton('Inicio', 'nav:inicio', '🏠'));
  botones.push(boton('Cerrar menú', 'cerrar', '✖️', ButtonStyle.Danger));
  return new ActionRowBuilder().addComponents(botones);
}

function embedBase(guild, ruta, color) {
  return new EmbedBuilder()
    .setAuthor({ name: ruta.join('  ›  '), iconURL: guild?.iconURL() ?? undefined })
    .setColor(color)
    .setFooter({ text: PIE });
}

function vistaMenu(guild, clave) {
  const m = MENUS[clave];
  const embed = embedBase(guild, m.ruta, m.color)
    .setTitle(m.titulo)
    .setDescription(m.texto)
    .addFields(m.opciones.map((o) => ({ name: `${o.emoji}  ${o.label}`, value: `> ${o.desc}` })));
  if (guild?.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
  const opciones = new ActionRowBuilder().addComponents(
    m.opciones.map((o) => boton(o.label, o.accion, o.emoji, ButtonStyle.Primary)),
  );
  return { content: '', embeds: [embed], components: [opciones, filaNavegacion(m.volver)] };
}

function vistaPagina(guild, clave) {
  const p = PAGINAS[clave];
  const embed = embedBase(guild, p.ruta, COLOR.info).setTitle(p.titulo).setDescription(p.texto);
  return { content: '', embeds: [embed], components: [filaNavegacion('nav:info')] };
}

function vistaConfirmar(guild, clave) {
  const def = tiposCaso[clave];
  const color = { reporte: COLOR.reportar, ayuda: COLOR.ayuda, postu: COLOR.postu }[def.tipo];
  const embed = embedBase(guild, ['Inicio', 'Soporte', def.etiqueta], color)
    .setTitle('⚠️ Confirmar apertura de caso')
    .setDescription(`Vas a abrir un caso de soporte sobre **${def.etiqueta}**. Esto notificará a los administradores.\n\n**¿Estás seguro?**`)
    .addFields(
      { name: '📋 Qué pasará', value: `> Se abrirá un formulario con ${def.preguntas.length === 1 ? '1 pregunta' : `${def.preguntas.length} preguntas`}.\n> Después se creará un **canal privado** solo para ti y el staff.` },
      { name: '💡 Consejo', value: '> Sé claro y concreto. Si tienes capturas o vídeos, podrás enviarlos dentro del caso.' },
      { name: '⛔ Importante', value: '> Abrir casos falsos o de broma puede ser sancionado.' },
    );
  const acciones = new ActionRowBuilder().addComponents(boton('Abrir caso', `abrir:${clave}`, '📂', ButtonStyle.Success));
  return { content: '', embeds: [embed], components: [acciones, filaNavegacion(def.volver)] };
}

function vistaCaso(guild, canal, titulo, texto, color) {
  const embed = embedBase(guild, ['Inicio', 'Soporte'], color).setTitle(titulo).setDescription(texto);
  const fila = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Ir al caso').setEmoji('📂').setStyle(ButtonStyle.Link).setURL(canal.url),
    boton('Inicio', 'nav:inicio', '🏠'),
    boton('Cerrar menú', 'cerrar', '✖️', ButtonStyle.Danger),
  );
  return { content: '', embeds: [embed], components: [fila] };
}

function mensajePublico(guild) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Tmb Studio', iconURL: guild?.iconURL() ?? undefined })
    .setTitle('🧭 Centro de Información y Soporte')
    .setDescription('¿Tienes dudas, quieres conocer las normas o necesitas hablar con el equipo? Pulsa uno de los botones de abajo.\n\nEl menú que se abre **solo lo ves tú** y se cierra solo si no lo usas.')
    .addFields(
      { name: '📖  Información', value: '> 📜 Reglas de la comunidad\n> 🎬 Cómo funciona el servidor\n> 🎮 Cómo son los eventos', inline: true },
      { name: '🎫  Soporte', value: '> 🚨 Reportar\n> 🆘 Pedir ayuda\n> 📝 Postulación al estudio', inline: true },
    )
    .setColor(COLOR.info)
    .setFooter({ text: 'Tmb Studio · Centro de ayuda' });
  if (guild?.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
  const fila = new ActionRowBuilder().addComponents(
    boton('Información', 'nav:info', '📖', ButtonStyle.Primary),
    boton('Soporte', 'nav:soporte', '🎫', ButtonStyle.Success),
  );
  return { embeds: [embed], components: [fila] };
}

// ─── Menús privados abiertos: uno por usuario, se borran solos ────────────────
const sesiones = new Map(); // userId -> { i, timer }

function recordar(i) {
  clearTimeout(sesiones.get(i.user.id)?.timer);
  const timer = setTimeout(() => cerrarSesion(i.user.id), CADUCIDAD_MIN * 60_000);
  sesiones.set(i.user.id, { i, timer });
}

async function cerrarSesion(userId) {
  const s = sesiones.get(userId);
  if (!s) return;
  clearTimeout(s.timer);
  sesiones.delete(userId);
  await s.i.deleteReply().catch(() => {});
}

const esPrivado = (i) => i.message?.flags.has(MessageFlags.Ephemeral);

// Desde el mensaje público abre un menú privado nuevo (y borra el anterior); desde uno privado lo actualiza
async function mostrar(i, vista) {
  if (esPrivado(i)) await i.update(vista);
  else {
    await cerrarSesion(i.user.id);
    await i.reply({ ...vista, flags: MessageFlags.Ephemeral });
  }
  recordar(i);
}

export function registrar(client) {
  client.once(Events.ClientReady, async (c) => {
    const canal = await c.channels.fetch(canales.infoSoporte).catch(() => null);
    await asegurarMensaje(c, canales.infoSoporte, 'm:nav:info', mensajePublico(canal?.guild))
      .catch((e) => console.error('Menú:', e));
  });

  client.on(Events.InteractionCreate, async (i) => {
    if (!(i.isButton() || i.isModalSubmit()) || !i.customId.startsWith('m:')) return;
    const [, accion, clave] = i.customId.split(':');
    try {
      if (i.isButton()) {
        if (accion === 'cerrar') {
          sesiones.delete(i.user.id);
          await i.deferUpdate();
          return await i.deleteReply().catch(() => i.editReply({ content: 'Menú cerrado.', embeds: [], components: [] }));
        }
        if (accion === 'nav' && MENUS[clave]) return await mostrar(i, vistaMenu(i.guild, clave));
        if (accion === 'ver' && PAGINAS[clave]) return await mostrar(i, vistaPagina(i.guild, clave));
        if (accion === 'conf' && tiposCaso[clave]) return await mostrar(i, vistaConfirmar(i.guild, clave));
        if (accion === 'abrir' && tiposCaso[clave]) {
          const abierto = buscarCasoAbierto(i.guild, i.user.id, clave);
          if (abierto) {
            return await mostrar(i, vistaCaso(i.guild, abierto, '📂 Ya tienes un caso abierto',
              `Ya tienes un caso abierto sobre **${tiposCaso[clave].etiqueta}**: ${abierto}\n\nContinúa allí. Cuando el staff lo cierre podrás abrir otro.`, COLOR.aviso));
          }
          const def = tiposCaso[clave];
          return await i.showModal(crearModal(`m:modal:${clave}`, def.etiqueta, def.preguntas));
        }
      }

      if (i.isModalSubmit() && accion === 'modal' && tiposCaso[clave]) {
        const desdeMenu = i.isFromMessage();
        if (desdeMenu) await i.deferUpdate();
        else await i.deferReply({ flags: MessageFlags.Ephemeral });
        const canal = await crearCaso(i.guild, i.user, clave, leerRespuestas(i, tiposCaso[clave].preguntas));
        await i.editReply(vistaCaso(i.guild, canal, '✅ Caso abierto',
          `Tu caso sobre **${tiposCaso[clave].etiqueta}** se ha abierto en ${canal}.\n\nLos administradores ya han sido avisados y te responderán allí lo antes posible.`, COLOR.ok));
        recordar(i);
      }
    } catch (err) {
      console.error('Menú:', err);
      const msg = '❌ Algo ha fallado. Avisa a un administrador.';
      if (i.deferred || i.replied) await i.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      else await i.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}
