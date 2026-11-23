import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { autocompletar, eliminarFormularios } from '../features/eliminarFormularios.js';

export default {
  data: new SlashCommandBuilder()
    .setName('eliminar')
    .setDescription('Eliminar datos (nivel 5)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('formularios')
      .setDescription('Borra los formularios de un evento, su whitelist y sus códigos de verificación')
      .addStringOption((o) => o.setName('evento').setDescription('Evento (elige de la lista)').setRequired(true).setAutocomplete(true))),
  execute: (interaction) => eliminarFormularios(interaction),
  autocomplete: (interaction) => autocompletar(interaction),
};
