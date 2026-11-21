import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { comandoWhitelist } from '../features/whitelist.js';

export default {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Whitelist del servidor de Minecraft (nivel 5)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('recientes').setDescription('Inscripciones de evento aceptadas en las últimas X horas')
      .addNumberOption((o) => o.setName('horas').setDescription('Cuántas horas hacia atrás (por defecto 1)').setMinValue(0.25).setMaxValue(720)))
    .addSubcommand((s) => s.setName('ver').setDescription('Muestra la whitelist actual del servidor (exaroton)')),
  execute: (interaction) => comandoWhitelist(interaction),
};
