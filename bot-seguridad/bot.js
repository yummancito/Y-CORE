import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ChannelType,
} from 'discord.js';
import config from './config.json' with { type: 'json' };
import Logger from './utils/Logger.js';
import RateLimiter from './utils/RateLimiter.js';

const logger = new Logger('SecurityBot');

// ----------------------- SERVICIOS -----------------------

class AntiNuke {
  constructor(client) {
    this.client = client;
    this.cfg = config.antiNuke;
    this.channelLimiter = new RateLimiter(this.cfg.maxChannels, this.cfg.channelWindow);
    this.roleLimiter = new RateLimiter(this.cfg.maxRoles, this.cfg.roleWindow);
    this.banLimiter = new RateLimiter(this.cfg.maxBans, this.cfg.banWindow);
    this.webhookLimiter = new RateLimiter(this.cfg.maxWebhooks, this.cfg.webhookWindow);
    this.channelDeleteLimiter = new RateLimiter(3, 10000);
    this.roleDeleteLimiter = new RateLimiter(3, 10000);
    this.kickLimiter = new RateLimiter(5, 10000);
    this.emojiDeleteLimiter = new RateLimiter(3, 10000);
    this.punishedUsers = new Set();
  }

  _isAdmin(member) {
    return member?.permissions?.has(PermissionFlagsBits.Administrator);
  }

  _isOwner(member) {
    return member?.guild?.ownerId === member?.id;
  }

  async _neutralize(guild, member) {
    const adminRoles = member.roles.cache.filter(
      r => r.permissions.has(PermissionFlagsBits.Administrator) && r.id !== guild.roles.everyone.id
    );
    for (const role of adminRoles.values()) {
      try {
        await member.roles.remove(role, 'Anti-nuke: neutralizando admin');
        logger.warn(`Rol admin removido: ${role.name} de ${member.user.tag}`);
      } catch {}
    }
  }

  async _punish(guild, member, reason) {
    this.punishedUsers.add(member.id);
    try {
      await member.ban({ reason, deleteMessageDays: 1 });
      logger.info(`Auto-ban: ${member.user.tag} — ${reason}`);
    } catch {}
  }

