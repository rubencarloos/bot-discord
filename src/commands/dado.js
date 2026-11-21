import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dado')
    .setDescription('Tira un dado')
    .addIntegerOption((o) => o.setName('caras').setDescription('Número de caras (por defecto 6)').setMinValue(2).setMaxValue(1000)),
  async execute(interaction) {
    const caras = interaction.options.getInteger('caras') ?? 6;
    const n = Math.floor(Math.random() * caras) + 1;
    await interaction.reply(`🎲 Has sacado un **${n}** (d${caras})`);
  },
};
