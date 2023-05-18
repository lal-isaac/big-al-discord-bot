import Discord, { TextChannel, MessageEmbed, Message } from 'discord.js';
import fetch from 'node-fetch';
import Moment from 'moment';
import {
  RoboUYAGame,
  RoboUYAPlayer,
  UYAPlayerStatus,
  UYAMapNames,
  UYATimeLimits,
  UYAEmojisDEV,
  UYAEmojisPROD
} from './types';
import { queueUYAGamesUpdated } from './queue';
import * as dotenv from 'dotenv';
/**
 * Initialize dotenv so we can easily access custom env variables.
 */
dotenv.config();

let client: Discord.Client;
let existingMessage: Message;
const apiUrl = process.env.UYA_SERVER_API_URL;
const channelId = process.env.UYA_PLAYERS_ONLINE_CHANNEL_ID;

async function checkPlayersAndGames() {
  //console.log('checking uya players and games');
  const playersResult = await fetch(`${apiUrl}/robo/players`);
  const gamesResult = await fetch(`${apiUrl}/robo/games`);
  if (playersResult.ok && gamesResult.ok) {
    let players = (await playersResult.json()) as RoboUYAPlayer[];
    let games = (await gamesResult.json()) as RoboUYAGame[];
    queueUYAGamesUpdated(client, games);
    processOnlineData(players, games);
  } else {
    if (!playersResult.ok) throw new Error(await playersResult.json());
    else if (!gamesResult.ok) throw new Error(await gamesResult.json());
  }
}

async function processOnlineData(
  players: RoboUYAPlayer[],
  games: RoboUYAGame[]
) {
  if (channelId) {
    const channel = client.channels.cache.get(channelId);
    if (channel?.isText) {
      let embed = createEmbed(players, games);
      if (existingMessage) existingMessage.edit(embed);
      else {
        existingMessage = await (<TextChannel>channel).send(embed);
      }
    }
  }
}

function createEmbed(onlinePlayers: RoboUYAPlayer[], games: RoboUYAGame[]) {
  let onlineEmbed = new MessageEmbed()
    .setColor('#FFA000')
    .setTitle(`Players Online - ${onlinePlayers.length}`)
    //.setThumbnail('https://dl.uyaonline.com/assets/img/dreadzone.png')
    .setFooter('Last Updated')
    .setTimestamp(new Date())
    .setDescription(
      onlinePlayers.length > 0
        ? '```' +
            onlinePlayers
              .map((p) => `\n ${('[' + p.region + ']').padEnd(6)} ${p.username} ${getPlayerClanTagCleaned(p)} `)
              .join(' ') +
            '```'
        : ' '
    );

    // Clans section ===============================================================
    let clans = new Set<string[]>();
    for (let player of onlinePlayers) {
      clans.add([player.clan, player.clan_tag])
    }

    let clans_check = new Set<string>();

    let result_string = '';
    for (let clan_and_tag of clans) {
      if (clan_and_tag[0] != '' && !clans_check.has(clan_and_tag[0])) {
        result_string += `${clan_and_tag[0]} [${clan_and_tag[1]}]\n`
        clans_check.add(clan_and_tag[0])
      }
    }

    if (result_string == '') {
      onlineEmbed.addFields({
        name: 'No Clans online',
        value: '\u200B',
      });
    }
    else {
      onlineEmbed.addFields({
        name: 'Clans Online',
        value: '```' + result_string + '```',
      });
    }

  // Active Games section ===============================================================
  onlineEmbed.addFields({ name: '\u200B', value: 'Active Games:' });

  for (let game of games) {
    const { max_players, players, game_name, started_date } = game;
    let lobbyPlayerNames = players.map((p) => p.username);
    let timeSinceStarted =
      started_date > 0 ? Moment.duration(Moment.utc().diff(Moment.unix(started_date)))
        : null;

    if (lobbyPlayerNames.length > 0) {

      let inProgress = timeSinceStarted && timeSinceStarted.asHours() >= 0 ? ` @${Math.floor(timeSinceStarted.asHours())}:${padZeros(
                    timeSinceStarted.minutes().toString(),
                    2
                  )}:${padZeros(timeSinceStarted.seconds().toString(), 2)}` : '';

      let decodedName = Buffer.from(game_name, 'base64')
        .toString('ascii')
        .slice(0, 16)
        .trim();

      onlineEmbed.addFields({
        name:
          decodedName + `  -  (${players.length}/${max_players})${inProgress}`,
        value:
          '```' +
          `${game.game_mode} (${game.submode}) @ ${UYAMapNames.get(game.map)}\n` +
          `Time limit: ${UYATimeLimits.get(game.game_length)}` +
          `\n${
            (game.game_mode != 'Siege' ? 'Frag/Cap Limit: ': '') +
            (game.frag ? game.frag : '') +
            (game.cap_limit ? game.cap_limit : '')
              }` + '\nPlayers:' +
          // '```' +
          // '```' +
          lobbyPlayerNames
            .sort((a, b) => b.localeCompare(a))
            .reverse()
            .map((p) => `\n  ${p}  `)
            .join(' ') +
          '```',
      });
    }
  }

  if (Array.from(games).length < 1) {
    onlineEmbed.addFields({
      name: 'No Games',
      value: '\u200B',
    });
  }




  return onlineEmbed;
}

/**
 * This is the main function that starts the process.
 * @param client The active discord client instance.
 */
export async function checkOnlineUYAPlayers(_client: Discord.Client) {
  client = _client;
  await checkPlayersAndGames();
}

function getPlayerStatusCleaned(uyaPlayerOnline: RoboUYAPlayer) {
  let status = UYAPlayerStatus.get(uyaPlayerOnline.status);
  return status ? ('[' + status + ']').padEnd(9) : '';
}

function getPlayerClanTagCleaned(uyaPlayerOnline: RoboUYAPlayer) {
  let clan_tag = uyaPlayerOnline.clan_tag;
  return clan_tag != '' ? `[${clan_tag}]` : '';
}

function padZeros(str: string, length: number): string {
  return str.length < length ? padZeros('0' + str, length) : str;
}
