import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, ChannelType, PermissionFlagsBits, Events } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

// ============================================
// BOT DE TICKETS - Configuracion facil
// ============================================
// INSTRUCCIONES:
// 1. Crea un bot en https://discord.com/developers/applications
// 2. Activa los intents: Server Members y Message Content
// 3. Copia el token y pegalo en la variable TOKEN abajo
// 4. Configura config.json con tu categoria y canal de logs
// 5. Ejecuta: npm install && npm start
// ============================================

// --- TOKEN: Pon tu token aqui (NO lo compartas con nadie) ---
const TOKEN = process.env.TOKEN || 'PON-TU-TOKEN-AQUI';

// --- Keep-alive: evita que el servicio gratuito se duerma ---
const PORT = process.env.PORT || 3000;
const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000; // 5 minutos

// --- Carga la configuracion ---
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, 'config.json');

function loadConfig() {
  if (!existsSync(configPath)) {
    console.error('[ERROR] No se encontro config.json. Copia config.example.json a config.json y configura-lo.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

let config = loadConfig();

// --- Mapa de colores de Discord.js ---
const COLOR_MAP = {
  'Primary': ButtonStyle.Primary,
  'Secondary': ButtonStyle.Secondary,
  'Success': ButtonStyle.Success,
  'Danger': ButtonStyle.Danger,
};

// --- Rate limiting: max 3 tickets por usuario cada 10 minutos ---
const ticketCooldown = new Map();

function checkCooldown(userId) {
  const now = Date.now();
  if (!ticketCooldown.has(userId)) {
    ticketCooldown.set(userId, []);
  }
  const timestamps = ticketCooldown.get(userId).filter(t => now - t < 600000);
  timestamps.push(now);
  ticketCooldown.set(userId, timestamps);
  return timestamps.length <= 3;
}

// --- Tickets activos (en memoria) ---
const activeTickets = new Map();

// --- Crear el cliente ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ============================================
// EVENTO: Bot listo
// ============================================
client.once(Events.ClientReady, (c) => {
  console.log(`[OK] Bot conectado: ${c.user.tag}`);
  console.log(`[INFO] Sirviendo ${c.guilds.cache.size} servidor(es)`);
  console.log(`[INFO] Usa /panel en un canal para crear el panel de tickets`);
  console.log(`[INFO] Usa /config para ver la configuracion actual`);
});

// ============================================
// REGISTRO DE COMANDOS SLASH
// ============================================
client.on(Events.ClientReady, async () => {
  const commands = [
    {
      name: 'panel',
      description: 'Crea el panel de tickets en este canal',
      defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    },
    {
      name: 'config',
      description: 'Muestra la configuracion actual del bot',
      defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    },
    {
      name: 'setcategoria',
      description: 'Configura la categoria donde se crean los tickets',
      options: [{
        type: 7, // CHANNEL
        name: 'categoria',
        description: 'Categoria (canal de categoria) para los tickets',
        required: true,
        channelTypes: [4], // GuildCategory
      }],
      defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    },
    {
      name: 'setlog',
      description: 'Configura el canal donde se envian los logs de tickets',
      options: [{
        type: 7, // CHANNEL
        name: 'canal',
        description: 'Canal de texto para los logs',
        required: true,
        channelTypes: [0], // GuildText
      }],
      defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    },
    {
      name: 'cerrar',
      description: 'Cierra el ticket actual (usar dentro del canal del ticket)',
    },
  ];

  try {
    for (const guild of client.guilds.cache.values()) {
      await guild.commands.set(commands);
      console.log(`[OK] Comandos registrados en: ${guild.name}`);
    }
  } catch (err) {
    console.error('[ERROR] No se pudieron registrar los comandos:', err.message);
  }
});

// ============================================
// MANEJO DE INTERACCIONES
// ============================================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // --- Comandos slash ---
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'panel') {
        await handlePanel(interaction);
      } else if (commandName === 'config') {
        await handleConfig(interaction);
      } else if (commandName === 'setcategoria') {
        await handleSetCategoria(interaction);
      } else if (commandName === 'setlog') {
        await handleSetLog(interaction);
      } else if (commandName === 'cerrar') {
        await handleCloseCommand(interaction);
      }
      return;
    }

    // --- Botones ---
    if (interaction.isButton()) {
      const { customId } = interaction;

      if (customId.startsWith('ticket_') && !['ticket_close', 'ticket_claim', 'ticket_add_user', 'ticket_remove_user'].includes(customId)) {
        const type = customId.replace('ticket_', '');
        await openTicket(interaction, type);
        return;
      }

      if (customId === 'ticket_close') {
        await closeTicket(interaction);
        return;
      }

      if (customId === 'ticket_claim') {
        await claimTicket(interaction);
        return;
      }

      if (customId === 'ticket_add_user') {
        await showAddUserSelect(interaction);
        return;
      }

      if (customId === 'ticket_remove_user') {
        await showRemoveUserSelect(interaction);
        return;
      }
    }

    // --- Select menus ---
    if (interaction.isUserSelectMenu()) {
      const { customId } = interaction;

      if (customId === 'ticket_select_add_user') {
        await addUserToTicket(interaction);
        return;
      }

      if (customId === 'ticket_select_remove_user') {
        await removeUserFromTicket(interaction);
        return;
      }
    }
  } catch (err) {
    console.error('[ERROR] Error en interaccion:', err.message);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: 'Ocurrio un error al procesar tu solicitud.', ephemeral: true }).catch(() => {});
    }
  }
});

