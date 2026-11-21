import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { ejecutarCaso } from '../features/casos.js';

export default {
  data: new SlashCommandBuilder()
    .setName('caso')
    .setDescription('Gestión de casos de soporte (staff)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('cerrar').setDescription('Cierra el caso y lo guarda en el registro (nivel 2)')
      .addStringOption((o) => o.setName('motivo').setDescription('Motivo del cierre').setMaxLength(500)))
    .addSubcommand((s) => s.setName('unir').setDescription('Añade a un usuario al caso (nivel 2)')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario a añadir').setRequired(true)))
    .addSubcommand((s) => s.setName('expulsar').setDescription('Quita a un usuario del caso (nivel 2)')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario a quitar').setRequired(true)))
    .addSubcommand((s) => s.setName('reabrir').setDescription('Reabre un caso cerrado y vuelve a llamar a los implicados (nivel 3)')
      .addStringOption((o) => o.setName('caso').setDescription('Ej: caso-reporte-3 (no hace falta dentro de su publicación del registro)'))),
  execute: (interaction) => ejecutarCaso(interaction),
};
