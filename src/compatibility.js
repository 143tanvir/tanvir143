'use strict';

/**
 * Maintainer: Tanvir Ahmed
 * WhatsApp: wa.me/+8801750079773
 * GitHub: www.github.com/143tanvir
 * Instagram: @ig.tanvir_ahmed
 */

const fs = require('fs');
const path = require('path');

function callbackAt(args) {
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (typeof args[i] === 'function') return args[i];
  }
  return null;
}

function nodeify(promise, callback) {
  const p = Promise.resolve(promise);
  if (typeof callback === 'function') {
    p.then(result => callback(null, result), error => callback(error));
  }
  return p;
}

function call(raw, names, args) {
  for (const name of names) {
    if (raw && typeof raw[name] === 'function') {
      try {
        return Promise.resolve(raw[name](...args));
      } catch (error) {
        return Promise.reject(error);
      }
    }
  }
  return Promise.reject(new Error(`The ICA does not provide ${names.join(' or ')}`));
}

function asId(value) {
  if (value && typeof value === 'object') {
    return String(value.userID ?? value.userId ?? value.id ?? value.pk ?? value.pk_id ?? '');
  }
  return value == null ? '' : String(value);
}

function normalizeUserInfo(requestedId, result) {
  if (!result || typeof result !== 'object') return { [String(requestedId)]: result };
  const id = asId(result);
  if (id || result.username || result.fullName || result.vanity) {
    return { [String(requestedId)]: result };
  }
  return result;
}

function normalizeThreadList(result) {
  if (!result) return { threads: [], has_more: false };
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.threads)) return result.threads;
  if (result.inbox && Array.isArray(result.inbox.threads)) return result.inbox.threads;
  return result;
}