// ============================================
// COMANDO: /panel - Crear panel de tickets
// ============================================
async function handlePanel(interaction) {
  const tipos = config.tipos;
  if (!tipos || tipos.length === 0) {
    return interaction.reply({ content: 'No hay tipos de ticket configurados. Edita config.json.', ephemeral: true });
  }

  // Construir la descripcion del embed estilo referencia
  let desc = '';

  if (config.descripcionPanel) {
    desc += `**${config.descripcionPanel}**\n\n`;
  }

  if (config.advertencia) {
    desc += `🚫 **${config.advertencia}**\n\n`;
  }

  for (const tipo of tipos) {
    desc += `${tipo.emoji || ''} **${tipo.label}**\n╰ ${tipo.descripcion}\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(config.tituloPanel || 'SUPPORT TICKETS')
    .setDescription(desc.trim())
    .setColor(config.color || '#4b0082')
    .setFooter({ text: config.footer || 'Sistema de Tickets' });

  if (config.imagenPanel) {
    embed.setImage(config.imagenPanel);
  }

  // Crear botones (max 5 por fila)
  const row = new ActionRowBuilder();
  for (const tipo of tipos.slice(0, 5)) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket_${tipo.id}`)
      .setLabel(tipo.label)
      .setStyle(COLOR_MAP[tipo.color] || ButtonStyle.Primary);
    if (tipo.emoji) btn.setEmoji(tipo.emoji);
    row.addComponents(btn);
  }

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: 'Panel de tickets creado.', ephemeral: true });
  console.log(`[OK] Panel creado en #${interaction.channel.name} por ${interaction.user.tag}`);
}

