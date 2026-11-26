import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { comandoMiCodigo } from '../features/nametags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('micodigo')
    .setDescription('Staff: tu código para entrar al servidor de Minecraft y proteger tu nametag (nivel 1)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('nametag').setDescription('Tu nametag de Minecraft (obligatorio la primera vez o para cambiarlo)').setMinLength(3).setMaxLength(16))
    .addBooleanOption((o) => o.setName('nuevo').setDescription('Generar un código nuevo (tendrás que volver a verificarte)')),
  execute: (interaction) => comandoMiCodigo(interaction),
};
