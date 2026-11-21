import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel, MessageFlags,
} from 'discord.js';
import { eventos as cfg } from '../config.js';
import { nivelDe, ts } from '../util.js';
import { mensajeFormulario } from './eventos.js';

const ZONA = 'Europe/Madrid';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const pendientes = new Map(); // id -> datos del evento esperando confirmación

// ─── Fechas en hora española ─────────────────────────────────────────────────
// Partes de una fecha vista en Madrid
function partesMadrid(ms) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const v = Object.fromEntries(f.map((p) => [p.type, Number(p.value)]));
  return { y: v.year, m: v.month, d: v.day, h: v.hour, min: v.minute };
}

// Fecha/hora de Madrid -> milisegundos UTC (tiene en cuenta horario de verano)
export function madridAUtc(y, m, d, h, min) {
  let utc = Date.UTC(y, m - 1, d, h, min);
  for (let k = 0; k < 2; k++) {
    const p = partesMadrid(utc);
    utc -= Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Date.UTC(y, m - 1, d, h, min);
  }
  return utc;
}

const dosCifras = (n) => String(n).padStart(2, '0');
const textoFecha = (y, m, d) => `${dosCifras(d)}/${dosCifras(m)}/${y}`;

// "Hoy", "Mañana", "Este domingo", "El próximo domingo" o "El domingo"
export function etiquetaDia(y, m, d, ahora = Date.now()) {
  const hoy = partesMadrid(ahora);
  const dif = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hoy.y, hoy.m - 1, hoy.d)) / 864e5);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Mañana';
  if (dif < 7) return `Este ${dia}`;
  if (dif < 14) return `El próximo ${dia}`;
  return `El ${dia}`;
}

function leerFecha(texto) {
  const m = texto.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [d, mes, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const prueba = new Date(Date.UTC(y, mes - 1, d));
  if (prueba.getUTCMonth() !== mes - 1 || prueba.getUTCDate() !== d) return null;
  return { y, m: mes, d };
}

function leerHora(texto) {
  const m = texto.trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*h?$/i);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2] ?? 0)];
  return h < 24 && min < 60 ? { h, min } : null;
}

// "1h-1h 30m" -> minutos del valor más alto (para la hora de fin del evento)
function minutosDuracion(texto) {
  const parte = texto.split(/-|–|a /).pop();
  const h = Number(parte.match(/(\d+(?:[.,]\d+)?)\s*h/i)?.[1]?.replace(',', '.') ?? 0);
  const min = Number(parte.match(/(\d+)\s*m/i)?.[1] ?? 0);
  const total = Math.round(h * 60 + min);
  return total >= 15 ? total : 120;
}

// ─── Mensaje del anuncio (igual que la plantilla) ───────────────────────────
export function textoAnuncio(d) {
  const premio = d.conPremio
    ? `> 💵 ${d.cantidad} 💵 *(si llegas a acceder al evento sin haber hecho el formulario, no podrás ganar el premio)*`
    : '> Este evento no tiene premio. ¡Se juega por la gloria! ⚔️';
  return [
    `# ${d.nombre}`,
    '',
    `> **🖊️Descripción🖊️**: ${d.descripcion.split('\n').join('\n> ')}`,
    '> ',
    '> **📋Características📋**:',
    `> Min/Max Jugadores: ${d.min}-${d.max} Jugadores`,
    `> Tiempo de evento (aprox): ${d.duracion}`,
    `> Fecha: ${d.etiqueta} (${d.fechaTexto})`,
    `> Hora: ${d.horaTexto} (Hora Española)`,
    '> ',
    '> **🏆PREMIO🏆**',
    premio,
  ].join('\n');
}