function createCompatibilityApi(raw, options = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('createCompatibilityApi requires an API object');
  }

  const api = {};

  // Identity
  api.getCurrentUserID = (...args) => {
    const result = typeof raw.getCurrentUserID === 'function'
      ? raw.getCurrentUserID(...args)
      : raw._userID || raw.userId || null;
    return Promise.resolve(result).then(asId);
  };

  // Listening / EventEmitter compatibility
  api.listen = (...args) => call(raw, ['listen'], args);
  api.listenMqtt = (...args) => {
    if (typeof raw.listenMqtt === 'function') return raw.listenMqtt(...args);
    if (typeof raw.listen === 'function') {
      const result = raw.listen(...args);
      return typeof raw.stopListening === 'function'
        ? () => raw.stopListening()
        : result;
    }
    throw new Error('The ICA does not provide a realtime listener.');
  };
  api.stopListening = (...args) => call(raw, ['stopListening'], args);
  api.on = (...args) => raw.on(...args);
  api.off = (...args) => raw.off ? raw.off(...args) : raw.removeListener(...args);
  api.once = (...args) => raw.once(...args);
  api.removeListener = (...args) => raw.removeListener(...args);
  api.removeAllListeners = (...args) => raw.removeAllListeners(...args);

  // Messaging
  api.sendMessage = (message, threadID, callback, replyTo) => {
    const cb = typeof callback === 'function' ? callback : (typeof replyTo === 'function' ? replyTo : null);
    const reply = typeof callback === 'function' ? replyTo : undefined;
    let promise;
    if (reply && typeof raw.replyToMessage === 'function') {
      const body = typeof message === 'string' ? message : String(message?.body ?? message?.text ?? '');
      promise = raw.replyToMessage(String(threadID), body, String(reply));
    } else if (typeof raw.sendMessage === 'function') {
      promise = raw.sendMessage(message, String(threadID));
    } else if (raw.sendMessage && typeof raw.sendMessage.toThread === 'function') {
      promise = raw.sendMessage.toThread(String(threadID), message);
    } else {
      return nodeify(Promise.reject(new Error('The ICA does not provide sendMessage')), cb);
    }
    return nodeify(promise, cb);
  };

  api.sendDirectMessage = (userID, message, callback) =>
    nodeify(call(raw, ['sendDirectMessage'], [String(userID), message]), callback);

  api.replyToMessage = (threadID, message, replyToMessageID, callback) =>
    nodeify(call(raw, ['replyToMessage'], [String(threadID), message, String(replyToMessageID)]), callback);

  api.unsendMessage = (messageID, threadID, callback) =>
    nodeify(call(raw, ['unsendMessage', 'unsend'], [String(messageID)]), callbackAt([threadID, callback]));

  // Media aliases expected by InstaBot/FCA-style callers.
  const media = (names, args, callback) => nodeify(call(raw, names, args), callback);
  api.sendPhoto = (threadID, source, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = undefined; }
    return media(['sendPhoto', 'photo'], [String(threadID), source, opts], callback);
  };
  api.sendImage = (source, threadID, caption, callback) => {
    if (typeof caption === 'function') { callback = caption; caption = ''; }
    const opts = caption ? { text: caption, caption } : undefined;
    return media(['sendPhoto', 'sendImage', 'photo'], [String(threadID), source, opts], callback);
  };
  api.sendVideo = (threadID, source, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = undefined; }
    return media(['sendVideo', 'video'], [String(threadID), source, opts], callback);
  };
  api.sendAudio = (source, threadID, callback) =>
    media(['sendVoice', 'sendAudio', 'voice'], [String(threadID), source], callback);
  api.sendVoice = (threadID, source, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = undefined; }
    return media(['sendVoice', 'voice'], [String(threadID), source, opts], callback);
  };
  api.sendGIF = (threadID, source, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = undefined; }
    return media(['sendGIF', 'gif'], [String(threadID), source, opts], callback);
  };
  api.sendPhotoFromUrl = (threadID, url, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = undefined; }
    return media(['sendPhotoFromUrl', 'photoFromUrl'], [String(threadID), url, opts], callback);
  };
  api.sendVideoFromUrl = (threadID, url, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = undefined; }
    return media(['sendVideoFromUrl', 'videoFromUrl'], [String(threadID), url, opts], callback);
  };
  api.sendVoiceFromUrl = (threadID, url, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = undefined; }
    return media(['sendVoiceFromUrl', 'voiceFromUrl'], [String(threadID), url, opts], callback);
  };

  // Search / music. Search is implemented by the working base client.
  api.musicSearch = (query, callback) =>
    nodeify(call(raw, ['musicSearch', 'searchMusic'], [String(query)]).catch(() => {
      if (raw.search && typeof raw.search.audio === 'function') return raw.search.audio(String(query));
      if (typeof raw.searchAudio === 'function') return raw.searchAudio(String(query));
      throw new Error('The ICA does not provide music search');
    }), callback);

  api.sendMusic = (threadID, track, callback) => {
    // Prefer a native music sender. Otherwise use a returned audio URL when one is available.
    if (typeof raw.sendMusic === 'function') {
      return nodeify(raw.sendMusic(String(threadID), track), callback);
    }
    const uri = track?.audioUrl || track?.audio_uri || track?.audioUri || track?.url;
    if (uri && typeof raw.sendVoiceFromUrl === 'function') {
      return nodeify(raw.sendVoiceFromUrl(String(threadID), uri, { text: track?.title || '' }), callback);
    }
    return nodeify(Promise.reject(new Error('This ICA build has no native sendMusic implementation.')), callback);
  };

  // Effect aliases. The working base has no private effect endpoint; fail clearly rather than pretending success.
  api.sendTextEffect = (text, threadID, effect, callback) =>
    nodeify(call(raw, ['sendTextEffect'], [String(threadID), String(text), String(effect)]), callback);
  api.sendAvatarTextEffect = (text, threadID, effect, callback) =>
    nodeify(call(raw, ['sendAvatarTextEffect'], [String(threadID), String(text), String(effect)]), callback);

  // Reactions
  api.sendReaction = (reaction, messageID, callback) =>
    nodeify(call(raw, ['sendReaction'], [String(reaction), String(messageID)]), callback);
  api.removeReaction = (messageID, callback) =>
    nodeify(call(raw, ['removeReaction'], [String(messageID)]), callback);
  api.setMessageReaction = (reaction, messageID, threadID, callback) => {
    if (typeof threadID === 'function') { callback = threadID; threadID = undefined; }
    const promise = String(reaction || '')
      ? call(raw, ['sendReaction', 'setMessageReaction'], [String(reaction), String(messageID), threadID == null ? undefined : String(threadID)])
      : call(raw, ['removeReaction'], [String(messageID)]);
    return nodeify(promise, callback);
  };

  // Threads / groups
  api.getInbox = (opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(call(raw, ['getInbox'], [opts || {}]), callback);
  };
  api.getThreadList = (limit, timestamp, tags, callback) => {
    const cb = typeof callback === 'function' ? callback : (typeof tags === 'function' ? tags : (typeof timestamp === 'function' ? timestamp : (typeof limit === 'function' ? limit : null)));
    if (typeof limit === 'function') { limit = undefined; }
    if (typeof timestamp === 'function') { timestamp = undefined; }
    if (typeof tags === 'function') { tags = undefined; }
    const size = Number(limit) || 20;
    const invoke = typeof raw.getThreadList === 'function'
      ? raw.getThreadList(size, timestamp, tags)
      : call(raw, ['getInbox'], [{ limit: size, timestamp, tags }]);
    return nodeify(Promise.resolve(invoke).then(normalizeThreadList), cb);
  };
  api.getThreadInfo = (threadID, callback) =>
    nodeify(call(raw, ['getThreadInfo'], [String(threadID)]), callback);
  api.getThreadHistory = (threadID, amount, timestamp, callback) =>
    nodeify(call(raw, ['getThreadHistory'], [String(threadID), Number(amount) || 30, timestamp]), callback);
  api.getPendingRequests = (opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(call(raw, ['getPendingRequests', 'getPending'], [opts || {}]), callback);
  };
  api.searchThreads = (query, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(call(raw, ['searchThreads', 'searchForThread'], [String(query), opts || {}]), callback);
  };
  api.deleteThread = (threadID, callback) =>
    nodeify(call(raw, ['deleteThread'], [String(threadID)]), callback);
  api.approveRequest = (threadID, callback) =>
    nodeify(call(raw, ['approveRequest', 'handleMessageRequest'], [String(threadID), true]), callback);
  api.declineRequest = (threadID, callback) =>
    nodeify(call(raw, ['declineRequest'], [String(threadID)]), callback);
  api.muteThread = (threadID, callback) =>
    nodeify(call(raw, ['muteThread', 'changeThreadMute'], [String(threadID), true]), callback);
  api.unmuteThread = (threadID, callback) =>
    nodeify(call(raw, ['unmuteThread', 'changeThreadMute'], [String(threadID), false]), callback);
  api.changeThreadMute = (threadID, mute, callback) => {
    if (typeof raw.changeThreadMute === 'function') {
      return nodeify(raw.changeThreadMute(String(threadID), Boolean(mute)), callback);
    }
    const method = mute ? 'muteThread' : 'unmuteThread';
    if (typeof raw[method] === 'function') {
      return nodeify(raw[method](String(threadID)), callback);
    }
    return nodeify(Promise.reject(new Error('The ICA does not provide changeThreadMute')), callback);
  };
  api.setTitle = (threadID, title, callback) =>
    nodeify(call(raw, ['changeThreadTitle', 'setTitle', 'changeTitle'], [String(threadID), String(title)]), callback);
  api.changeThreadTitle = api.setTitle;
  api.addUserToThread = (userID, threadID, callback) => {
    if (typeof raw.addUserToThread === 'function') {
      return nodeify(raw.addUserToThread(String(userID), String(threadID)), callback);
    }
    if (raw.threadManagement && typeof raw.threadManagement.addUsers === 'function') {
      return nodeify(raw.threadManagement.addUsers(String(threadID), [String(userID)]), callback);
    }
    return nodeify(Promise.reject(new Error('The ICA does not provide addUserToThread')), callback);
  };
  api.removeUserFromThread = (userID, threadID, callback) => {
    if (typeof raw.removeUserFromThread === 'function') {
      return nodeify(raw.removeUserFromThread(String(userID), String(threadID)), callback);
    }
    if (raw.threadManagement && typeof raw.threadManagement.removeUser === 'function') {
      return nodeify(raw.threadManagement.removeUser(String(threadID), String(userID)), callback);
    }
    return nodeify(Promise.reject(new Error('The ICA does not provide removeUserFromThread')), callback);
  };
  api.changeNickname = (userID, threadID, nickname, callback) =>
    nodeify(call(raw, ['changeNickname', 'nickname'], [String(userID), String(threadID), String(nickname)]), callback);
  api.changeBio = (bio, callback) =>
    nodeify(call(raw, ['changeBio', 'setBio'], [String(bio)]), callback);
  api.changeProfilePicture = (source, callback) =>
    nodeify(call(raw, ['changeProfilePicture', 'changeAvatar', 'setProfilePicture'], [source]), callback);
  api.changeAvatar = (source, callback) => api.changeProfilePicture(source, callback);

  // Typing / read receipts
  api.sendTypingIndicator = (threadID, callback) =>
    nodeify(call(raw, ['sendTypingIndicator'], [String(threadID)]), callback);
  api.stopTypingIndicator = (threadID, callback) =>
    nodeify(call(raw, ['stopTypingIndicator'], [String(threadID)]), callback);
  api.markAsRead = (threadID, read, callback) => {
    if (typeof read === 'function') { callback = read; read = true; }
    return nodeify(call(raw, ['markAsRead'], [String(threadID), read !== false]), callback);
  };
  api.markAsUnread = (threadID, callback) =>
    nodeify(call(raw, ['markAsUnread'], [String(threadID)]), callback);
  api.markAsDelivered = (threadID, messageID, callback) =>
    nodeify(call(raw, ['markAsDelivered'], [String(threadID), messageID == null ? undefined : String(messageID)]), callback);

  // Users
  api.getUserInfo = (userID, callback) =>
    nodeify(call(raw, ['getUserInfo'], [String(userID)]).then(r => normalizeUserInfo(userID, r)), callback);
  api.getUserInfoByUsername = (username, callback) =>
    nodeify(call(raw, ['getUserInfoByUsername', 'getInfoByUsername'], [String(username)]), callback);
  api.searchUsers = (query, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(call(raw, ['searchUsers'], [String(query), opts || {}]), callback);
  };

  // Stories / live / search
  api.getUserStories = (userID, callback) =>
    nodeify(raw.stories?.getUserStories ? raw.stories.getUserStories(String(userID)) : call(raw, ['getUserStories'], [String(userID)]), callback);
  api.getFeedStories = (opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(raw.stories?.getFeedStories ? raw.stories.getFeedStories(opts || {}) : call(raw, ['getFeedStories'], [opts || {}]), callback);
  };
  api.reactToStory = (storyId, userId, emoji, callback) =>
    nodeify(raw.stories?.react ? raw.stories.react(String(storyId), String(userId), String(emoji)) : call(raw, ['reactToStory'], [String(storyId), String(userId), String(emoji)]), callback);
  api.replyToStory = (storyId, userId, message, callback) =>
    nodeify(raw.stories?.reply ? raw.stories.reply(String(storyId), String(userId), message) : call(raw, ['replyToStory'], [String(storyId), String(userId), message]), callback);
  api.getLiveFeed = (opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(raw.live?.getLiveFeed ? raw.live.getLiveFeed(opts || {}) : call(raw, ['getLiveFeed'], [opts || {}]), callback);
  };
  api.sendLiveComment = (broadcastId, message, callback) =>
    nodeify(raw.live?.sendComment ? raw.live.sendComment(String(broadcastId), String(message)) : call(raw, ['sendLiveComment'], [String(broadcastId), String(message)]), callback);
  api.sendLiveHeart = (broadcastId, count, callback) =>
    nodeify(raw.live?.sendHeart ? raw.live.sendHeart(String(broadcastId), Number(count) || 1) : call(raw, ['sendLiveHeart'], [String(broadcastId), Number(count) || 1]), callback);
  api.searchHashtags = (query, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(raw.search?.hashtags ? raw.search.hashtags(String(query), opts || {}) : call(raw, ['searchHashtags'], [String(query), opts || {}]), callback);
  };
  api.searchPlaces = (query, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(raw.search?.places ? raw.search.places(String(query), opts || {}) : call(raw, ['searchPlaces'], [String(query), opts || {}]), callback);
  };
  api.searchReels = (query, opts, callback) => {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    return nodeify(raw.searchReels ? raw.searchReels(String(query), opts || {}) : raw.search?.reels ? raw.search.reels(String(query), opts || {}) : call(raw, ['searchReels'], [String(query), opts || {}]), callback);
  };
  api.search = api.searchUsers;

  // Session / persistence
  api.getSession = () => raw.getSession ? raw.getSession() : raw.serialize();
  api.getAppState = callback => nodeify(Promise.resolve(api.getSession()), callback);
  api.loadSession = state => raw.loadSession ? raw.loadSession(state) : raw.deserialize(state);
  api.saveSession = async file => {
    const target = path.resolve(file || options.sessionFile || './session.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const state = await Promise.resolve(api.getSession());
    fs.writeFileSync(target, JSON.stringify(state, null, 2), 'utf8');
    return target;
  };
  api.loadSessionFromFile = async file => {
    const target = path.resolve(file || options.sessionFile || './session.json');
    const state = JSON.parse(fs.readFileSync(target, 'utf8'));
    await api.loadSession(state);
    return true;
  };
  api.logout = callback => nodeify(call(raw, ['logout'], []), callback);
  api.destroy = () => raw.destroy ? raw.destroy() : api.stopListening();

  // Health / database / scheduler / options
  api.getHealth = () => (typeof raw.getHealth === 'function' ? raw.getHealth() : (typeof raw.getHealthStatus === 'function' ? raw.getHealthStatus() : {}));
  api.getHealthStatus = api.getHealth;
  api.initDatabase = (...args) => nodeify(call(raw, ['initDatabase'], args), null);
  api.saveMessageToDB = (...args) => call(raw, ['saveMessageToDB'], args);
  api.getMessagesFromDB = (...args) => call(raw, ['getMessagesFromDB'], args);
  api.scheduleTask = (...args) => call(raw, ['scheduleTask'], args);
  api.stopTask = (...args) => call(raw, ['stopTask'], args);
  api.setOptions = (...args) => {
    const opts = args[0] || {};
    if (typeof raw.setOptions === 'function') return raw.setOptions(...args);
    if (typeof raw.http === 'object' && raw.logger) {
      if (opts.logLevel && typeof raw.logger.setLevel === 'function') raw.logger.setLevel(opts.logLevel);
      if (opts.userAgent && raw.http) {
        raw.http.userAgent = opts.userAgent;
        if (raw.http.client?.defaults?.headers) raw.http.client.defaults.headers['User-Agent'] = opts.userAgent;
      }
    }
    return opts;
  };

  // Cookie utilities / lower-level access
  if (raw.CookieUtils) api.CookieUtils = raw.CookieUtils;
  api.__raw = raw;

  // Proxy any additional current/future methods from the underlying client.
  return new Proxy(api, {
    get(target, key) {
      if (key in target) return target[key];
      const value = raw[key];
      if (typeof value === 'function') return value.bind(raw);
      return value;
    }
  });
}

module.exports = { createCompatibilityApi, nodeify, call };
