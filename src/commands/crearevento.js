import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { autocompletar, crearEvento } from '../features/crearEvento.js';

export default {
  data: new SlashCommandBuilder()
    .setName('crearevento')
    .setDescription('Crea un evento: anuncio, evento de Discord y formulario de acceso (nivel 5)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('nombre').setDescription('Nombre del evento. Ej: Cárcel de Bloody').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('descripcion').setDescription('De qué trata brevemente').setRequired(true).setMaxLength(800))
    .addIntegerOption((o) => o.setName('jugadores_min').setDescription('Jugadores mínimos aproximados. Ej: 10').setRequired(true).setMinValue(1).setMaxValue(1000))
    .addIntegerOption((o) => o.setName('jugadores_max').setDescription('Jugadores máximos aproximados. Ej: 30').setRequired(true).setMinValue(1).setMaxValue(1000))
    .addStringOption((o) => o.setName('duracion').setDescription('Tiempo aproximado. Ej: 1h-1h 30m').setRequired(true).setMaxLength(50))
    .addStringOption((o) => o.setName('fecha').setDescription('Fecha DD/MM/AAAA (elige de la lista)').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('hora').setDescription('Hora española HH:MM (elige de la lista)').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('premio').setDescription('¿Tiene premio?').setRequired(true)
      .addChoices({ name: '🏆 Con premio', value: 'si' }, { name: '❌ Sin premio', value: 'no' }))
    .addStringOption((o) => o.setName('cantidad_premio').setDescription('Solo si hay premio. Ej: 5$-15$').setMaxLength(50))
    .addAttachmentOption((o) => o.setName('portada').setDescription('Imagen de portada (opcional)')),
  execute: (interaction) => crearEvento(interaction),
  autocomplete: (interaction) => autocompletar(interaction),
};
