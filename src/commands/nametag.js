import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { comandoNametag } from '../features/nametags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nametag')
    .setDescription('Dueños de los nametags de Minecraft (nivel 5)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('info').setDescription('A quién pertenece un nametag')
      .addStringOption((o) => o.setName('nametag').setDescription('Nametag de Minecraft').setRequired(true)))
    .addSubcommand((s) => s.setName('liberar').setDescription('Quita el dueño de un nametag (y su código de staff, si lo tiene)')
      .addStringOption((o) => o.setName('nametag').setDescription('Nametag de Minecraft').setRequired(true))),
  execute: (interaction) => comandoNametag(interaction),
};
