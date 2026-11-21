import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registrar as registrarVerificacion } from './features/verificacion.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Faltan variables: DISCORD_TOKEN y CLIENT_ID son obligatorias.');
  process.exit(1);
}

// Carga todos los comandos de src/commands (cada archivo = un comando)
const commands = new Collection();
const dir = path.join(import.meta.dirname, 'commands');
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.js'))) {
  const cmd = (await import(pathToFileURL(path.join(dir, file)))).default;
  commands.set(cmd.data.name, cmd);
}

// Registra los comandos slash en Discord al arrancar
const rest = new REST().setToken(DISCORD_TOKEN);
const body = commands.map((c) => c.data.toJSON());
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);
await rest.put(route, { body });
console.log(`Registrados ${body.length} comandos ${GUILD_ID ? 'en el servidor' : 'globales'}.`);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.commands = commands;
registrarVerificacion(client);

client.once(Events.ClientReady, (c) => console.log(`✅ Conectado como ${c.user.tag}`));

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: '❌ Ha ocurrido un error con este comando.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

client.login(DISCORD_TOKEN);
