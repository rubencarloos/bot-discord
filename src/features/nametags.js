// /micodigo (staff: código fijo para entrar al servidor) y /nametag (ver o liberar el dueño de un nametag)
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { verificacionMc as cfg } from '../config.js';
import { duenoDe, jugador, liberarDueno, registrarStaff, staffDe, staffDeUsuario } from '../datos.js';
import { anadirWhitelist, exarotonConfigurado } from '../exaroton.js';
import { nivelDe, ts } from '../util.js';

const NAMETAG_VALIDO = /^[A-Za-z0-9_]{3,16}$/;
const NIVEL_NAMETAG = 5;
const privado = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

export async function comandoMiCodigo(i) {
  if (nivelDe(i.member) < cfg.nivelMiCodigo) {
    return i.reply(privado(`⛔ Este comando es solo para el staff (nivel de autoridad ${cfg.nivelMiCodigo} o superior).`));
  }
  const previo = staffDeUsuario(i.user.id);
  const nametag = i.options.getString('nametag')?.trim() || previo?.nametag;
  const nuevo = i.options.getBoolean('nuevo') ?? false;
  if (!nametag) return i.reply(privado('ℹ️ La primera vez tienes que indicar tu nametag de Minecraft: `/micodigo nametag:TuNombre`.'));
  if (!NAMETAG_VALIDO.test(nametag)) return i.reply(privado('⚠️ El nametag debe tener entre 3 y 16 caracteres: letras, números y guion bajo, sin espacios.'));
  const dueno = duenoDe(nametag);
  if (dueno && dueno.userId !== i.user.id) {
    return i.reply(privado(`⛔ \`${nametag}\` está vinculado a <@${dueno.userId}>. Si es tuyo, pide a un nivel ${NIVEL_NAMETAG} que lo libere con \`/nametag liberar\`.`));
  }

  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const { staff, anterior } = registrarStaff(i.user.id, nametag, nuevo);
  let whitelist = '';
  if (exarotonConfigurado()) {
    whitelist = await anadirWhitelist(staff.nametag).then(() => '\n📃 Estás en la whitelist del servidor.').catch(() => '\n⚠️ No he podido añadirte a la whitelist (¿servidor apagado?). Pídeselo a un admin.');
  }

  const embed = new EmbedBuilder()
    .setTitle('🔐 Tu código de staff')
    .setColor(0x5865f2)
    .setDescription(`# \`${staff.codigo}\`\n**¡No compartas este código con nadie!**${whitelist}`)
    .addFields(
      { name: '⛏️ Nametag protegido', value: `\`${staff.nametag}\`${anterior ? ` (antes: \`${anterior}\`)` : ''}`, inline: true },
      { name: '🌐 Conexión verificada', value: staff.ip ? `Sí, desde ${ts(staff.verificadoEn, 'D')}` : 'Todavía no', inline: true },
      { name: '🎮 Cómo usarlo', value: `> La **primera vez** que entres al servidor escribe \`/verificacion ${staff.codigo}\`.\n> A partir de ahí tu nametag **solo podrá entrar desde tu conexión**, así nadie podrá hacerse pasar por ti ni usar tus permisos.` },
      { name: '⚠️ Importante', value: '> Si lo pones mal o no lo pones a tiempo, tu conexión quedará **bloqueada**.\n> Si te cambia la IP, otro miembro del staff puede pulsar **🔓 Permitir nueva IP** en el aviso de seguridad.\n> Usa `/micodigo nuevo:True` si crees que alguien conoce tu código.' },
    );
  const md = await i.user.send({ embeds: [embed] }).then(() => true).catch(() => false);
  return i.editReply({ content: md ? '📩 Te lo he enviado también por privado para que lo guardes.' : '', embeds: [embed] });
}

export async function comandoNametag(i) {
  if (nivelDe(i.member) < NIVEL_NAMETAG) {
    return i.reply(privado(`⛔ Solo el nivel de autoridad ${NIVEL_NAMETAG} puede usar este comando.`));
  }
  const nametag = i.options.getString('nametag', true).trim();
  if (i.options.getSubcommand() === 'liberar') {
    const habia = liberarDueno(nametag);
    if (!habia.dueno && !habia.staff) return i.reply(privado(`ℹ️ \`${nametag}\` no estaba vinculado a nadie.`));
    return i.reply(privado(`🔓 \`${nametag}\` liberado${habia.dueno ? ` (era de <@${habia.dueno.userId}>)` : ''}.${habia.staff ? ' Su código de staff ya no vale.' : ''}\nLa próxima cuenta que lo use y sea aceptada (o lo registre con /micodigo) pasará a ser su dueña.`));
  }

  const dueno = duenoDe(nametag);
  const staff = staffDe(nametag);
  const j = jugador(nametag);
  const protegido = (cfg.nametagsProtegidos ?? []).some((n) => n.toLowerCase() === nametag.toLowerCase());
  const embed = new EmbedBuilder()
    .setTitle(`⛏️ ${nametag}`)
    .setColor(0x5865f2)
    .addFields(
      { name: '👤 Dueño', value: dueno ? `<@${dueno.userId}> desde ${ts(dueno.desde, 'D')}` : '_Nadie_', inline: true },
      { name: '🛡️ Staff', value: staff ? '✅ Código de staff (/micodigo)' : protegido ? '🔒 Protegido en la configuración' : '—', inline: true },
      { name: '🎮 Eventos activos', value: Object.values(j?.eventos ?? {}).join(', ') || '—', inline: true },
      { name: '🌐 Conexión verificada', value: j?.ip ? `||${j.ip}|| ${ts(j.verificadoEn, 'R')}` : 'No', inline: true },
    );
  return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}
