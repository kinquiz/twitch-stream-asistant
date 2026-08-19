import 'dotenv/config';

export interface Config {
  twitchBotUsername: string;
  twitchOauthToken: string;
  twitchChannel: string;
  twitchClientId: string;
  twitchClientSecret: string;
  rewardIdMusic: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value.trim();
}

function loadConfig(): Config {
  return {
    twitchBotUsername: requireEnv('TWITCH_BOT_USERNAME').toLowerCase(),
    twitchOauthToken: requireEnv('TWITCH_OAUTH_TOKEN'),
    twitchChannel: requireEnv('TWITCH_CHANNEL').toLowerCase(),
    twitchClientId: requireEnv('TWITCH_CLIENT_ID'),
    twitchClientSecret: requireEnv('TWITCH_CLIENT_SECRET'),
    rewardIdMusic: requireEnv('REWARD_ID_MUSIC'),
  };
}

export const config = loadConfig();