  async _getAudit(guild, type) {
    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 1 });
      return logs.entries.first();
    } catch {
      return null;
    }
  }

  async _log(guild, title, desc, color) {
    const channel = guild.channels.cache.get(config.channels.log);
    if (!channel) return;
    try {
      await channel.send({
        embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()]
      });
    } catch {}
  }

  async handleChannelCreate(channel) {
    if (!this.cfg.protections.channelCreate || !channel.guild) return;
    const entry = await this._getAudit(channel.guild, 'ChannelCreate');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await channel.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    if (this.channelLimiter.hit(entry.executor.id)) {
      logger.warn(`Anti-nuke: ${entry.executor.tag} creo demasiados canales`);
      if (this._isAdmin(member)) await this._neutralize(channel.guild, member);
      await this._punish(channel.guild, member, 'Anti-nuke: creacion masiva de canales');
      try { await channel.delete('Anti-nuke'); } catch {}
      await this._log(channel.guild, 'Anti-Nuke', `Canal masivo de <@${entry.executor.id}> eliminado.`, config.colors.danger);
    }
  }

  async handleChannelDelete(channel) {
    if (!this.cfg.protections.channelDelete || !channel.guild) return;
    const entry = await this._getAudit(channel.guild, 'ChannelDelete');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await channel.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    if (this.channelDeleteLimiter.hit(entry.executor.id)) {
      logger.warn(`Anti-nuke: ${entry.executor.tag} borro demasiados canales`);
      if (this._isAdmin(member)) await this._neutralize(channel.guild, member);
      await this._punish(channel.guild, member, 'Anti-nuke: borrado masivo de canales');
      await this._log(channel.guild, 'Anti-Nuke', `Borrado masivo de canales por <@${entry.executor.id}>.`, config.colors.danger);
    }
  }

  async handleRoleCreate(role) {
    if (!this.cfg.protections.roleCreate || !role.guild) return;
    const entry = await this._getAudit(role.guild, 'RoleCreate');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await role.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    if (this.roleLimiter.hit(entry.executor.id)) {
      logger.warn(`Anti-nuke: ${entry.executor.tag} creo demasiados roles`);
      if (this._isAdmin(member)) await this._neutralize(role.guild, member);
      await this._punish(role.guild, member, 'Anti-nuke: creacion masiva de roles');
      try { await role.delete('Anti-nuke'); } catch {}
      await this._log(role.guild, 'Anti-Nuke', `Rol masivo de <@${entry.executor.id}> eliminado.`, config.colors.danger);
    }
  }

  async handleRoleDelete(role) {
    if (!this.cfg.protections.roleDelete || !role.guild) return;
    const entry = await this._getAudit(role.guild, 'RoleDelete');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await role.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    if (this.roleDeleteLimiter.hit(entry.executor.id)) {
      logger.warn(`Anti-nuke: ${entry.executor.tag} borro demasiados roles`);
      if (this._isAdmin(member)) await this._neutralize(role.guild, member);
      await this._punish(role.guild, member, 'Anti-nuke: borrado masivo de roles');
      await this._log(role.guild, 'Anti-Nuke', `Borrado masivo de roles por <@${entry.executor.id}>.`, config.colors.danger);
    }
  }

  async handleRoleUpdate(oldRole, newRole) {
    if (!this.cfg.protections.roleUpdate || !newRole.guild) return;
    const dangerous = PermissionFlagsBits.Administrator | PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageWebhooks;
    const gained = (oldRole.permissions.bitfield & dangerous) !== (newRole.permissions.bitfield & dangerous);
    if (!gained) return;

    const entry = await this._getAudit(newRole.guild, 'RoleUpdate');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await newRole.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    try {
      await newRole.setPermissions(oldRole.permissions, 'Anti-nuke: reviertiendo permisos peligrosos');
      logger.warn(`Anti-nuke: permisos peligrosos reviertidos en ${newRole.name}`);
      await this._log(newRole.guild, 'Anti-Nuke', `Permisos peligrosos reviertidos en <@&${newRole.id}> por <@${entry.executor.id}>.`, config.colors.warning);
      if (this._isAdmin(member)) await this._neutralize(newRole.guild, member);
    } catch {}
  }

  async handleGuildUpdate(oldGuild, newGuild) {
    if (!this.cfg.protections.guildUpdate) return;
    const entry = await this._getAudit(newGuild, 'GuildUpdate');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await newGuild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    const risky = oldGuild.name !== newGuild.name || oldGuild.icon !== newGuild.icon || oldGuild.vanityURLCode !== newGuild.vanityURLCode || oldGuild.verificationLevel !== newGuild.verificationLevel;
    if (!risky) return;

    try {
      await newGuild.setName(oldGuild.name, 'Anti-nuke: reviertiendo cambio');
      if (oldGuild.icon) await newGuild.setIcon(oldGuild.icon, 'Anti-nuke: reviertiendo icono');
    } catch {}

    if (this._isAdmin(member)) await this._neutralize(newGuild, member);
    await this._punish(newGuild, member, 'Anti-nuke: cambio peligroso del servidor');
    await this._log(newGuild, 'Anti-Nuke', `Cambio peligroso del servidor por <@${entry.executor.id}>.`, config.colors.danger);
  }

  async handleEmojiDelete(emoji) {
    if (!this.cfg.protections.emojiDelete || !emoji.guild) return;
    const entry = await this._getAudit(emoji.guild, 'EmojiDelete');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await emoji.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    if (this.emojiDeleteLimiter.hit(entry.executor.id)) {
      logger.warn(`Anti-nuke: ${entry.executor.tag} borro demasiados emojis`);
      if (this._isAdmin(member)) await this._neutralize(emoji.guild, member);
      await this._punish(emoji.guild, member, 'Anti-nuke: borrado masivo de emojis');
      await this._log(emoji.guild, 'Anti-Nuke', `Emojis borrados masivamente por <@${entry.executor.id}>.`, config.colors.danger);
    }
  }

  async handleWebhookCreate(channel) {
    if (!this.cfg.protections.webhookCreate || !channel.guild) return;
    const entry = await this._getAudit(channel.guild, 'WebhookCreate');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await channel.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    if (!this._isAdmin(member)) {
      try {
        const webhooks = await channel.fetchWebhooks();
        for (const wh of webhooks.values()) {
          if (wh.ownerId === entry.executor.id) await wh.delete('Anti-nuke: webhook no autorizado');
        }
      } catch {}
    }

    if (this.webhookLimiter.hit(entry.executor.id)) {
      logger.warn(`Anti-nuke: ${entry.executor.tag} creo demasiados webhooks`);
      if (this._isAdmin(member)) await this._neutralize(channel.guild, member);
      await this._punish(channel.guild, member, 'Anti-nuke: creacion masiva de webhooks');
      await this._log(channel.guild, 'Anti-Nuke', `Webhooks masivos de <@${entry.executor.id}> eliminados.`, config.colors.danger);
    }
  }

  async handleGuildBanAdd(ban) {
    if (!this.cfg.protections.massBan || !ban.guild) return;
    const entry = await this._getAudit(ban.guild, 'MemberBanAdd');
    if (!entry?.executor || entry.executor.bot) return;
    const member = await ban.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member || this._isOwner(member) || this.punishedUsers.has(member.id)) return;

    if (this.banLimiter.hit(entry.executor.id)) {
      logger.warn(`Anti-nuke: ${entry.executor.tag} baneo demasiados miembros`);
      if (this._isAdmin(member)) await this._neutralize(ban.guild, member);
      await this._punish(ban.guild, member, 'Anti-nuke: baneo masivo');
      await this._log(ban.guild, 'Anti-Nuke', `Baneo masivo por <@${entry.executor.id}>.`, config.colors.danger);
    }
  }

  async handleGuildMemberRemove(member) {
    if (!this.cfg.protections.memberKick || !member.guild) return;
    const entry = await this._getAudit(member.guild, 'MemberKick');
    if (!entry?.executor || entry.executor.bot) return;
    const executor = await member.guild.members.fetch(entry.executor.id).catch(() => null);
    if (!executor || this._isOwner(executor) || this.punishedUsers.has(executor.id)) return;

    if (this.kickLimiter.hit(entry.executor.id)) {
      logger.warn(`Anti-nuke: ${entry.executor.tag} expulso demasiados miembros`);
      if (this._isAdmin(executor)) await this._neutralize(member.guild, executor);
      await this._punish(member.guild, executor, 'Anti-nuke: expulsion masiva');
      await this._log(member.guild, 'Anti-Nuke', `Expulsiones masivas por <@${entry.executor.id}>.`, config.colors.danger);
    }
  }

  async handleGuildMemberAdd(member) {
    if (!this.cfg.protections.botAdd || !member.user.bot || !member.guild) return;
    logger.warn(`Bot no autorizado detectado: ${member.user.tag}`);
    try {
      await member.kick('Anti-nuke: bot no autorizado');
      await this._log(member.guild, 'Anti-Nuke', `Bot <@${member.user.id}> expulsado.`, config.colors.warning);
    } catch {}
  }
}