// ─── /crearevento ────────────────────────────────────────────────────────────
export async function crearEvento(i) {
  if (nivelDe(i.member) < cfg.nivelPublicar) {
    return i.reply({ content: `⛔ Necesitas nivel de autoridad ${cfg.nivelPublicar}.`, flags: MessageFlags.Ephemeral });
  }
  const o = i.options;
  const errores = [];

  const fecha = leerFecha(o.getString('fecha', true));
  const hora = leerHora(o.getString('hora', true));
  if (!fecha) errores.push('📅 La **fecha** debe tener el formato `DD/MM/AAAA` (por ejemplo `22/11/2026`).');
  if (!hora) errores.push('🕒 La **hora** debe tener el formato `HH:MM` (por ejemplo `18:00`).');

  const min = o.getInteger('jugadores_min', true);
  const max = o.getInteger('jugadores_max', true);
  if (min > max) errores.push('👥 El mínimo de jugadores no puede ser mayor que el máximo.');

  const conPremio = o.getString('premio', true) === 'si';
  const cantidad = o.getString('cantidad_premio')?.trim();
  if (conPremio && !cantidad) errores.push('🏆 Has elegido **Con premio**: rellena también `cantidad_premio` (por ejemplo `5$-15$`).');

  let inicio;
  if (fecha && hora) {
    inicio = madridAUtc(fecha.y, fecha.m, fecha.d, hora.h, hora.min);
    if (inicio < Date.now() + 60_000) errores.push('⏰ La fecha y hora tienen que ser en el **futuro**.');
  }
  if (errores.length) {
    return i.reply({ content: `**No he podido preparar el evento:**\n${errores.join('\n')}`, flags: MessageFlags.Ephemeral });
  }

  const portada = o.getAttachment('portada');
  if (portada && !portada.contentType?.startsWith('image/')) {
    return i.reply({ content: '🖼️ La portada tiene que ser una imagen (PNG, JPG o GIF).', flags: MessageFlags.Ephemeral });
  }

  const duracion = o.getString('duracion', true).trim();
  const datos = {
    nombre: o.getString('nombre', true).trim(),
    descripcion: o.getString('descripcion', true).trim(),
    min, max, duracion, conPremio, cantidad,
    inicio, fin: inicio + minutosDuracion(duracion) * 60_000,
    fechaTexto: textoFecha(fecha.y, fecha.m, fecha.d),
    horaTexto: `${dosCifras(hora.h)}:${dosCifras(hora.min)}`,
    etiqueta: etiquetaDia(fecha.y, fecha.m, fecha.d),
    portada: portada?.url ?? null,
    canalId: i.channelId,
    autorId: i.user.id,
  };
  pendientes.set(i.id, datos);
  setTimeout(() => pendientes.delete(i.id), 14 * 60_000);

  const resumen = new EmbedBuilder()
    .setTitle('👀 Vista previa del evento')
    .setDescription(`Arriba tienes **cómo quedará el anuncio**. Si está todo bien, pulsa **Publicar** y haré esto en ${i.channel ?? 'este canal'}:`)
    .addFields(
      { name: '1️⃣ Anuncio', value: '> El mensaje de arriba, tal cual.' },
      { name: '2️⃣ Evento de Discord', value: `> Se creará en **Eventos** del servidor para el ${ts(inicio)} (${ts(inicio, 'R')}), con fin aproximado a las ${ts(datos.fin, 't')}.` },
      { name: '3️⃣ Formulario', value: `> Justo debajo, mencionando a <@&${cfg.rolMencionarId}> en spoiler, con el botón del formulario de acceso.` },
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Esta vista previa caduca en 14 minutos' });
  if (datos.portada) resumen.setImage(datos.portada);

  return i.reply({
    content: textoAnuncio(datos),
    embeds: [resumen],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ce:publicar:${i.id}`).setLabel('Publicar').setEmoji('🚀').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ce:cancelar:${i.id}`).setLabel('Cancelar').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    )],
    allowedMentions: { parse: [] },
    flags: MessageFlags.Ephemeral,
  });
}

