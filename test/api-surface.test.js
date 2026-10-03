'use strict';

/**
 * Maintainer: Tanvir Ahmed
 * WhatsApp: wa.me/+8801750079773
 * GitHub: www.github.com/143tanvir
 * Instagram: @ig.tanvir_ahmed
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCompatibilityApi } = require('../src/compatibility');

function fakeRaw() {
  const methods = [
    'getCurrentUserID','listen','stopListening','on','off','once','removeListener','removeAllListeners',
    'sendMessage','sendDirectMessage','replyToMessage','unsendMessage','sendPhoto','sendVideo','sendVoice','sendGIF',
    'sendPhotoFromUrl','sendVideoFromUrl','sendVoiceFromUrl','sendReaction','removeReaction','getInbox','getThreadInfo',
    'getThreadHistory','getPendingRequests','searchThreads','deleteThread','approveRequest','declineRequest','muteThread',
    'unmuteThread','changeThreadTitle','changeNickname','sendTypingIndicator','stopTypingIndicator','markAsRead','markAsUnread',
    'getUserInfo','getUserInfoByUsername','searchUsers','searchReels','getHealth','getSession','loadSession','logout',
    'initDatabase','saveMessageToDB','getMessagesFromDB','scheduleTask','stopTask','setOptions'
  ];
  const raw = {};
  for (const name of methods) raw[name] = (...args) => {
    if (name === 'getCurrentUserID') return { userId: '123456789', username: 'test' };
    if (name === 'getInbox') return { threads: [] };
    if (name === 'getSession') return { cookies: [] };
    if (name === 'getHealth') return { authenticated: true };
    return { ok: true, name, args };
  };
  raw.on = raw.off = raw.once = raw.removeListener = raw.removeAllListeners = () => raw;
  raw.stories = { getUserStories: async () => [], getFeedStories: async () => [], react: async () => ({ok:true}), reply: async () => ({ok:true}) };
  raw.live = { getLiveFeed: async () => [], sendComment: async () => ({ok:true}), sendHeart: async () => ({ok:true}) };
  raw.search = { hashtags: async () => [], places: async () => [], audio: async () => [] };
  return raw;
}

test('exposes InstaBot/FCA compatibility surface', async () => {
  const api = createCompatibilityApi(fakeRaw());
  const required = [
    'getCurrentUserID','listen','listenMqtt','stopListening',
    'sendMessage','sendImage','sendAudio','sendVideo','sendPhoto','sendVoice','sendGIF',
    'sendPhotoFromUrl','sendVideoFromUrl','sendVoiceFromUrl',
    'getThreadList','getInbox','getThreadInfo','getThreadHistory','getPendingRequests',
    'searchThreads','approveRequest','declineRequest','setTitle','changeNickname',
    'sendTypingIndicator','stopTypingIndicator','markAsRead','markAsUnread','markAsDelivered',
    'getUserInfo','getUserInfoByUsername','searchUsers',
    'sendReaction','setMessageReaction','removeReaction','unsendMessage',
    'musicSearch','sendMusic','sendTextEffect','sendAvatarTextEffect',
    'getUserStories','getFeedStories','reactToStory','replyToStory',
    'getLiveFeed','sendLiveComment','sendLiveHeart',
    'searchHashtags','searchPlaces','searchReels',
    'getSession','getAppState','loadSession','saveSession','loadSessionFromFile','logout',
    'getHealth','initDatabase','scheduleTask','setOptions'
  ];
  for (const key of required) assert.equal(typeof api[key], 'function', key);

  assert.equal(await api.getCurrentUserID(), '123456789');
  const list = await api.getThreadList(10);
  assert.deepEqual(list, []);
});

test('supports callback style without losing Promise return', async () => {
  const api = createCompatibilityApi(fakeRaw());
  let called = false;
  const promise = api.getUserInfo('42', (err, result) => {
    assert.ifError(err);
    called = !!result;
  });
  await promise;
  assert.equal(called, true);
});