class AntiRaid {
  constructor() {
    this.trackers = new Map();
  }

  _get(guildId) {
    if (!this.trackers.has(guildId)) {
      this.trackers.set(guildId, { joins: [], recentJoiners: [], lockedDown: false });
    }
    return this.trackers.get(guildId);
  }

  trackJoin(member) {
    const cfg = config.antiRaid;
    const t = this._get(member.guild.id);
    const now = Date.now();
    t.joins.push(now);
    t.joins = t.joins.filter(ts => now - ts < cfg.joinWindow);
    t.recentJoiners.push({ id: member.id, tag: member.user.tag, time: now });
    t.recentJoiners = t.recentJoiners.filter(j => now - j.time < cfg.autoBanWindow);

    if (t.recentJoiners.length >= cfg.autoBanThreshold) {
      return { raid: true, autoBan: true, raiders: [...t.recentJoiners] };
    }
    return { raid: t.joins.length > cfg.maxJoins, autoBan: false };
  }

  async lockdown(guild) {
    const t = this._get(guild.id);
    if (t.lockedDown) return;
    t.lockedDown = true;
    logger.warn(`Lockdown activado en ${guild.name}`);

    const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    for (const channel of channels.values()) {
      try {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      } catch {}
    }

    setTimeout(() => this.unlock(guild), config.antiRaid.lockdownDuration);
  }

  async unlock(guild) {
    const t = this._get(guild.id);
    if (!t.lockedDown) return;
    t.lockedDown = false;
    logger.info(`Lockdown desactivado en ${guild.name}`);

    const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    for (const channel of channels.values()) {
      try {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      } catch {}
    }
  }
}

class AutoMod {
  constructor() {
    this.duplicates = new Map();
  }

