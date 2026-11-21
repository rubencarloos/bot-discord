// Registro de asistencia: mientras dura un evento, mira cada minuto quién está conectado
// en el servidor de Minecraft (exaroton) y lo apunta una sola vez en el foro de asistencia
// (una publicación «Evento NOMBRE» por evento),
// junto con su usuario de Discord (sacado de las inscripciones aceptadas).
import {
  ChannelFlags, ChannelType, EmbedBuilder, Events, GuildScheduledEventStatus as Estado, ThreadAutoArchiveDuration,
} from 'discord.js';
import { eventos as cfg } from '../config.js';
import { exarotonConfigurado, infoServidor } from '../exaroton.js';
import { ts } from '../util.js';
import { leerAceptado, mensajesDelRegistro } from './whitelist.js';

const INTERVALO_MS = 60_000;
const CACHE_INSCRITOS_MS = 5 * 60_000;
const MAX_LINEAS_EMBED = 3900;
const COLOR = { vivo: 0x57f287, fin: 0x5865f2 };

const mensajes = new Map(); // eventoId -> mensaje de asistencia
let inscritos = { cuando: 0, porNametag: new Map() };
let trabajando = false;

// ─── Ventana del evento ──────────────────────────────────────────────────────
function enCurso(ev, ahora = Date.now()) {
  if (ev.status === Estado.Canceled || ev.status === Estado.Completed) return false;
  const inicio = ev.scheduledStartTimestamp;
  const fin = (ev.scheduledEndTimestamp ?? inicio + 3 * 3600_000) + cfg.margenFinMin * 60_000;
  return ev.status === Estado.Active || (ahora >= inicio && ahora <= fin);
}

// ─── Nametag -> usuario de Discord (inscripciones aceptadas) ────────────────
async function cargarInscritos(guild) {
  if (Date.now() - inscritos.cuando < CACHE_INSCRITOS_MS) return inscritos.porNametag;
  const reg = await guild.channels.fetch(cfg.registroId).catch(() => null);
  const mapa = new Map();
  if (reg) {
    for (const a of (await mensajesDelRegistro(reg)).map(leerAceptado).filter(Boolean)) {
      const clave = a.nametag.toLowerCase();
      const previo = mapa.get(clave);
      // Si hay varias, se guardan todos los eventos en los que fue aceptado
      mapa.set(clave, { usuarioId: a.usuarioId ?? previo?.usuarioId, eventos: new Set([...(previo?.eventos ?? []), a.eventoId]) });
    }
  }
  inscritos = { cuando: Date.now(), porNametag: mapa };
  return mapa;
}

// ─── Mensaje de asistencia (se reconstruye desde Discord, así no se pierde al reiniciar) ─
const pie = (ev) => `Asistencia · evento:${ev.id}`;

const esDelEvento = (m, ev) => m?.author.id === m?.client.user.id && m.embeds.some((e) => e.footer?.text === pie(ev));
const tituloPublicacion = (ev) => `Evento ${ev.name}`.slice(0, 100);

// Foro: una publicación "Evento NOMBRE" por evento. Canal de texto: un mensaje por evento.
async function buscarMensaje(canal, ev) {
  if (mensajes.has(ev.id)) return mensajes.get(ev.id);
  let m = null;
  if (canal.type === ChannelType.GuildForum) {
    const activos = await canal.threads.fetchActive();
    const archivados = await canal.threads.fetchArchived({ limit: 50 }).catch(() => ({ threads: new Map() }));
    const hilos = [...activos.threads.values(), ...archivados.threads.values()]
      .filter((h) => h.parentId === canal.id && h.name === tituloPublicacion(ev));
    for (const h of hilos) {
      const inicial = await h.fetchStarterMessage().catch(() => null);
      if (esDelEvento(inicial, ev)) { m = inicial; break; }
    }
  } else {
    const recientes = await canal.messages.fetch({ limit: 50 });
    m = recientes.find((x) => esDelEvento(x, ev)) ?? null;
  }
  if (m) mensajes.set(ev.id, m);
  return m;
}

async function crearMensaje(canal, ev, payload) {
  if (canal.type !== ChannelType.GuildForum) return canal.send(payload);
  const obligaEtiqueta = canal.flags?.has(ChannelFlags.RequireTag) && canal.availableTags.length > 0;
  const hilo = await canal.threads.create({
    name: tituloPublicacion(ev),
    message: payload,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    appliedTags: obligaEtiqueta ? [canal.availableTags[0].id] : [],
  });
  return hilo.fetchStarterMessage();
}

async function editarMensaje(m, payload) {
  if (m.channel?.isThread?.() && m.channel.archived) await m.channel.setArchived(false).catch(() => {});
  return m.edit(payload);
}

