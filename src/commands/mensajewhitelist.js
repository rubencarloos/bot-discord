import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { autocompletar } from '../features/eliminarFormularios.js';
import { comandoMensajeWhitelist } from '../features/mensajeWhitelist.js';

const data = new SlashCommandBuilder()
  .setName('mensajewhitelist')
  .setDescription('Envía un mensaje privado (con archivos) a los jugadores de un evento (nivel 5)')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o.setName('evento').setDescription('Evento (elige de la lista)').setRequired(true).setAutocomplete(true))
  .addStringOption((o) => o.setName('destinatarios').setDescription('A quién enviarlo (por defecto: aceptados)').addChoices(
    { name: '✅ Solo los aceptados (whitelist)', value: 'aceptados' },
    { name: '📋 Todos los que rellenaron el formulario', value: 'todos' },
  ));
data.addBooleanOption((o) => o.setName('codigo').setDescription('Código de verificación: añade a cada jugador un recordatorio con su propio código'));
for (let n = 1; n <= 5; n++) data.addAttachmentOption((o) => o.setName(`archivo${n}`).setDescription('Archivo para adjuntar (opcional)'));

export default {
  data,
  execute: (interaction) => comandoMensajeWhitelist(interaction),
  autocomplete: (interaction) => autocompletar(interaction),
};