  check(message) {
    if (!config.automod.enabled || message.author.bot || !message.guild) return null;
    const cfg = config.automod;
    const content = message.content || '';

    if (this._countMentions(message) > cfg.maxMentions) return { type: 'mass_mention', reason: `Demasiadas menciones (${cfg.maxMentions}+)` };
    if (this._countEmojis(content) > cfg.maxEmojis) return { type: 'mass_emoji', reason: `Demasiados emojis (${cfg.maxEmojis}+)` };
    if (this._isInviteLink(content)) return { type: 'invite_link', reason: 'Link de Discord no permitido' };
    if (this._hasBlockedFile(content)) return { type: 'malicious_file', reason: 'Archivo peligroso bloqueado' };
    if (this._isDuplicate(message, cfg)) return { type: 'spam', reason: 'Mensaje duplicado repetido' };
    if (this._isExcessiveCaps(content, cfg.maxCapsPercent)) return { type: 'excessive_caps', reason: 'Muchas mayusculas' };

    return null;
  }

  _countMentions(message) {
    return message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
  }

  _countEmojis(text) {
    const emojiRegex = /<(a?):(\w+):(\d+)>/g;
    const unicodeRegex = /[\u{1F300}-\u{1F9FF}]/gu;
    return (text.match(emojiRegex) || []).length + (text.match(unicodeRegex) || []).length;
  }

  _isInviteLink(text) {
    const regex = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-zA-Z0-9-]+/gi;
    const matches = text.match(regex) || [];
    return matches.some(link => !config.automod.allowedInvites.some(inv => link.includes(inv)));
  }

  _hasBlockedFile(text) {
    return config.automod.blockedExtensions.some(ext => text.toLowerCase().includes(ext));
  }

  _isDuplicate(message, cfg) {
    const key = `${message.author.id}:${message.guild.id}`;
    const now = Date.now();
    const history = this.duplicates.get(key) || [];
    const filtered = history.filter(ts => now - ts.ts < cfg.duplicateWindow && ts.content === message.content);
    filtered.push({ ts: now, content: message.content });
    this.duplicates.set(key, filtered);
    return filtered.length > cfg.maxDuplicates;
  }

  _isExcessiveCaps(text, threshold) {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 5) return false;
    const caps = letters.replace(/[^A-Z]/g, '').length;
    return (caps / letters.length) * 100 > threshold;
  }
}

// ----------------------- BOT -----------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [Partials.Channel],
});

const antiNuke = new AntiNuke(client);
const antiRaid = new AntiRaid();
const autoMod = new AutoMod();

const commands = [
  new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Bloquear todos los canales de texto')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Desbloquear todos los canales de texto')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('eliminarwebhooks')
    .setDescription('Eliminar webhooks del canal actual')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks),
  new SlashCommandBuilder()
    .setName('configurar')
    .setDescription('Ver configuracion de seguridad actual')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

async function deployCommands(guildId) {
  try {
    await client.application.commands.set(commands, guildId);
    logger.info(`Comandos desplegados en guild ${guildId}`);
  } catch (err) {
    logger.error(`Error desplegando comandos en ${guildId}:`, err.message);
  }
}

client.once(Events.ClientReady, async () => {
  logger.info(`Bot conectado: ${client.user.tag}`);
  for (const guildId of config.allowedGuilds) {
    await deployCommands(guildId);
  }
});

client.on(Events.GuildCreate, async guild => {
  if (!config.allowedGuilds.includes(guild.id)) {
    logger.warn(`Guild no permitido: ${guild.id} — saliendo`);
    try { await guild.leave(); } catch {}
    return;
  }
  await deployCommands(guild.id);
});

client.on(Events.ChannelCreate, c => antiNuke.handleChannelCreate(c));
client.on(Events.ChannelDelete, c => antiNuke.handleChannelDelete(c));
client.on(Events.RoleCreate, r => antiNuke.handleRoleCreate(r));
client.on(Events.RoleDelete, r => antiNuke.handleRoleDelete(r));
client.on(Events.RoleUpdate, (oldR, newR) => antiNuke.handleRoleUpdate(oldR, newR));
client.on(Events.GuildUpdate, (oldG, newG) => antiNuke.handleGuildUpdate(oldG, newG));
client.on(Events.GuildEmojiDelete, e => antiNuke.handleEmojiDelete(e));
client.on(Events.WebhooksUpdate, c => antiNuke.handleWebhookCreate(c));
client.on(Events.GuildBanAdd, b => antiNuke.handleGuildBanAdd(b));
client.on(Events.GuildMemberRemove, m => antiNuke.handleGuildMemberRemove(m));
client.on(Events.GuildMemberAdd, m => {
  antiNuke.handleGuildMemberAdd(m);
  handleRaidJoin(m);
});