// Cada línea: "`12.` ✅ `Nametag` · <@id> · <t:..:t>"
function leerLineas(m) {
  return (m?.embeds ?? []).flatMap((e) => (e.description ?? '').split('\n')).filter((l) => /^`\d+\.`/.test(l));
}
const nametagDeLinea = (l) => l.match(/^`\d+\.` \S+ `([^`]+)`/)?.[1]?.toLowerCase();

function construir(ev, lineas, vivo) {
  const trozos = [[]];
  let largo = 0;
  for (const l of lineas) {
    if (largo + l.length + 1 > MAX_LINEAS_EMBED) { trozos.push([]); largo = 0; }
    trozos.at(-1).push(l);
    largo += l.length + 1;
  }
  const sinInscripcion = lineas.filter((l) => l.includes('⚠️')).length;
  const embeds = trozos.slice(0, 10).map((t, n) => {
    const e = new EmbedBuilder().setColor(vivo ? COLOR.vivo : COLOR.fin).setDescription(t.join('\n') || '_Todavía no se ha conectado nadie._');
    if (n === 0) {
      e.setAuthor({ name: `🎮 ${ev.name}` })
        .setTitle(vivo ? '🟢 Asistencia en directo' : '🏁 Asistencia final')
        .addFields(
          { name: '📅 Evento', value: `${ts(ev.scheduledStartTimestamp)}\n[Ver evento](${ev.url})`, inline: true },
          { name: '👥 Conectados', value: `**${lineas.length}** jugador(es)${sinInscripcion ? `\n⚠️ ${sinInscripcion} sin inscripción aceptada` : ''}`, inline: true },
        );
    }
    return e;
  });
  embeds.at(-1)
    .setFooter({ text: pie(ev) })
    .setTimestamp();
  embeds[0].addFields({ name: 'Leyenda', value: '✅ inscrito y aceptado en este evento · 🟡 aceptado en otro evento · ⚠️ sin inscripción aceptada' });
  return { embeds, allowedMentions: { parse: [] } };
}

// ─── Bucle principal ─────────────────────────────────────────────────────────
async function revisar(client) {
  if (trabajando || !exarotonConfigurado()) return;
  trabajando = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      const evs = await guild.scheduledEvents.fetch().catch(() => null);
      const activos = [...(evs?.values() ?? [])].filter((ev) => enCurso(ev));
      // Cerrar los que ya terminaron (pasar el mensaje a "Asistencia final")
      for (const [id, m] of mensajes) {
        const ev = evs?.get(id);
        if (ev && enCurso(ev)) continue;
        if (ev) await editarMensaje(m, construir(ev, leerLineas(m), false)).catch(() => {});
        mensajes.delete(id);
      }
      if (!activos.length) continue;

      const servidor = await infoServidor().catch((e) => { console.error('exaroton:', e.message); return null; });
      if (servidor?.status !== 1) continue; // 1 = encendido
      const conectados = servidor.players?.list ?? [];
      const canal = await guild.channels.fetch(cfg.asistenciaId).catch(() => null);
      if (!canal || !(canal.isTextBased() || canal.type === ChannelType.GuildForum)) { console.error('⚠️ No encuentro el canal de asistencia', cfg.asistenciaId); continue; }

      for (const ev of activos) {
        const existente = await buscarMensaje(canal, ev);
        const lineas = leerLineas(existente);
        const vistos = new Set(lineas.map(nametagDeLinea));
        const nuevos = [...new Set(conectados)].filter((n) => !vistos.has(n.toLowerCase()));
        if (!nuevos.length && existente) continue;

        const mapa = nuevos.length ? await cargarInscritos(guild) : new Map();
        for (const nametag of nuevos) {
          vistos.add(nametag.toLowerCase());
          const ins = mapa.get(nametag.toLowerCase());
          const icono = !ins ? '⚠️' : ins.eventos.has(ev.id) ? '✅' : '🟡';
          const discord = ins?.usuarioId ? `<@${ins.usuarioId}>` : '_Discord desconocido_';
          lineas.push(`\`${lineas.length + 1}.\` ${icono} \`${nametag}\` · ${discord} · ${ts(Date.now(), 't')}`);
        }
        const payload = construir(ev, lineas, true);
        if (existente) await editarMensaje(existente, payload);
        else mensajes.set(ev.id, await crearMensaje(canal, ev, payload));
      }
    }
  } catch (e) {
    console.error('Error en asistencia:', e);
  } finally {
    trabajando = false;
  }
}

export function registrarAsistencia(client) {
  client.once(Events.ClientReady, () => {
    revisar(client);
    setInterval(() => revisar(client), INTERVALO_MS);
  });
}

export const _test = { revisar, enCurso, leerLineas, nametagDeLinea };
