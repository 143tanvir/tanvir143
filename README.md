# tanvir143

<p align="center">
  <strong>tanvir143 — Instagram Chat API</strong><br>
  <em>Bot-first Instagram messaging client • MQTT realtime • session persistence • InstaBot/FCA compatibility</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tanvir143"><img src="https://img.shields.io/npm/v/tanvir143.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/tanvir143"><img src="https://img.shields.io/npm/dm/tanvir143.svg" alt="npm downloads"></a>
  <a href="https://github.com/143tanvir/insta-robot-143/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/tanvir143.svg" alt="license"></a>
</p>

> **Unofficial/private API notice:** this project uses Instagram private/web endpoints and realtime messaging. Those endpoints can change without notice. Use only accounts and environments you are authorized to operate, and follow Instagram's terms and applicable laws.

## Maintainer

```text
Maintainer: Tanvir Ahmed
WhatsApp: wa.me/+8801750079773
GitHub: www.github.com/143tanvir
Instagram: @ig.tanvir_ahmed
```

## What tanvir143 is

`tanvir143` is a Node.js Instagram Chat API built from a working local ICA base and extended with a compatibility layer designed around the API surface used by the **insta-robot-143 / InstaBot-style** bot architecture.

The design keeps the Instagram client, MQTT listener, session system, message helpers and bot-compatibility aliases in one package so the bot can call both modern methods and FCA-style/legacy method names.

## Compatibility target

The compatibility layer is intentionally centered on the methods the bot expects, including:

| Bot/API method | tanvir143 |
|---|---|
| `getThreadList()` | ✅ |
| `getInbox()` | ✅ |
| `getThreadInfo()` | ✅ |
| `getThreadHistory()` | ✅ |
| `sendMessage()` | ✅ |
| `sendImage()` | ✅ alias |
| `sendAudio()` | ✅ alias |
| `sendVideo()` | ✅ |
| `sendReaction()` | ✅ |
| `setMessageReaction()` | ✅ alias |
| `unsendMessage()` | ✅ |
| `sendTypingIndicator()` | ✅ |
| `markAsRead()` | ✅ |
| `markAsDelivered()` | ✅ compatibility method |
| `setTitle()` | ✅ alias |
| `addUserToThread()` | ✅ alias |
| `removeUserFromThread()` | ✅ alias |
| `changeThreadMute()` | ✅ alias |
| `getUserInfo()` | ✅ |
| `getUserInfoByUsername()` | ✅ |
| `musicSearch()` | ✅ search/fallback |
| `sendMusic()` | ✅ native when available |
| `listenMqtt()` | ✅ |

The package also exposes the broader modern feature set described below.

## Installation

```bash
npm install tanvir143
```

Node.js **20.0.0+** is required.

## Quick start

### Cookie login

```js
const { login } = require('tanvir143');

const api = await login('sessionid=...; ds_user_id=...; csrftoken=...; ig_did=...');

api.listenMqtt((err, event) => {
  if (err) return console.error('[MQTT]', err);
  if (event?.type !== 'message') return;

  console.log(event.body);
  api.sendMessage(`Echo: ${event.body}`, event.threadID);
});
```

### Bot-style callback API

```js
api.sendImage('./image.jpg', threadID, 'Hello', (err, result) => {
  if (err) return console.error(err);
  console.log(result);
});
```

### Credentials login

```js
const { login } = require('tanvir143');

const api = await login({
  username: process.env.IG_USERNAME,
  password: process.env.IG_PASSWORD
});
```

Authentication can require additional verification. The package does not bypass Instagram checkpoints or verification requirements.

## Login format supported by InstaBot-style adapters

A bot can pass a single object containing cookies plus connection options:

```js
const api = await login({
  cookies,
  selfListen: false,
  listenEvents: true,
  autoReconnect: true,
  autoSaveSession: true,
  sessionFile: './session.json',
  userAgent: 'Mozilla/5.0 ...'
});
```

The login adapter extracts the `cookies` field and passes the actual cookie set to the authenticated client. This avoids accidentally sending the entire options object into the cookie parser.

## Core features

### Realtime MQTT

