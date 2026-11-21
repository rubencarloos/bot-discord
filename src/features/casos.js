import {
  AttachmentBuilder, ChannelFlags, ChannelType, EmbedBuilder, MessageFlags, OverwriteType, PermissionFlagsBits as P,
} from 'discord.js';
import { casos as cfg, tiposCaso } from '../config.js';
import { nivelDe, rolesDesdeNivel, ts } from '../util.js';

const PERMISOS_USUARIO = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
const NOMBRE_TIPO = { reporte: 'Reporte', ayuda: 'Ayuda', postu: 'Postulación Estudio' };
const zona = { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'medium' };

const esCanalCaso = (canal) => canal?.parentId === cfg.categoriaId && canal.name?.startsWith('caso-');

function leerTopic(canal) {
  const t = canal.topic ?? '';
  return { abiertoPor: t.match(/<@(\d+)>/)?.[1] ?? null, clave: t.match(/clave:([\w-]+)/)?.[1] ?? null };
}

export function buscarCasoAbierto(guild, userId, clave) {
  return guild.channels.cache.find((c) => esCanalCaso(c) && c.topic?.includes(`<@${userId}>`) && c.topic.includes(`clave:${clave}`));
}

// Siguiente número para caso-<tipo>-N mirando los casos abiertos y el registro de ese tipo
async function siguienteNumero(guild, tipo) {
  const re = new RegExp(`caso-${tipo}-(\\d+)`);
  let max = 0;
  const mirar = (txt) => {
    const m = txt?.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  };
  guild.channels.cache.forEach((c) => mirar(c.name));
  const reg = await guild.channels.fetch(cfg.registros[tipo]).catch(() => null);
  if (reg?.type === ChannelType.GuildForum) {
    (await reg.threads.fetchActive()).threads.forEach((t) => mirar(t.name));
    (await reg.threads.fetchArchived({ limit: 100 })).threads.forEach((t) => mirar(t.name));
  } else if (reg?.isTextBased()) {
    (await reg.messages.fetch({ limit: 100 })).forEach((m) => {
      mirar(m.content);
      m.embeds.forEach((e) => mirar(e.title));
    });
  }
  return max + 1;
}

async function crearCanal(guild, nombre, topic, usuarios, payload) {
  const categoria = await guild.channels.fetch(cfg.categoriaId).catch(() => null);
  if (categoria?.type !== ChannelType.GuildCategory) {
    throw new Error(`El ID de casos (${cfg.categoriaId}) no es una categoría`);
  }
  const staff = rolesDesdeNivel(guild, cfg.nivelVer);
  const miembros = [];
  for (const id of usuarios) {
    if (await guild.members.fetch(id).catch(() => null)) miembros.push(id);
  }
  const canal = await guild.channels.create({
    name: nombre,
    type: ChannelType.GuildText,
    parent: categoria.id,
    topic,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: guild.client.user.id, allow: [...PERMISOS_USUARIO, P.ManageChannels, P.ManageMessages] },
      ...staff.map((id) => ({ id, type: OverwriteType.Role, allow: PERMISOS_USUARIO })),
      ...miembros.map((id) => ({ id, type: OverwriteType.Member, allow: PERMISOS_USUARIO })),
    ],
  });
  await canal.send({
    content: [...miembros.map((id) => `<@${id}>`), ...staff.map((id) => `<@&${id}>`)].join(' '),
    allowedMentions: { users: miembros, roles: staff },
    ...payload,
  });
  return canal;
}

export async function crearCaso(guild, usuario, clave, respuestas) {
  const def = tiposCaso[clave];
  const nombre = `caso-${def.tipo}-${await siguienteNumero(guild, def.tipo)}`;
  const embed = new EmbedBuilder()
    .setTitle(`📂 ${nombre}`)
    .setDescription(`Caso de soporte sobre **${def.etiqueta}**, abierto por ${usuario}.\nUn administrador te atenderá lo antes posible.`)
    .addFields(respuestas.map((r) => ({ name: `❓ ${r.pregunta}`, value: r.respuesta.slice(0, 1024) || '—' })))
    .setColor(0x5865f2)
    .setFooter({ text: 'Staff: /caso cerrar · /caso unir · /caso expulsar' })
    .setTimestamp();
  return crearCanal(guild, nombre, `${def.etiqueta} · Abierto por <@${usuario.id}> · clave:${clave}`, [usuario.id], { embeds: [embed] });
}