async function publicar(i, id) {
  const d = pendientes.get(id);
  if (!d) return i.update({ content: '⌛ Esta vista previa ha caducado. Vuelve a usar `/crearevento`.', embeds: [], components: [] });
  if (nivelDe(i.member) < cfg.nivelPublicar) return i.reply({ content: '⛔ Sin permiso.', flags: MessageFlags.Ephemeral });
  pendientes.delete(id);
  await i.update({ content: '⏳ Publicando el evento…', embeds: [], components: [] });

  try {
    const descripcionEvento = [
      d.descripcion,
      '',
      `👥 ${d.min}-${d.max} jugadores · ⏱️ ${d.duracion}`,
      d.conPremio ? `🏆 Premio: ${d.cantidad}` : '🏆 Sin premio',
      '📝 Inscripción obligatoria mediante el formulario del servidor.',
    ].join('\n').slice(0, 1000);

    const evento = await i.guild.scheduledEvents.create({
      name: d.nombre.slice(0, 100),
      description: descripcionEvento,
      scheduledStartTime: new Date(d.inicio),
      scheduledEndTime: new Date(d.fin),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: cfg.ubicacion },
      image: d.portada ?? undefined,
    });

    const canal = i.channel ?? await i.guild.channels.fetch(d.canalId);
    const anuncio = await canal.send({
      content: textoAnuncio(d),
      files: d.portada ? [d.portada] : [],
      allowedMentions: { parse: [] },
    });
    const formulario = mensajeFormulario(i.guild, evento, { compacto: true });
    await canal.send({
      content: `||<@&${cfg.rolMencionarId}>||`,
      ...formulario,
      allowedMentions: { roles: [cfg.rolMencionarId] },
    });

    await i.editReply({
      content: `✅ **${d.nombre}** publicado.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Ver anuncio').setEmoji('📣').setStyle(ButtonStyle.Link).setURL(anuncio.url),
        new ButtonBuilder().setLabel('Ver evento').setEmoji('📅').setStyle(ButtonStyle.Link).setURL(evento.url),
      )],
    });
  } catch (err) {
    console.error('/crearevento:', err);
    await i.editReply(`❌ No he podido publicar el evento.\n**Motivo:** \`${err.message}\``);
  }
}

// ─── Autocompletado de fecha y hora ──────────────────────────────────────────
export async function autocompletar(i) {
  const foco = i.options.getFocused(true);
  const texto = foco.value.trim().toLowerCase();
  let opciones = [];

  if (foco.name === 'fecha') {
    const hoy = partesMadrid(Date.now());
    for (let k = 0; k < 60 && opciones.length < 25; k++) {
      const f = new Date(Date.UTC(hoy.y, hoy.m - 1, hoy.d + k));
      const [y, m, d] = [f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()];
      const valor = textoFecha(y, m, d);
      const etiqueta = etiquetaDia(y, m, d);
      const dia = DIAS[f.getUTCDay()];
      const nombre = `${valor} · ${etiqueta}${etiqueta.includes(dia) ? '' : ` (${dia})`}`;
      if (!texto || nombre.toLowerCase().includes(texto)) opciones.push({ name: nombre, value: valor });
    }
    if (!opciones.length && leerFecha(texto)) opciones = [{ name: texto, value: texto }];
  }

  if (foco.name === 'hora') {
    const horas = [];
    for (let h = 10; h <= 23; h++) horas.push(`${dosCifras(h)}:00`, `${dosCifras(h)}:30`);
    opciones = horas.filter((h) => !texto || h.startsWith(texto) || h.replace(':', '').startsWith(texto))
      .slice(0, 25).map((h) => ({ name: `${h} (Hora Española)`, value: h }));
    if (!opciones.length && leerHora(texto)) opciones = [{ name: `${texto} (Hora Española)`, value: texto }];
  }

  await i.respond(opciones);
}

export function registrarCrearEvento(client) {
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton() || !i.customId.startsWith('ce:')) return;
    const [, accion, id] = i.customId.split(':');
    try {
      if (accion === 'publicar') return await publicar(i, id);
      if (accion === 'cancelar') {
        pendientes.delete(id);
        return await i.update({ content: '✖️ Creación del evento cancelada.', embeds: [], components: [] });
      }
    } catch (err) {
      console.error('/crearevento:', err);
    }
  });
}