```js
api.listenMqtt((err, event) => {
  if (err) return console.error(err);
  // event.type, event.threadID, event.senderID, event.body, event.messageID, ...
});

api.stopListening();
```

Automatic reconnect and connection health information are supported by the underlying realtime client.

### Messaging

```js
await api.sendMessage('Hello', threadID);
await api.sendDirectMessage(userID, 'Hello');
await api.replyToMessage(threadID, 'Reply', messageID);
await api.unsendMessage(messageID);
```

### Media

```js
await api.sendPhoto(threadID, './photo.jpg');
await api.sendVideo(threadID, './video.mp4');
await api.sendVoice(threadID, './voice.m4a');
await api.sendGIF(threadID, 'https://example.com/file.gif');
```

URL helpers:

```js
await api.sendPhotoFromUrl(threadID, 'https://example.com/photo.jpg');
await api.sendVideoFromUrl(threadID, 'https://example.com/video.mp4');
await api.sendVoiceFromUrl(threadID, 'https://example.com/audio.mp3');
```

### InstaBot/FCA media aliases

```js
api.sendImage(source, threadID, caption, callback);
api.sendAudio(source, threadID, callback);
api.sendVideo(source, threadID, callback);
```

### Reactions

```js
await api.sendReaction('❤️', messageID);
await api.setMessageReaction('🔥', messageID, threadID);
await api.removeReaction(messageID);
```

### Threads and groups

```js
const inbox = await api.getInbox({ limit: 20 });
const list = await api.getThreadList(20);
const info = await api.getThreadInfo(threadID);
const history = await api.getThreadHistory(threadID, 30);

await api.setTitle(threadID, 'New group title');
await api.changeThreadMute(threadID, true);
```

Additional helpers include pending request handling, nickname changes, add/remove member operations, thread search, delete, mute/unmute and history access.

### Users

```js
const user = await api.getUserInfo(userID);
const userByName = await api.getUserInfoByUsername('instagram');
const results = await api.searchUsers('tanvir', { limit: 10 });
```

### Music

```js
const tracks = await api.musicSearch('song name');
await api.sendMusic(threadID, tracks[0]);
```

`musicSearch()` uses the working base client's music search implementation when available. `sendMusic()` prefers a native sender; when a search result contains a usable audio URL, a voice-message fallback can be used. Private music-sticker sending is not claimed when the installed base does not expose that native endpoint.

### Text effects

The compatibility names are exposed:

```js
api.sendTextEffect(text, threadID, effect, callback);
api.sendAvatarTextEffect(text, threadID, effect, callback);
```

These methods require a native private endpoint implementation. `tanvir143` deliberately reports a clear unsupported-method error when the working base does not expose the underlying endpoint instead of returning a false success result.

### Read / delivery / typing

```js
await api.markAsRead(threadID);
await api.markAsUnread(threadID);
await api.markAsDelivered(threadID, messageID);
await api.sendTypingIndicator(threadID);
await api.stopTypingIndicator(threadID);
```

`markAsDelivered()` is a compatibility surface and requires a native delivery endpoint in the underlying ICA build.

### Stories

```js
await api.getUserStories(userID);
await api.getFeedStories({ limit: 10 });
await api.reactToStory(storyId, userId, '🔥');
await api.replyToStory(storyId, userId, 'Nice story');
```

### Live

```js
await api.getLiveFeed({ limit: 5 });
await api.sendLiveComment(broadcastId, 'Hello');
await api.sendLiveHeart(broadcastId, 5);
```

### Search

```js
await api.searchUsers('alice');
await api.searchHashtags('photography');
await api.searchPlaces('Dhaka');
await api.searchReels('travel');
```

### Session persistence

```js
const session = api.getSession();
await api.loadSession(session);
await api.saveSession('./session.json');
await api.loadSessionFromFile('./session.json');
```

Automatic saving can be enabled with:

```js
const api = await login(cookies, {
  autoSaveSession: true,
  sessionFile: './session.json'
});
```

Never commit session files or authentication cookies.

### Health monitoring

```js
const health = api.getHealth();
console.dir(health, { depth: 6 });
```

