import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { autocompletar } from '../features/eliminarFormularios.js';
import { comandoIp } from '../features/ip.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Crea un canal solo con los aceptados de un evento y publica la IP a la vez para todos (nivel 5)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('ip').setDescription('IP del servidor (por ejemplo: tmbstudio.exaroton.me)').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('evento').setDescription('Evento (elige de la lista)').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('hora').setDescription('Hora de hoy a la que sale la IP, en HH:MM (hora española). Ej: 18:30').setMinLength(4).setMaxLength(5))
    .addIntegerOption((o) => o.setName('cuenta_atras').setDescription('Si no pones hora: segundos hasta mostrar la IP (por defecto 10)').setMinValue(0).setMaxValue(120)),
  execute: (interaction) => comandoIp(interaction),
  autocomplete: (interaction) => autocompletar(interaction),
};