async function todosLosMensajes(canal) {
  const todos = [];
  let antes;
  while (todos.length < 10000) {
    const lote = await canal.messages.fetch({ limit: 100, before: antes });
    if (lote.size === 0) break;
    todos.push(...lote.values());
    antes = lote.last().id;
  }
  return todos.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function transcripcion(canal, mensajes, cabecera) {
  const lineas = [...cabecera, '='.repeat(60), ''];
  for (const m of mensajes) {
    lineas.push(`[${new Date(m.createdTimestamp).toLocaleString('es-ES', zona)}] ${m.author.tag} (${m.author.id}):`);
    if (m.content) lineas.push(`  ${m.content.replace(/\n/g, '\n  ')}`);
    for (const e of m.embeds) {
      if (e.title) lineas.push(`  [embed] ${e.title}`);
      if (e.description) lineas.push(`  ${e.description.replace(/\n/g, '\n  ')}`);
      for (const f of e.fields) lineas.push(`  · ${f.name}: ${f.value.replace(/\n/g, ' ')}`);
    }
    for (const a of m.attachments.values()) lineas.push(`  [adjunto] ${a.name}: ${a.url}`);
    lineas.push('');
  }
  return lineas.join('\n');
}

async function publicarEnRegistro(guild, tipo, titulo, payload) {
  const reg = await guild.channels.fetch(cfg.registros[tipo]).catch(() => null);
  if (!reg) throw new Error(`No encuentro el canal de registro de ${tipo}`);
  if (reg.type === ChannelType.GuildForum) {
    const obligaEtiqueta = reg.flags?.has(ChannelFlags.RequireTag) && reg.availableTags.length > 0;
    const hilo = await reg.threads.create({
      name: titulo.slice(0, 100),
      message: payload,
      appliedTags: obligaEtiqueta ? [reg.availableTags[0].id] : [],
    });
    return hilo.url;
  }
  return (await reg.send(payload)).url;
}

async function cerrar(i) {
  const canal = i.channel;
  const motivo = i.options.getString('motivo') ?? 'Sin especificar';
  await i.deferReply();

  const { abiertoPor, clave } = leerTopic(canal);
  const def = tiposCaso[clave];
  const tipo = def?.tipo ?? canal.name.split('-')[1];
  const implicados = [...new Set([
    abiertoPor,
    ...canal.permissionOverwrites.cache
      .filter((o) => o.type === OverwriteType.Member && o.id !== i.client.user.id)
      .map((o) => o.id),
  ].filter(Boolean))];

  const mensajes = await todosLosMensajes(canal);
  const original = mensajes.find((m) => m.author.id === i.client.user.id && m.embeds.length)?.embeds[0];
  const ahora = Date.now();

  const resumen = new EmbedBuilder()
    .setTitle(canal.name)
    .setColor(0xed4245)
    .addFields(
      { name: 'Tipo', value: def?.etiqueta ?? NOMBRE_TIPO[tipo] ?? tipo, inline: true },
      { name: 'Abierto por', value: abiertoPor ? `<@${abiertoPor}>` : '—', inline: true },
      { name: 'Implicados', value: implicados.map((id) => `<@${id}>`).join(' ') || '—' },
      { name: 'Abierto', value: ts(canal.createdTimestamp), inline: true },
      { name: 'Cerrado', value: `${ts(ahora)} por ${i.user}`, inline: true },
      { name: 'Motivo del cierre', value: motivo.slice(0, 1024) },
      { name: 'Mensajes', value: String(mensajes.length), inline: true },
    )
    .setFooter({ text: `clave:${clave ?? 'desconocida'}` })
    .setTimestamp(ahora);

  const texto = transcripcion(canal, mensajes, [
    `Registro de ${canal.name}`,
    `Tipo: ${def?.etiqueta ?? tipo}`,
    `Abierto: ${new Date(canal.createdTimestamp).toLocaleString('es-ES', zona)}`,
    `Cerrado: ${new Date(ahora).toLocaleString('es-ES', zona)} por ${i.user.tag}`,
    `Motivo del cierre: ${motivo}`,
  ]);
  const archivo = new AttachmentBuilder(Buffer.from(texto, 'utf8'), { name: `${canal.name}.txt` });
  const nombreAutor = abiertoPor ? (await i.client.users.fetch(abiertoPor).catch(() => null))?.username : null;

  const url = await publicarEnRegistro(i.guild, tipo, `${canal.name}${nombreAutor ? ` · ${nombreAutor}` : ''}`, {
    embeds: original ? [resumen, EmbedBuilder.from(original)] : [resumen],
    files: [archivo],
    allowedMentions: { parse: [] },
  });

  await i.editReply(`🔒 Caso cerrado por ${i.user}. Registro guardado: ${url}\nEste canal se borrará en 5 segundos.`);
  setTimeout(() => canal.delete(`Caso cerrado por ${i.user.tag}`).catch(console.error), 5000);
}

// Busca la entrada del registro: dentro de su publicación del foro, o por nombre (caso-reporte-3)
async function buscarEntradaRegistro(i, nombre) {
  const regIds = Object.values(cfg.registros);
  if (!nombre && i.channel.isThread() && regIds.includes(i.channel.parentId)) {
    return i.channel.fetchStarterMessage();
  }
  if (!nombre) return null;
  for (const id of regIds) {
    const reg = await i.guild.channels.fetch(id).catch(() => null);
    if (reg?.type === ChannelType.GuildForum) {
      const hilos = [
        ...(await reg.threads.fetchActive()).threads.values(),
        ...(await reg.threads.fetchArchived({ limit: 100 })).threads.values(),
      ];
      const hilo = hilos.find((t) => t.parentId === reg.id && (t.name === nombre || t.name.startsWith(`${nombre} `)));
      if (hilo) return hilo.fetchStarterMessage();
    } else if (reg?.isTextBased()) {
      const m = (await reg.messages.fetch({ limit: 100 })).find((x) => x.embeds.some((e) => e.title === nombre));
      if (m) return m;
    }
  }
  return null;
}

async function reabrir(i) {
  await i.deferReply();
  const nombrePedido = i.options.getString('caso')?.trim().toLowerCase();
  const entrada = await buscarEntradaRegistro(i, nombrePedido);
  const resumen = entrada?.embeds.find((e) => e.footer?.text?.startsWith('clave:'));
  if (!resumen) {
    return i.editReply('No encuentro ese caso. Usa el comando dentro de su publicación del registro o indica el nombre, por ejemplo `/caso reabrir caso:caso-reporte-3`.');
  }
  const nombre = resumen.title;
  const abierto = i.guild.channels.cache.find((c) => esCanalCaso(c) && c.name === nombre);
  if (abierto) return i.editReply(`Ese caso ya está abierto: ${abierto}`);

  const clave = resumen.footer.text.slice('clave:'.length);
  const campo = (n) => resumen.fields.find((f) => f.name === n)?.value ?? '';
  const implicados = [...campo('Implicados').matchAll(/<@(\d+)>/g)].map((m) => m[1]);
  const abiertoPor = campo('Abierto por').match(/<@(\d+)>/)?.[1] ?? implicados[0];
  const etiqueta = tiposCaso[clave]?.etiqueta ?? campo('Tipo');
  const original = entrada.embeds.find((e) => e !== resumen);

  const aviso = new EmbedBuilder()
    .setTitle(`🔁 ${nombre} reabierto`)
    .setDescription(`Caso reabierto por ${i.user}. Se ha vuelto a llamar a todos los implicados.\nRegistro anterior: ${entrada.url}`)
    .setColor(0xfee75c)
    .setTimestamp();
  const canal = await crearCanal(
    i.guild, nombre, `${etiqueta} · Abierto por <@${abiertoPor}> · clave:${clave}`, implicados,
    { embeds: original ? [aviso, EmbedBuilder.from(original)] : [aviso] },
  );
  await i.editReply(`🔁 Caso reabierto: ${canal}`);
}

async function cambiarUsuario(i, unir) {
  const usuario = i.options.getUser('usuario', true);
  if (usuario.bot) return i.reply({ content: 'No puedes hacer eso con un bot.', flags: MessageFlags.Ephemeral });
  if (unir) {
    await i.channel.permissionOverwrites.edit(usuario.id, Object.fromEntries(
      ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'].map((p) => [p, true]),
    ));
    return i.reply(`➕ ${usuario} se ha unido al caso (añadido por ${i.user}).`);
  }
  await i.channel.permissionOverwrites.delete(usuario.id);
  return i.reply({ content: `➖ **${usuario.tag}** ha sido expulsado del caso por ${i.user}.`, allowedMentions: { parse: [] } });
}

export async function ejecutarCaso(i) {
  const sub = i.options.getSubcommand();
  const nivel = nivelDe(i.member);
  const necesario = sub === 'reabrir' ? cfg.nivelReabrir : cfg.nivelGestionar;
  if (nivel < necesario) {
    return i.reply({ content: `⛔ Necesitas nivel de autoridad ${necesario} o superior.`, flags: MessageFlags.Ephemeral });
  }
  if (sub !== 'reabrir' && !esCanalCaso(i.channel)) {
    return i.reply({ content: 'Este comando solo se puede usar dentro de un canal de caso.', flags: MessageFlags.Ephemeral });
  }
  if (sub === 'cerrar') return cerrar(i);
  if (sub === 'unir') return cambiarUsuario(i, true);
  if (sub === 'expulsar') return cambiarUsuario(i, false);
  if (sub === 'reabrir') return reabrir(i);
}