async function handleRaidJoin(member) {
  const result = antiRaid.trackJoin(member);
  if (result.raid) {
    logger.warn(`Raid detectado en ${member.guild.name}`);
    await antiRaid.lockdown(member.guild);
    await sendLog(member.guild, 'Anti-Raid', `Raid detectado. Lockdown activado.`, config.colors.warning);

    if (result.autoBan) {
      for (const raider of result.raiders) {
        try {
          await member.guild.members.ban(raider.id, { reason: 'Anti-raid: ban automatico', deleteMessageDays: 1 });
          logger.info(`Raider baneado: ${raider.tag}`);
        } catch {}
      }
      await sendLog(member.guild, 'Anti-Raid', `${result.raiders.length} raiders baneados automaticamente.`, config.colors.danger);
    }
  }
}

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  const violation = autoMod.check(message);
  if (violation) {
    logger.warn(`Automod: ${message.author.tag} — ${violation.reason}`);
    try { await message.delete(); } catch {}
    try {
      await message.channel.send({
        content: `<@${message.author.id}>`,
        embeds: [new EmbedBuilder().setDescription(`**Automod:** ${violation.reason}`).setColor(config.colors.warning)]
      });
    } catch {}
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) return;

  const { commandName } = interaction;

  if (commandName === 'lockdown') {
    await antiRaid.lockdown(interaction.guild);
    await interaction.reply({ content: 'Lockdown activado.', ephemeral: true });
    await sendLog(interaction.guild, 'Lockdown', `Activado por <@${interaction.user.id}>.`, config.colors.warning);
    return;
  }

  if (commandName === 'unlock') {
    await antiRaid.unlock(interaction.guild);
    await interaction.reply({ content: 'Lockdown desactivado.', ephemeral: true });
    await sendLog(interaction.guild, 'Unlock', `Desactivado por <@${interaction.user.id}>.`, config.colors.success);
    return;
  }

  if (commandName === 'eliminarwebhooks') {
    try {
      const webhooks = await interaction.channel.fetchWebhooks();
      let deleted = 0;
      for (const wh of webhooks.values()) {
        await wh.delete('Comando /eliminarwebhooks').catch(() => {});
        deleted++;
      }
      await interaction.reply({ content: `Eliminados ${deleted} webhook(s).`, ephemeral: true });
      await sendLog(interaction.guild, 'Webhooks', `${deleted} webhook(s) eliminados por <@${interaction.user.id}> en <#${interaction.channel.id}>.`, config.colors.warning);
    } catch (err) {
      await interaction.reply({ content: 'Error al eliminar webhooks.', ephemeral: true });
    }
    return;
  }

  if (commandName === 'configurar') {
    const embed = new EmbedBuilder()
      .setTitle('Configuracion de seguridad')
      .setColor(config.colors.primary)
      .addFields(
        { name: 'Anti-Nuke', value: `Canales: ${config.antiNuke.maxChannels}/${config.antiNuke.channelWindow}ms\nRoles: ${config.antiNuke.maxRoles}/${config.antiNuke.roleWindow}ms\nBans: ${config.antiNuke.maxBans}/${config.antiNuke.banWindow}ms\nWebhooks: ${config.antiNuke.maxWebhooks}/${config.antiNuke.webhookWindow}ms`, inline: true },
        { name: 'Anti-Raid', value: `Joins: ${config.antiRaid.maxJoins}/${config.antiRaid.joinWindow}ms\nAuto-ban: ${config.antiRaid.autoBanThreshold}/${config.antiRaid.autoBanWindow}ms\nLockdown: ${config.antiRaid.lockdownDuration / 60000}min`, inline: true },
        { name: 'AutoMod', value: config.automod.enabled ? 'Activado' : 'Desactivado', inline: true }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

async function sendLog(guild, title, desc, color) {
  const channel = guild.channels.cache.get(config.channels.log);
  if (!channel) return;
  try {
    await channel.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()] });
  } catch {}
}

process.on('uncaughtException', err => logger.error('Uncaught Exception:', err.message));
process.on('unhandledRejection', err => logger.error('Unhandled Rejection:', err?.message || err));

client.login(config.token);
