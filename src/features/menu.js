import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, MessageFlags,
} from 'discord.js';
import { canales, tiposCaso } from '../config.js';
import { eventos, normas, servidor } from '../textos.js';
import { asegurarMensaje, crearModal, leerRespuestas } from '../util.js';
import { buscarCasoAbierto, crearCaso } from './casos.js';

// Todos los botones de este menú empiezan por "m:"
const MENUS = {
  info: {
    titulo: '📖 Información', texto: 'Elige qué quieres consultar:',
    botones: [['Reglas Comunidad', 'ver:reglas', '📜'], ['Servidor', 'ver:servidor', '🎬'], ['Eventos', 'ver:eventos', '🎮']],
  },
  soporte: {
    titulo: '🎫 Soporte', texto: '¿Qué necesitas?',
    botones: [['Reportar', 'nav:reportar', '🚨'], ['Ayuda', 'nav:ayuda', '🆘'], ['Postulación Estudio', 'conf:postulacion', '📝']],
  },
  reportar: {
    titulo: '🚨 Reportar', texto: '¿Qué quieres reportar?', volver: 'nav:soporte',
    botones: [['Usuario', 'nav:reportar-usuario', '👤'], ['Discord', 'conf:reporte-discord', '💬'], ['Evento', 'conf:reporte-evento', '🎮']],
  },
  'reportar-usuario': {
    titulo: '👤 Reportar usuario', texto: '¿Dónde ha ocurrido?', volver: 'nav:reportar',
    botones: [['Minecraft', 'conf:reporte-usuario-mc', '⛏️'], ['Discord', 'conf:reporte-usuario-dc', '💬']],
  },
  ayuda: {
    titulo: '🆘 Ayuda', texto: '¿Sobre qué necesitas ayuda?', volver: 'nav:soporte',
    botones: [['Evento', 'conf:ayuda-evento', '🎮'], ['Discord', 'conf:ayuda-discord', '💬'], ['General', 'conf:ayuda-general', '❓']],
  },
};

const PAGINAS = { reglas: normas, servidor, eventos };

const boton = (label, accion, emoji, estilo = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(`m:${accion}`).setLabel(label).setEmoji(emoji).setStyle(estilo);
const volver = (accion) => boton('Volver', accion, '⬅️');

function vistaMenu(clave) {
  const menu = MENUS[clave];
  const fila = new ActionRowBuilder().addComponents(menu.botones.map(([l, a, e]) => boton(l, a, e, ButtonStyle.Primary)));
  const filas = [fila];
  if (menu.volver) filas.push(new ActionRowBuilder().addComponents(volver(menu.volver)));
  return { content: '', embeds: [new EmbedBuilder().setTitle(menu.titulo).setDescription(menu.texto).setColor(0x5865f2)], components: filas };
}

function vistaPagina(clave) {
  const p = PAGINAS[clave];
  return {
    content: '',
    embeds: [new EmbedBuilder().setTitle(p.titulo).setDescription(p.texto).setColor(0x5865f2)],
    components: [new ActionRowBuilder().addComponents(volver('nav:info'))],
  };
}

function vistaConfirmar(clave) {
  const def = tiposCaso[clave];
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Confirmación')
    .setDescription(`Vas a abrir un caso de soporte sobre **${def.etiqueta}**. Esto notificará a los administradores.\n\n¿Estás seguro?`)
    .setColor(0xfee75c);
  return {
    content: '',
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(boton('Abrir caso', `abrir:${clave}`, '📂', ButtonStyle.Success), volver(def.volver))],
  };
}

function mensajePublico() {
  const embed = new EmbedBuilder()
    .setTitle('🧭 Información y Soporte — Tmb Studio')
    .setDescription('Pulsa un botón para consultar la información del servidor o para abrir un caso de soporte.\n\n📖 **Información:** normas, funcionamiento del servidor y de los eventos.\n🎫 **Soporte:** reportes, ayuda y postulaciones al estudio.')
    .setColor(0x5865f2);
  const fila = new ActionRowBuilder().addComponents(
    boton('Información', 'nav:info', '📖', ButtonStyle.Primary),
    boton('Soporte', 'nav:soporte', '🎫', ButtonStyle.Success),
  );
  return { embeds: [embed], components: [fila] };
}

// Si el clic viene del mensaje público, responde con un mensaje privado; si viene de uno privado, lo actualiza
const mostrar = (i, vista) =>
  i.message?.flags.has(MessageFlags.Ephemeral)
    ? i.update(vista)
    : i.reply({ ...vista, flags: MessageFlags.Ephemeral });

export function registrar(client) {
  client.once(Events.ClientReady, (c) =>
    asegurarMensaje(c, canales.infoSoporte, 'm:nav:info', mensajePublico())
      .catch((e) => console.error('Menú:', e)));

  client.on(Events.InteractionCreate, async (i) => {
    if (!(i.isButton() || i.isModalSubmit()) || !i.customId.startsWith('m:')) return;
    const [, accion, clave] = i.customId.split(':');
    try {
      if (i.isButton()) {
        if (accion === 'nav' && MENUS[clave]) return await mostrar(i, vistaMenu(clave));
        if (accion === 'ver' && PAGINAS[clave]) return await mostrar(i, vistaPagina(clave));
        if (accion === 'conf' && tiposCaso[clave]) return await mostrar(i, vistaConfirmar(clave));
        if (accion === 'abrir' && tiposCaso[clave]) {
          const abierto = buscarCasoAbierto(i.guild, i.user.id, clave);
          if (abierto) {
            return await i.reply({ content: `Ya tienes un caso abierto de este tipo: ${abierto}`, flags: MessageFlags.Ephemeral });
          }
          const def = tiposCaso[clave];
          return await i.showModal(crearModal(`m:modal:${clave}`, def.etiqueta, def.preguntas));
        }
      }
      if (i.isModalSubmit() && accion === 'modal' && tiposCaso[clave]) {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const canal = await crearCaso(i.guild, i.user, clave, leerRespuestas(i, tiposCaso[clave].preguntas));
        await i.editReply(`✅ Tu caso se ha abierto: ${canal}\nLos administradores ya han sido avisados.`);
      }
    } catch (err) {
      console.error('Menú:', err);
      const msg = '❌ Algo ha fallado. Avisa a un administrador.';
      if (i.deferred || i.replied) await i.editReply(msg).catch(() => {});
      else await i.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}
