# Stream Assistant

A basic Twitch bot scaffold in TypeScript and a little bit of Node.js. It sits in your chat, listens for Channel Points redemptions, and keeps a simple music request queue. Nothing fancy yet just a simple base for future development.

## What it actually does

It connects to your Twitch chat with tmi.js and listens for messages. It also opens an EventSub WebSocket connection and subscribes to `channel.channel_points_custom_reward_redemption.add`, so it hears about redemptions in real time (and reconnects on its own if the connection drops).

When someone redeems the "Order music" reward, the bot grabs whatever they typed in the reward's input field and pushes it onto an in-memory queue. There's no real playback yet — the "player" is just a stub that logs `playing track X` to the console. The idea is you swap that stub out later for a real Spotify or YouTube integration, without touching anything else, since it sits behind a small `MusicPlayer` interface.

Chat commands: `!queue` shows the next few tracks in line, `!song` shows what's "playing" right now, and `!skip` moves to the next track — but only mods and the broadcaster can use `!skip`.

That's it. No database, no web UI, no auth server — just a console process.

## Setting it up

```bash
npm install
cp .env.example .env
```

Then fill in `.env` with your own values (details below) and run it:

```bash
npm run dev     # runs with auto-reload, good for development
npm run build   # compiles to dist/
npm start        # runs the compiled version
```

## The .env file

You need six values: `TWITCH_BOT_USERNAME`, `TWITCH_OAUTH_TOKEN`, `TWITCH_CHANNEL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `REWARD_ID_MUSIC`. Here's where each one comes from.

**Bot username and channel** — `TWITCH_BOT_USERNAME` is the login name of the account that'll post in chat (lowercase). `TWITCH_CHANNEL` is the channel it joins, also lowercase, no `#`.

**OAuth token** — this token does double duty: it logs the bot into chat, and it's also what's used to create the EventSub subscription for redemptions. For chat alone, the easy path is [twitchapps.com/tmi](https://twitchapps.com/tmi/) — log in as the bot account and it hands you a token like `oauth:xxxxxxxx`. Drop that straight into `TWITCH_OAUTH_TOKEN`.

That quick token won't have the `channel:read:redemptions` scope EventSub needs though. For that you'll need to run a proper OAuth Authorization Code flow and make sure the token belongs to the broadcaster (or a mod who's allowed to read redemptions) with that scope included. Twitch's [authentication docs](https://dev.twitch.tv/docs/authentication/) walk through it — hit `id.twitch.tv/oauth2/authorize` with the scope, then swap the code for a token at `id.twitch.tv/oauth2/token`.

**Client ID and secret** — register an app at the [Twitch Developer Console](https://dev.twitch.tv/console/apps). Give it a name, set a redirect URL (`http://localhost:3000` is fine for local dev), pick a category like "Chat Bot," and once it's created you'll see the Client ID and can generate a Client Secret.

**Reward ID** — first create the "Order music" reward from your Creator Dashboard (Viewer Rewards → Channel Points → Manage Rewards). Then look up its ID through the Helix API:

```bash
curl -H "Authorization: Bearer <token>" \
     -H "Client-Id: <TWITCH_CLIENT_ID>" \
     "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=<channel_id>"
```

(You can get your channel ID from `https://api.twitch.tv/helix/users?login=<channel_name>`.) Find your reward in the response and copy its `id` into `REWARD_ID_MUSIC`.

## Project layout

Roughly one file per responsibility: `config.ts` reads and validates env vars, `logger.ts` is a tiny console logger, `twitchChat.ts` wraps tmi.js, `eventsub.ts` handles the WebSocket connection and subscription, `musicQueue.ts` is the queue class, `musicPlayer.ts` has the player interface and its console stub, `commands/` holds one file per chat command, and `index.ts` wires it all together.

To add a real player, implement `MusicPlayer` from `src/musicPlayer.ts` and use it instead of `ConsoleMusicPlayer` in `src/index.ts`. To add a command, drop a new file in `src/commands/` implementing the `Command` interface and register it in `src/commands/index.ts`.

Worth knowing: the queue lives only in memory, so restarting the bot wipes it. Nothing plays actual audio yet. And there's no persistence or dashboard — just logs.
