import {
  ActionRowBuilder, CheckboxGroupBuilder, LabelBuilder, ModalBuilder, RadioGroupBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { niveles } from './config.js';

export const ts = (ms, f = 'F') => `<t:${Math.floor(ms / 1000)}:${f}>`;

// Convierte milisegundos en algo como "2 años y 3 meses"
export function duracion(ms) {
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

// Nivel de autoridad más alto del miembro (0 = ninguno). El dueño del servidor siempre puede todo.
export function nivelDe(member) {
  if (!member) return 0;
  if (member.guild.ownerId === member.id) return 99;
  let nivel = 0;
  for (const [n, ids] of Object.entries(niveles)) {
    if (ids.some((id) => member.roles.cache.has(id))) nivel = Math.max(nivel, Number(n));
  }
  return nivel;
}

// IDs de roles con nivel >= minimo que existen en el servidor
export function rolesDesdeNivel(guild, minimo) {
  return Object.entries(niveles)
    .filter(([n]) => Number(n) >= minimo)
    .flatMap(([, ids]) => ids)
    .filter((id) => guild.roles.cache.has(id));
}

const valorOpcion = (i) => `op${i}`;

// Formulario con casillas / opción única / texto (Discord admite máx. 5 preguntas)
function crearModalMixto(customId, titulo, preguntas) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(titulo.slice(0, 45));
  for (const p of preguntas.slice(0, 5)) {
    const label = new LabelBuilder().setLabel(p.texto.slice(0, 45));
    if (p.descripcion) label.setDescription(p.descripcion.slice(0, 100));
    const opciones = (p.opciones ?? []).map((texto, i) => ({ label: texto.slice(0, 100), value: valorOpcion(i) }));
    if (p.tipo === 'casillas') {
      label.setCheckboxGroupComponent(new CheckboxGroupBuilder()
        .setCustomId(p.id).setOptions(opciones).setMinValues(1).setMaxValues(opciones.length).setRequired(true));
    } else if (p.tipo === 'unica') {
      label.setRadioGroupComponent(new RadioGroupBuilder().setCustomId(p.id).setOptions(opciones).setRequired(true));
    } else {
      label.setTextInputComponent(new TextInputBuilder()
        .setCustomId(p.id)
        .setStyle(p.estilo === 'largo' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setMaxLength(p.max ?? 400)
        .setRequired(true));
    }
    modal.addLabelComponents(label);
  }
  return modal;
}

export function crearModal(customId, titulo, preguntas) {
  if (preguntas.some((p) => p.tipo === 'casillas' || p.tipo === 'unica')) return crearModalMixto(customId, titulo, preguntas);
  const modal = new ModalBuilder().setCustomId(customId).setTitle(titulo.slice(0, 45));
  for (const p of preguntas.slice(0, 5)) {
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

export function leerRespuestas(interaction, preguntas) {
  const textoDe = (p, valor) => p.opciones?.[Number(String(valor).slice(2))] ?? String(valor);
  return preguntas.slice(0, 5).map((p) => {
    let respuesta;
    if (p.tipo === 'casillas') respuesta = (interaction.fields.getCheckboxGroup(p.id) ?? []).map((v) => `• ${textoDe(p, v)}`).join('\n');
    else if (p.tipo === 'unica') respuesta = textoDe(p, interaction.fields.getRadioGroup(p.id) ?? '—');
    else respuesta = interaction.fields.getTextInputValue(p.id).trim();
    return { pregunta: p.texto, respuesta: respuesta || '—' };
  });
}

const idsDeBotones = (m) => m.components.flatMap((fila) => fila.components ?? []).map((c) => c.customId);

// Mantiene un mensaje fijo del bot en un canal: lo crea si no existe, lo actualiza si existe
// y borra los mensajes antiguos del bot que tengan botones obsoletos.
export async function asegurarMensaje(client, canalId, botonId, payload, obsoletos = []) {
  const canal = await client.channels.fetch(canalId).catch(() => null);
  if (!canal?.isTextBased()) return console.error('⚠️ No encuentro el canal', canalId);

  const recientes = await canal.messages.fetch({ limit: 50 });
  let existente = null;
  for (const m of recientes.values()) {
    if (m.author.id !== client.user.id) continue;
    const ids = idsDeBotones(m);
    if (ids.includes(botonId) && !existente) existente = m;
    else if (ids.some((id) => obsoletos.includes(id))) await m.delete().catch(() => {});
  }
  if (existente) await existente.edit(payload);
  else await canal.send(payload);
}
