require('dotenv').config();
const { Client, CategoryChannel, MessageEmbed, Discord } = require('discord.js')
const client = new Client({ partials: ['MESSAGE', 'REACTION']});
const db = require ('./database');
const Ticket = require('./models/Ticket');
const TicketConfig = require('./models/TicketConfig');

client.once('ready', () => {
    console.log('Bot is online and connected');
    db.authenticate()
        .then(() => {
            console.log('Connected to Database');
            Ticket.init(db);
            TicketConfig.init(db);
            Ticket.sync();
            TicketConfig.sync();
        }).catch((err) => console.log(err));
});

client.on('message', async (message, channel) => {

    if (message.content.toLowerCase() === '-ticketmsg') {
        const TicketEmbed = new MessageEmbed()
        .setTitle('Ticket Creation')
        .setAuthor('Doc Designs')
        .setColor('#EC1811')
        .setFooter('Doc Designs © 2020', 'https://cdn.discordapp.com/attachments/708880517516361748/790719901102112779/DOCDesigns.png')
        .setDescription('To create a ticket please react with the 📩 emoji.')

        message.channel.send(TicketEmbed);
    }

    if (message.author.bot || message.channel.type === 'dm') return;
    
    if (message.content.toLowerCase() === '-setup'){
        try {
            const filter = (m) => m.author.id === message.author.id;
            message.channel.send('embed id');
            const msgId  = (await message.channel.awaitMessages(filter, { max: 1 })).first().content;
            const fetchMsg = await message.channel.messages.fetch(msgId);
            message.channel.send('ticket catagory');
            const categoryID = (await message.channel.awaitMessages(filter, { max: 1})).first().content;
            const categoryChannel = client.channels.cache.get(categoryID); 
            message.channel.send('enter roles that require access');
            const roles =  (await message.channel.awaitMessages(filter, { max: 1})).first().content.split(/,\s*/);
            console.log(roles)
            if (fetchMsg & categoryChannel) {
                for (const roleId of roles) 
                    if (!message.guild.roles.cache.get(roleId)) throw new Error('Role does not exist'),
                    message.channel.send('invalid role'),
                    console.log(err);

                    const ticketConfig = await TicketConfig.create({
                        messageId: msgId,
                        guildId: message.guild.id,
                        roles: JSON.stringify(roles),
                        parentId: categoryChannel.id
                    });
                message.channel.send('saved to db'),
                await fetchMsg.react('📩');
                } else throw new Error('Invalid fields');

             } catch (err) {
            console.log(err);
            
            message.channel.send("Invalid answer, please type the correct ID's!")

        }
    }
});

client.on('messageReactionAdd', async (reaction, user, channel, message) => {
    if (user.bot) return;
    if (reaction.emoji.name === '📩') {
        const ticketConfig = await TicketConfig.findOne({ where: { messageId: reaction.message.id }});
        if (ticketConfig) {
            const findTicket = await Ticket.findOne({ where: { authorId: user.id, resolved: false}});
            if (findTicket) user.send('Your already have a ticket open!');
            else {
                console.log('Creating ticket');
                try {
                    const roleIdsString = ticketConfig.getDataValue('roles');
                    console.log(roleIdsString);
                    const roleIds = JSON.parse(roleIdsString);
                    const permissions = roleIds.map((id) => ({ allow: 'VIEW_CHANNEL', id}));
                    const channel = await reaction.message.guild.channels.create('ticket', {
                        parent: ticketConfig.getDataValue('parentId'),
                        permissionOverwrites: [
                            { deny: 'VIEW_CHANNEL', id: reaction.message.guild.id },
                            { allow: 'VIEW_CHANNEL', id: user.id },
                            ...permissions
                        ]
                    });
                    const CategoryEmbed = new MessageEmbed() //this is an embed 
                    .setTitle('Ticket created successfully :white_check_mark:')
                    .setDescription('Please provide a brief description for the reason of creating your ticket below. Our support staff will be with you shortly.')
                    .setFooter('Doc Designs © 2020', 'https://cdn.discordapp.com/attachments/708880517516361748/790719901102112779/DOCDesigns.png')
                    .setAuthor('Doc Designs')
                    .setColor('#EC1811');
                    const msg = await channel.send(CategoryEmbed);
                    await msg.react('🔒');
                    

                    const ticket = await Ticket.create({
                        authorId: user.id,
                        channelId: channel.id,
                        guildId: reaction.message.guild.id,
                        resolved: false,
                        closedMessageId: msg.id
                    });

                    const ticketId = String(ticket.getDataValue('ticketId')).padStart(4, 0);
                    await channel.edit({ name: `ticket-${ticketId}`})


                } catch (err) {
                    console.log(err);
                    client.users.cache.get(owner).send(err);
                }
            }
        } else {
            console.log('No ticket config found!');
        }
   }  else if (reaction.emoji.name === '🔒') { 
        const ticket = await Ticket.findOne({ where: { channelId: reaction.message.channel.id }}) //this part closes the ticket / hides it from the user so only admins can see
        if (ticket) {
            console.log('Ticket has been found');
            const closedMessageId = ticket.getDataValue('closedMessageId');
            if (reaction.message.id === closedMessageId) {
                reaction.message.channel.updateOverwrite(ticket.getDataValue('authorId'), {
                    VIEW_CHANNEL: false 
                }).catch((err) => console.log(err));
                ticket.resolved = true;
                await ticket.save();
                console.log('Updated');
            }

        }
    }

});

client.login(process.env.BOT_TOKEN);