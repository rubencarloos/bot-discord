import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { autocompletarEventos, publicarFormulario } from '../features/eventos.js';

export default {
  data: new SlashCommandBuilder()
    .setName('formulario')
    .setDescription('Publica en este canal el formulario de inscripción de un evento (nivel 5)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('evento').setDescription('ID del evento del servidor (elige de la lista)').setRequired(true).setAutocomplete(true)),
  execute: (interaction) => publicarFormulario(interaction, interaction.options.getString('evento', true).trim()),
  autocomplete: (interaction) => autocompletarEventos(interaction),
};
