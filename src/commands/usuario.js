import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('usuario')
    .setDescription('Información de un usuario')
    .addUserOption((o) => o.setName('quien').setDescription('Usuario (por defecto, tú)')),
  async execute(interaction) {
    const user = interaction.options.getUser('quien') ?? interaction.user;
    const embed = new EmbedBuilder()
      .setTitle(user.username)
      .setThumbnail(user.displayAvatarURL())
      .addFields({ name: 'Cuenta creada', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>` })
      .setColor(0xfee75c);
    await interaction.reply({ embeds: [embed] });
  },
};