// ============================================
// COMANDO: /config - Ver configuracion
// ============================================
async function handleConfig(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Configuracion actual')
    .setColor(config.color || '#4b0082')
    .addFields(
      { name: 'Titulo del panel', value: config.tituloPanel || 'SUPPORT TICKETS', inline: true },
      { name: 'Imagen del panel', value: config.imagenPanel || 'No configurada', inline: true },
      { name: 'Rol staff', value: config.rolStaff ? `<@&${config.rolStaff}>` : 'No configurado', inline: true },
      { name: 'Categoria de tickets', value: config.categoriaTickets || 'No configurada (usa /setcategoria)', inline: false },
      { name: 'Canal de logs', value: config.canalLog || 'No configurado (usa /setlog)', inline: false },
      { name: 'Tipos de ticket', value: config.tipos.map(t => `${t.emoji || ''} ${t.label} (\`${t.id}\`)`).join('\n') || 'Ninguno', inline: false },
    )
    .setFooter({ text: config.footer || 'Sistema de Tickets' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ============================================
// COMANDO: /setcategoria
// ============================================
async function handleSetCategoria(interaction) {
  const canal = interaction.options.getChannel('categoria');
  config.categoriaTickets = canal.id;
  saveConfig();
  await interaction.reply({ content: `Categoria configurada: ${canal.name} (${canal.id})`, ephemeral: true });
  console.log(`[OK] Categoria configurada: ${canal.name}`);
}

// ============================================
// COMANDO: /setlog
// ============================================
async function handleSetLog(interaction) {
  const canal = interaction.options.getChannel('canal');
  config.canalLog = canal.id;
  saveConfig();
  await interaction.reply({ content: `Canal de logs configurado: ${canal.name} (${canal.id})`, ephemeral: true });
  console.log(`[OK] Canal de logs configurado: ${canal.name}`);
}

// ============================================
// COMANDO: /cerrar
// ============================================
async function handleCloseCommand(interaction) {
  const channel = interaction.channel;
  if (!activeTickets.has(channel.id)) {
    return interaction.reply({ content: 'Este canal no es un ticket activo.', ephemeral: true });
  }
  await closeTicket(interaction);
}

// ============================================
// ABRIR TICKET
// ============================================
async function openTicket(interaction, type) {
  const guild = interaction.guild;
  const user = interaction.user;

  // Buscar el tipo de ticket
  const tipo = config.tipos.find(t => t.id === type);
  if (!tipo) {
    return interaction.reply({ content: 'Tipo de ticket no valido.', ephemeral: true });
  }

  // Rate limiting: max 3 tickets cada 10 minutos
  if (!checkCooldown(user.id)) {
    return interaction.reply({ content: 'Estas creando tickets muy rapido. Espera 10 minutos e intenta de nuevo.', ephemeral: true });
  }

  // Verificar si ya tiene un ticket abierto del mismo tipo
  const existing = [...activeTickets.values()].find(t => t.userId === user.id && t.guildId === guild.id && t.type === type);
  if (existing) {
    return interaction.reply({ content: `Ya tienes un ticket abierto: <#${existing.channelId}>`, ephemeral: true });
  }

  // Crear el canal del ticket: formato {tipo}-{username}, sin numero
  const safeUsername = user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const channelName = `${type}-${safeUsername}`.substring(0, 50);

  const channelOptions = {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
      },
    ],
  };

  // Usar categoria si esta configurada
  if (config.categoriaTickets) {
    channelOptions.parent = config.categoriaTickets;
  }

  const channel = await guild.channels.create(channelOptions);

  // Registrar el ticket
  activeTickets.set(channel.id, {
    channelId: channel.id,
    userId: user.id,
    guildId: guild.id,
    type,
    openedAt: Date.now(),
    claimedBy: null,
  });

  // Fecha formateada estilo referencia
  const createdDate = new Date().toLocaleString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Mensaje de bienvenida estilo referencia
  const welcomeText = config.mensajeBienvenida
    ? config.mensajeBienvenida.replace('{user}', `<@${user.id}>`)
    : `Welcome <@${user.id}>! Please describe your inquiry and wait for a staff member to assist you.`;

  const embed = new EmbedBuilder()
    .setTitle('Ticket Created')
    .setDescription(`${welcomeText}\n\n**Type:** ${tipo.emoji || ''} ${tipo.label}\n**Created:** ${createdDate}\n\nUse the buttons below to manage this ticket.`)
    .setColor(config.color || '#4b0082')
    .setFooter({ text: config.footer || 'Sistema de Tickets' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Claim')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId('ticket_add_user')
      .setLabel('Add User')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('➕')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_remove_user')
      .setLabel('Remove User')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('➖')
  );

  const pingContent = config.rolStaff ? `<@${user.id}> <@&${config.rolStaff}>` : `<@${user.id}>`;

  await channel.send({ content: pingContent, embeds: [embed], components: [row1, row2] });
  await interaction.reply({ content: `Ticket creado: <#${channel.id}>`, ephemeral: true });

  // Enviar log si esta configurado
  if (config.canalLog) {
    const logChannel = guild.channels.cache.get(config.canalLog);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setDescription(`Ticket **${tipo.label}** abierto\nUsuario: <@${user.id}>\nCanal: <#${channel.id}>`)
        .setColor(config.color || '#4b0082')
        .setFooter({ text: config.footer || 'Sistema de Tickets' })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }

  console.log(`[OK] Ticket ${type} abierto por ${user.tag}: ${channel.name}`);
}

// ============================================
// CLAIM TICKET
// ============================================
async function claimTicket(interaction) {
  const channel = interaction.channel;
  const ticket = activeTickets.get(channel.id);

  if (!ticket) {
    return interaction.reply({ content: 'Este canal no es un ticket activo.', ephemeral: true });
  }

  if (ticket.claimedBy) {
    return interaction.reply({ content: `Este ticket ya fue reclamado por <@${ticket.claimedBy}>.`, ephemeral: true });
  }

  ticket.claimedBy = interaction.user.id;

  await interaction.reply({ content: `Ticket reclamado por <@${interaction.user.id}>.`, ephemeral: false });
  console.log(`[OK] Ticket reclamado por ${interaction.user.tag}: ${channel.name}`);
}

// ============================================
// MOSTRAR SELECT PARA AGREGAR USUARIO
// ============================================
async function showAddUserSelect(interaction) {
  const ticket = activeTickets.get(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({ content: 'Este canal no es un ticket activo.', ephemeral: true });
  }

  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('ticket_select_add_user')
      .setPlaceholder('Selecciona un usuario para agregar al ticket')
      .setMaxValues(1)
  );

  await interaction.reply({ content: 'Selecciona el usuario que quieres agregar:', components: [row], ephemeral: true });
}

// ============================================
// AGREGAR USUARIO AL TICKET
// ============================================
async function addUserToTicket(interaction) {
  const channel = interaction.channel;
  const ticket = activeTickets.get(channel.id);

  if (!ticket) {
    return interaction.reply({ content: 'Este canal no es un ticket activo.', ephemeral: true });
  }

  const userId = interaction.values[0];

  await channel.permissionOverwrites.edit(userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });

  await interaction.reply({ content: `Usuario <@${userId}> agregado al ticket.`, ephemeral: false });
  console.log(`[OK] Usuario ${userId} agregado al ticket ${channel.name}`);
}

