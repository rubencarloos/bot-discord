import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { abrirCasoStaff } from '../features/casos.js';

export default {
  data: new SlashCommandBuilder()
    .setName('abrircaso')
    .setDescription('Abre un caso con uno o varios usuarios (nivel 2: mod)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('tipo').setDescription('Tipo de caso').setRequired(true).addChoices(
      { name: '🚨 Reporte', value: 'reporte' },
      { name: '🆘 Ayuda', value: 'ayuda' },
      { name: '📝 Postulación Estudio', value: 'postu' },
    ))
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario implicado').setRequired(true))
    .addUserOption((o) => o.setName('usuario2').setDescription('Otro usuario implicado (opcional)'))
    .addUserOption((o) => o.setName('usuario3').setDescription('Otro usuario implicado (opcional)'))
    .addUserOption((o) => o.setName('usuario4').setDescription('Otro usuario implicado (opcional)'))
    .addUserOption((o) => o.setName('usuario5').setDescription('Otro usuario implicado (opcional)'))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo del caso (opcional)').setMaxLength(1000)),
  execute: (interaction) => abrirCasoStaff(interaction),
};
