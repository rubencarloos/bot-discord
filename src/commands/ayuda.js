import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('ayuda').setDescription('Muestra todos los comandos del bot'),
  async execute(interaction) {
    const lista = interaction.client.commands
      .map((c) => `**/${c.data.name}** — ${c.data.description}`)
      .join('\n');
    const embed = new EmbedBuilder().setTitle('📖 Comandos').setDescription(lista).setColor(0x5865f2);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