// ============================================
// MOSTRAR SELECT PARA REMOVER USUARIO
// ============================================
async function showRemoveUserSelect(interaction) {
  const ticket = activeTickets.get(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({ content: 'Este canal no es un ticket activo.', ephemeral: true });
  }

  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('ticket_select_remove_user')
      .setPlaceholder('Selecciona un usuario para remover del ticket')
      .setMaxValues(1)
  );

  await interaction.reply({ content: 'Selecciona el usuario que quieres remover:', components: [row], ephemeral: true });
}

// ============================================
// REMOVER USUARIO DEL TICKET
// ============================================
async function removeUserFromTicket(interaction) {
  const channel = interaction.channel;
  const ticket = activeTickets.get(channel.id);

  if (!ticket) {
    return interaction.reply({ content: 'Este canal no es un ticket activo.', ephemeral: true });
  }

  const userId = interaction.values[0];

  // No permitir remover al creador del ticket
  if (userId === ticket.userId) {
    return interaction.reply({ content: 'No puedes remover al creador del ticket.', ephemeral: true });
  }

  await channel.permissionOverwrites.delete(userId);

  await interaction.reply({ content: `Usuario <@${userId}> removido del ticket.`, ephemeral: false });
  console.log(`[OK] Usuario ${userId} removido del ticket ${channel.name}`);
}

// ============================================
// CERRAR TICKET
// ============================================
async function closeTicket(interaction) {
  const channel = interaction.channel;
  const ticket = activeTickets.get(channel.id);

  if (!ticket) {
    return interaction.reply({ content: 'Este canal no es un ticket activo.', ephemeral: true });
  }

  // Enviar log de cierre
  if (config.canalLog) {
    const logChannel = interaction.guild.channels.cache.get(config.canalLog);
    if (logChannel) {
      const tipo = config.tipos.find(t => t.id === ticket.type);
      const logEmbed = new EmbedBuilder()
        .setDescription(`Ticket **${tipo ? tipo.label : ticket.type}** cerrado\nUsuario: <@${ticket.userId}>\nCanal: <#${channel.id}>\nCerrado por: <@${interaction.user.id}>`)
        .setColor('#ff0000')
        .setFooter({ text: config.footer || 'Sistema de Tickets' })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }

  activeTickets.delete(channel.id);
  await interaction.reply({ content: 'Ticket cerrado. El canal se eliminara en 5 segundos...' });
  console.log(`[OK] Ticket cerrado: ${channel.name} por ${interaction.user.tag}`);

  setTimeout(async () => {
    try {
      await channel.delete('Ticket cerrado');
    } catch (err) {
      console.error('[ERROR] No se pudo eliminar el canal:', err.message);
    }
  }, 5000);
}

// ============================================
// GUARDAR CONFIGURACION
// ============================================
function saveConfig() {
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// ============================================
// MANEJO DE ERRORES - No crashear
// ============================================
process.on('uncaughtException', (err) => {
  console.error('[ERROR] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[ERROR] Unhandled Rejection:', err.message);
});

// ============================================
// KEEP ALIVE - Servidor HTTP + auto-ping
// ============================================
function startKeepAlive() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', bot: client.user?.tag || 'starting', uptime: process.uptime() }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`[OK] Keep-alive activo en puerto ${PORT}`);
    console.log(`[INFO] Health check: http://localhost:${PORT}/health`);
  });

  // Auto-ping cada 5 minutos para evitar que el servicio gratuito se duerma
  setInterval(() => {
    const url = `http://localhost:${PORT}/health`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`[OK] Auto-ping: ${data}`);
      });
    }).on('error', (err) => {
      console.error(`[ERROR] Auto-ping fallo: ${err.message}`);
    });
  }, KEEP_ALIVE_INTERVAL);
}

// ============================================
// INICIAR BOT
// ============================================
if (TOKEN === 'PON-TU-TOKEN-AQUI' || !TOKEN) {
  console.error('[ERROR] No has configurado el token.');
  console.error('[INFO] Edita bot.js y pon tu token en la variable TOKEN, o usa la variable de entorno TOKEN.');
  console.error('[INFO] O ejecuta: TOKEN=tu-token-aqui npm start');
  process.exit(1);
}

startKeepAlive();
client.login(TOKEN);
