import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('servidor').setDescription('Información del servidor'),
  async execute(interaction) {
    const g = interaction.guild;
    if (!g) return interaction.reply({ content: 'Este comando solo funciona en un servidor.', ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle(g.name)
      .setThumbnail(g.iconURL())
      .addFields(
        { name: 'Miembros', value: String(g.memberCount), inline: true },
        { name: 'Creado', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
      )
      .setColor(0x57f287);
    await interaction.reply({ embeds: [embed] });
  },
};
