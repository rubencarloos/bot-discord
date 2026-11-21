import { ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { eventos as cfg } from '../config.js';
import { exarotonConfigurado, verWhitelist } from '../exaroton.js';
import { nivelDe, ts } from '../util.js';

const COLOR = 0x57f287;
const DIAS_MAX = 30; // hilos del foro más antiguos que esto no se revisan

// Lee una inscripción aceptada del registro (o null si no lo es)
export function leerAceptado(m) {
  const e = m.embeds[0];
  if (!e?.footer?.text?.startsWith('Aceptado')) return null;
  const campo = (txt) => e.fields.find((f) => f.name.includes(txt))?.value ?? '';
  const estado = campo('Estado').match(/Aceptado por <@!?(\d+)> <t:(\d+):/);
  if (!estado) return null;
  const wl = campo('Whitelist');
  return {
    cuando: Number(estado[2]) * 1000,
    staffId: estado[1],
    usuarioId: campo('Usuario de Discord').match(/`(\d{15,})`/)?.[1],
    nametag: campo('Usuario Minecraft').match(/`([^`]+)`/)?.[1] ?? '?',
    evento: e.author?.name?.replace(/^🎮 /, '') ?? 'evento',
    wl: !wl ? '➖' : wl.startsWith('✅') ? '✅' : wl.startsWith('🚫') ? '🚫' : '❌',
    url: m.url,
    eventoId: e.footer.text.match(/evento:(\d+)/)?.[1],
  };
}

export async function mensajesDelRegistro(reg, desde = 0) {
  if (reg.type !== ChannelType.GuildForum) {
    const msgs = await reg.messages.fetch({ limit: 100 });
    return [...msgs.values()].filter((m) => (m.editedTimestamp ?? m.createdTimestamp) >= desde);
  }
  const limite = Date.now() - DIAS_MAX * 86400000;
  const activos = await reg.threads.fetchActive();
  const archivados = await reg.threads.fetchArchived({ limit: 100 }).catch(() => ({ threads: new Map() }));
  const hilos = [...activos.threads.values(), ...archivados.threads.values()]
    .filter((h) => h.parentId === reg.id && h.createdTimestamp >= limite);
  const msgs = [];
  for (let i = 0; i < hilos.length; i += 10) {
    const lote = await Promise.all(hilos.slice(i, i + 10).map((h) => h.fetchStarterMessage().catch(() => null)));
    msgs.push(...lote.filter(Boolean));
  }
  return msgs;
}

async function recientes(i) {
  const horas = i.options.getNumber('horas') ?? 1;
  const desde = Date.now() - horas * 3600000;
  const reg = await i.guild.channels.fetch(cfg.registroId).catch(() => null);
  if (!reg) return i.editReply('❌ No encuentro el canal de registro de eventos.');

  const lista = (await mensajesDelRegistro(reg, desde))
    .map(leerAceptado)
    .filter((a) => a && a.cuando >= desde)
    .sort((a, b) => b.cuando - a.cuando);

  const embed = new EmbedBuilder()
    .setTitle(horas === 1 ? '📃 Aceptados en la última hora' : `📃 Aceptados en las últimas ${horas} horas`)
    .setColor(COLOR)
    .setFooter({ text: `${lista.length} inscripción(es) · desde ${new Date(desde).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}` })
    .setTimestamp();

  if (!lista.length) {
    embed.setDescription('No se ha aceptado ninguna inscripción en ese tiempo.');
  } else {
    const lineas = [];
    let largo = 0;
    for (const a of lista) {
      const l = `${a.wl} **\`${a.nametag}\`** · ${a.usuarioId ? `<@${a.usuarioId}>` : '?'} · ${a.evento}\n> ${ts(a.cuando, 't')} (${ts(a.cuando, 'R')}) · por <@${a.staffId}> · [ver](${a.url})`;
      if (largo + l.length > 3800) { lineas.push(`… y ${lista.length - lineas.length} más`); break; }
      lineas.push(l);
      largo += l.length + 1;
    }
    embed.setDescription(lineas.join('\n'));
    embed.addFields({ name: 'Leyenda', value: '✅ en la whitelist · ❌ falló al añadir · 🚫 quitado · ➖ aceptado antes de conectar exaroton' });
  }
  return i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function ver(i) {
  if (!exarotonConfigurado()) return i.editReply('⚠️ La conexión con exaroton no está configurada.');
  const nombres = await verWhitelist().catch((e) => e);
  if (nombres instanceof Error) return i.editReply(`❌ No he podido leer la whitelist: ${nombres.message}`);
  const texto = nombres.length ? nombres.map((n) => `\`${n}\``).join(', ') : '_La whitelist está vacía._';
  return i.editReply({
    embeds: [new EmbedBuilder().setTitle(`📃 Whitelist del servidor (${nombres.length})`).setDescription(texto.slice(0, 4000)).setColor(COLOR)],
  });
}

export async function comandoWhitelist(i) {
  if (nivelDe(i.member) < cfg.nivelAceptar) {
    return i.reply({ content: `⛔ Solo el nivel de autoridad ${cfg.nivelAceptar} puede usar este comando.`, flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  return i.options.getSubcommand() === 'ver' ? ver(i) : recientes(i);
}