The health snapshot can include authentication state, listener state, MQTT state, reconnect attempts, HTTP health/rate-limit information and optional database/scheduler state.

### Optional database

```js
const api = await login(cookies, {
  database: true,
  dbOptions: { storage: './messages.db', logging: false }
});

await api.initDatabase();
```

### Optional scheduler

```js
const api = await login(cookies, { scheduler: true });

api.scheduleTask('morning', '0 9 * * *', async () => {
  await api.sendMessage('Good morning!', threadID);
});
```

## Cookie utilities

```js
const { login } = require('tanvir143');

const jar = login.CookieUtils.parse('sessionid=abc; ds_user_id=123');
const header = login.CookieUtils.parseHeaderString('sessionid=abc; csrftoken=xyz');
```

Common cookie export formats are supported by the bundled utility layer.

## Options

```js
const api = await login(cookies, {
  selfListen: false,
  listenEvents: true,
  autoMarkRead: false,
  autoMarkDelivery: true,
  logLevel: 'info',
  logColors: true,
  database: false,
  scheduler: false,
  autoReconnect: true,
  autoListen: false,
  autoSaveSession: true,
  sessionFile: './session.json',
  mqttConnectionTimeout: 30000,
  maxRetries: 3,
  userAgent: 'Mozilla/5.0 ...',
  proxy: null
});
```

## API style

The package supports both Promise-style and callback-style usage where practical:

```js
// Promise
await api.sendMessage('hello', threadID);

// Callback
api.sendMessage('hello', threadID, (err, result) => {
  if (err) return console.error(err);
  console.log(result);
});
```

## InstaBot integration

The intended integration point is a single ICA import/adapter location inside the bot. Keep the rest of the command/event system unchanged unless the bot uses an API that is genuinely absent from the ICA.

For `insta-robot-143`, the bot's realtime startup expects `listenMqtt()` and the command layer expects several FCA-style methods such as `getThreadList()` and `sendImage()`. `tanvir143` exposes these aliases specifically so the bot does not have to be rewritten merely because the underlying ICA uses modern method names.

### Should `src/bot.js` be changed?

The preferred setup is **no change to `src/bot.js`** when the compatibility layer is sufficient. The package exposes the methods used by the current bot runtime.

A bot-side change is appropriate only when the bot depends on behavior that cannot be represented safely by an ICA adapter—for example, an event schema that is materially different from the available realtime payload. In that case the required bot file should be changed explicitly rather than silently masking the mismatch.

## Validation and reliability layers

The package retains the working base's defensive infrastructure, including:

- request validation and media size checks
- adaptive rate limiting
- circuit-breaker protection
- retry/backoff for transient network failures
- per-thread send pacing
- message idempotency support
- MQTT reconnect handling
- session persistence
- optional database and scheduler support

These mechanisms do not guarantee that Instagram private endpoints will remain stable; upstream endpoint changes may still require maintenance.

## Testing

Run local tests with:

```bash
npm test
npm run syntax
npm run pack:check
```

The test suite covers the public compatibility surface, callback/Promise behavior, package metadata and static package-contract checks.

A live Instagram login/MQTT test requires an authenticated account/session and a real network connection. It should be run only in your own controlled deployment environment; test sessions should never be committed or published.

## Publishing

Before publishing:

```bash
npm login
npm whoami
npm publish --access public
```

A local package can be inspected first with:

```bash
npm pack
```

The package uses `publishConfig.access = public`, so the package metadata is configured for a public npm release. Actual publishing still requires an authenticated npm account with permission to publish the package name.

## Security

Never publish:

```text
session.json
account.txt
cookies
sessionid
csrftoken
passwords
access tokens
```

Use environment variables or secure deployment secrets instead.

## License and attribution

This distribution retains the MIT license and preserves upstream license notices where required. The project maintainer information is added separately:

```text
Maintainer: Tanvir Ahmed
WhatsApp: wa.me/+8801750079773
GitHub: www.github.com/143tanvir
Instagram: @ig.tanvir_ahmed
```

## Disclaimer

`tanvir143` is an unofficial/private Instagram client and is not affiliated with Instagram or Meta. Private endpoints can change or stop working without notice.
