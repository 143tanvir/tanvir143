/**
 * Maintainer: Tanvir Ahmed
 * WhatsApp: wa.me/+8801750079773
 * GitHub: www.github.com/143tanvir
 * Instagram: @ig.tanvir_ahmed
 */

/**
 * @license MIT
 */

const EventEmitter = require('events');
const { CookieJar } = require('tough-cookie');
const CryptoUtils = require('./utils/crypto');
const HttpClient = require('./utils/http');
const FormatUtils = require('./utils/formatter');
const Logger = require('./utils/logger');
const CookieUtils = require('./utils/cookies');
const { getOptions } = require('./utils/setOptions');

// Import methods
const Auth = require('./methods/auth');
const SendMessage = require('./methods/sendMessage');
const UnsendMessage = require('./methods/unsend');
const SendMedia = require('./methods/sendMedia');
const Reactions = require('./methods/reactions');
const ThreadInfo = require('./methods/threadInfo');
const ThreadHistory = require('./methods/threadHistory');
const ThreadManagement = require('./methods/threadManagement');
const TypingIndicator = require('./methods/typingIndicator');
const MarkRead = require('./methods/markRead');
const UserMethods = require('./methods/user');
const Stories = require('./methods/stories');
const Live = require('./methods/live');
const Search = require('./methods/search');

// Import MQTT Client
const InstagramMQTTClient = require('./mqtt/instagramRealtime');

// Import Database and Scheduler
const Database = require('./db/database');
const Scheduler = require('./utils/scheduler');

class InstagramChatAPI extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Initialize logger
    this.logger = new Logger({ level: options.logLevel || 'info' });
    
    // Store options for session restoration
    this.options = options;
    
    // Generate or use provided device IDs
    this.deviceId = options.deviceId || CryptoUtils.generateDeviceId();
    this.phoneId = options.phoneId || CryptoUtils.generateUUID();
    this.uuid = options.uuid || CryptoUtils.generateUUID();
    this.advertisingId = options.advertisingId || CryptoUtils.generateUUID();
    this.sessionId = options.sessionId || CryptoUtils.generateUUID();
    this.clientSessionId = options.clientSessionId || CryptoUtils.generateUUID();
    
    // User info
    this.username = options.username || null;
    this.userId = options.userId || null;
    this.fullName = options.fullName || null;
    this.password = options.password;
    
    // Initialize HTTP client
    this.http = new HttpClient({
      proxy: options.proxy,
      userAgent: options.userAgent || CryptoUtils.generateUserAgent(),
      deviceId: this.deviceId,
      phoneId: this.phoneId,
      uuid: this.uuid,
      clientSessionId: this.clientSessionId
    });
    
    // Initialize methods
    this.auth = new Auth(this.http, {
      username: this.username,
      password: this.password,
      deviceId: this.deviceId,
      phoneId: this.phoneId,
      uuid: this.uuid,
      advertisingId: this.advertisingId
    });
    
    this.sendMessage = new SendMessage(this.http, {
      deviceId: this.deviceId,
      uuid: this.uuid
    });
    
    this.unsend = new UnsendMessage(this.http, { uuid: this.uuid });
    this.sendMedia = new SendMedia(this.http, {
      deviceId: this.deviceId,
      uuid: this.uuid
    });
    this.sendMessage.sendMedia = this.sendMedia;
    this.reactions = new Reactions(this.http, { uuid: this.uuid, getMqtt: () => this.mqtt });
    this.threadInfo = new ThreadInfo(this.http);
    this.threadHistory = new ThreadHistory(this.http);
    this.threadManagement = new ThreadManagement(this.http, { uuid: this.uuid });
    this.typingIndicator = new TypingIndicator(this.http, { uuid: this.uuid });
    this.markRead = new MarkRead(this.http, { uuid: this.uuid });
    this.userMethods = new UserMethods(this.http);
    
    // Initialize new API methods
    this.stories = new Stories(this.http, { uuid: this.uuid, deviceId: this.deviceId });
    this.live = new Live(this.http, { uuid: this.uuid, deviceId: this.deviceId });
    this.search = new Search(this.http);
    
    // MQTT client for real-time messaging
    this.mqtt = null;
    this.listenActive = false;
    this.mqttConnecting = false; // guard against duplicate connect calls
    this.mqttConnectionTimeout = options.mqttConnectionTimeout || 30000; // 30s default
    
    // Initialize optional components (opt-in only)
    this.db = options.database ? new Database(options.dbOptions) : null;
    this.scheduler = options.scheduler ? new Scheduler(options.schedulerOptions) : null;
    
    // Setup event forwarding
    this.setupEventForwarding();
  }

  setupEventForwarding() {
    // Forward auth events
    this.auth.on('authenticated', (data) => this.emit('authenticated', data));
    this.auth.on('sessionRestored', (data) => this.emit('sessionRestored', data));
  }

  // ==================== AUTHENTICATION ====================

  // Shared MQTT initialisation — call after any successful login
  _initMqtt(userId) {
    // If a previous MQTT client exists, tear down its listeners to prevent leaks
    // when re-authenticating in the same process.
    if (this.mqtt) {
      try { this.mqtt.removeAllListeners(); } catch (_) { /* ignore */ }
      try { this.mqtt.disconnect(); } catch (_) { /* ignore */ }
    }

    const jarCookies = this.http.jar.serializeSync().cookies;
    const find = (key) => jarCookies.find(c => c.key === key)?.value;

    // Build the MQTT Cookie header from the same authenticated Instagram
    // session used by HttpClient. Keep only Instagram cookies so a browser
    // export containing unrelated domains cannot contaminate the handshake.
    const instagramCookies = jarCookies.filter((cookie) => {
      const domain = String(cookie.domain || '').toLowerCase();
      return domain === 'instagram.com' ||
        domain.endsWith('.instagram.com');
    });

    const cookieHeader = instagramCookies
      .map(c => `${c.key}=${c.value}`)
      .join('; ');

    this.mqtt = new InstagramMQTTClient({
      deviceId:    this.deviceId,
      phoneId:     this.phoneId,
      uuid:        this.uuid,
      advertisingId: this.advertisingId,
      userId:      userId,
      sessionId:   find('sessionid'),
      csrftoken:   find('csrftoken'),
      igDid:       find('ig_did'),
      cookies:     cookieHeader,
      userAgent:   this.http.userAgent,
      http:        this.http
    });

    // Bind handlers as instance refs so we can remove them deterministically.
    this._mqttEventHandler = (event) => this.handleListenEvent(event);
    this._mqttErrorHandler = (err) => {
      this.logger.error('MQTT error:', err.message);
      this.emit('error', new Error('MQTT error: ' + err.message));
    };
    this.mqtt.on('event', this._mqttEventHandler);
    this.mqtt.on('error', this._mqttErrorHandler);
  }

  async login(username, password, callback) {
    try {
      const result = await this.auth.login(username, password);

      if (result.success) {
        this._initMqtt(result.userID);

        if (this.db) {
          await this.db.init();
          await this.db.saveSession(result.username, result.userID, this.getSession());
        }
      }

      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  async verifyTwoFactor(code, twoFactorIdentifier, callback) {
    try {
      const result = await this.auth.verifyTwoFactor(code, twoFactorIdentifier);

      if (result.success) {
        this._initMqtt(result.userID);
      }

      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  async loginWithCookies(cookies, options, callback) {
    try {
      const result = await this.auth.loginWithCookies(cookies, options);

      if (result.success) {
        this.logger.verbose('Initializing MQTT with userId:', result.userID);
        this._initMqtt(result.userID);

        if (this.db) {
          await this.db.init();
          await this.db.saveSession(result.username, result.userID, this.getSession());
        }
      }

      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  async logout(callback) {
    this.stopListening();
    
    if (this.scheduler) {
      this.scheduler.stopAll();
    }
    
    if (this.db) {
      await this.db.close();
    }
    
    return this.auth.logout(callback);
  }

  // ==================== LISTENING (MQTT) ====================

  listen(callback) {
    // Guard against duplicate concurrent listen() calls
    if (this.mqttConnecting) {
      const error = new Error('listen() already in progress. Wait for the current connection attempt to complete.');
      if (callback) return callback(error);
      throw error;
    }

    if (!this.auth.isAuthenticated()) {
      const error = new Error('Not authenticated. Call login() or loginWithCookies() first.');
      if (callback) return callback(error);
      throw error;
    }

    if (!this.mqtt) {
      const error = new Error('MQTT client not initialised. Authentication must complete before calling listen().');
      if (callback) return callback(error);
      throw error;
    }

    // If a previous listener was registered, drop it before overwriting so we
    // never accumulate stale callbacks across repeated listen() calls.
    if (this.listenerCallback && this.listenerCallback !== callback) {
      this.logger.verbose('listen(): replacing previous listener callback');
    }

    // Only set active state after all validation passes
    this.listenerCallback = callback;
    this.listenActive = true;
    this.mqttConnecting = true;

    // Connection timeout guard — prevents hanging indefinitely
    let timeoutHandle = setTimeout(() => {
      this.mqttConnecting = false;
      const err = new Error(`MQTT connection timed out after ${this.mqttConnectionTimeout}ms`);
      this.logger.error(err.message);
      if (this.listenerCallback) this.listenerCallback(err);
      this.emit('error', err);
      this.stopListening();
    }, this.mqttConnectionTimeout);

    this.mqtt.connect().then(() => {
      clearTimeout(timeoutHandle);
      this.mqttConnecting = false;
      this.logger.info('Connected via Instagram MQTT');
      this.emit('connected', { method: 'mqtt' });
    }).catch((err) => {
      clearTimeout(timeoutHandle);
      this.mqttConnecting = false;
      this.listenActive = false;
      this.logger.error('MQTT connection failed:', err.message);
      const error = new Error('MQTT connection failed: ' + err.message);
      if (this.listenerCallback) this.listenerCallback(error);
      this.emit('error', error);
    });
  }

  stopListening() {
    this.listenActive = false;
    this.mqttConnecting = false;
    this.listenerCallback = null;

    if (this.mqtt) {
      this.mqtt.disconnect();
    }

    this.emit('disconnected');
  }

  /**
   * Gracefully shut down all background tasks and connections.
   * Call this when you want to fully tear down the API instance.
   */
  async destroy() {
    this.stopListening();

    if (this.scheduler) {
      this.scheduler.stopAll();
      this.scheduler = null;
    }

    if (this.db) {
      await this.db.close();
      this.db = null;
    }

    this.mqtt = null;
    this.http.clearSession();
    this.removeAllListeners();
    this.logger.info('InstagramChatAPI destroyed');
  }

  handleListenEvent(event) {
    const options = getOptions();

    // Deduplicate: skip events we have already processed
    if (event.messageID) {
      if (this.http.isMessageSeen(event.messageID)) return;
      this.http.markMessageSeen(event.messageID);
    }
    
    // Check selfListen option - skip own messages if disabled
    if (event.type === 'message' && !options.selfListen) {
      const currentUserId = this.getCurrentUserID()?.userId?.toString();
      if (currentUserId && event.senderID === currentUserId) {
        return; // Skip own messages
      }
    }
    
    // Check listenEvents option
    if (!options.listenEvents && event.type !== 'message') {
      return; // Skip non-message events if listenEvents is disabled
    }
    
    // Auto mark as read if enabled
    if (options.autoMarkRead && event.type === 'message' && event.threadID) {
      this.markAsRead(event.threadID);
    }
    
    // Remember message → thread mapping so reactions/unsend can resolve the thread
    if (event.messageID && event.threadID) {
      this.http.rememberMessageThread(event.messageID, event.threadID);
    }

    // Also map the replied-to message ID → thread so that commands like
    // !react and !unsend can resolve the thread when acting on a reply target
    if (event.replyTo && event.threadID) {
      this.http.rememberMessageThread(event.replyTo, event.threadID);
    }

    // Save to database if available
    if (this.db && event.type === 'message') {
      this.db.saveMessage(event);
    }
    
    // Call listener callback
    if (this.listenerCallback) {
      this.listenerCallback(null, event);
    }
    
    // Emit event
    this.emit('event', event);
    if (event.type) {
      this.emit(event.type, event);
    }
  }

  // ==================== MESSAGING METHODS ====================

  // NOTE: this.sendMessage is the SendMessage instance (set in constructor).
  // A sendMessage(message, threadID) proxy is intentionally absent here because
  // it would be shadowed by the property. Use sendMessage.toThread() directly,
  // or call the module-level sendMessage() from index.js.

  sendDirectMessage(userID, message, callback) {
    return this.sendMessage.toUser(userID, message, callback);
  }

  replyToMessage(threadID, message, replyToMessageID, callback) {
    return this.sendMessage.reply(threadID, message, replyToMessageID, callback);
  }

  unsendMessage(messageID, callback) {
    return this.unsend.unsend(messageID, callback);
  }

  // ==================== MEDIA METHODS ====================

  sendPhoto(threadID, imagePath, options, callback) {
    return this.sendMedia.photo(threadID, imagePath, options, callback);
  }

  sendVoice(threadID, audioPath, options, callback) {
    return this.sendMedia.voice(threadID, audioPath, options, callback);
  }

  sendVideo(threadID, videoPath, options, callback) {
    return this.sendMedia.video(threadID, videoPath, options, callback);
  }

  sendGIF(threadID, gifUrl, options, callback) {
    return this.sendMedia.gif(threadID, gifUrl, options, callback);
  }

  sendPhotoFromUrl(threadID, imageUrl, options, callback) {
    return this.sendMedia.photoFromUrl(threadID, imageUrl, options, callback);
  }

  sendVideoFromUrl(threadID, videoUrl, options, callback) {
    return this.sendMedia.videoFromUrl(threadID, videoUrl, options, callback);
  }

  sendVoiceFromUrl(threadID, audioUrl, options, callback) {
    return this.sendMedia.voiceFromUrl(threadID, audioUrl, options, callback);
  }

  // ==================== REACTIONS ====================

  sendReaction(reaction, messageID, callback) {
    return this.reactions.send(reaction, messageID, callback);
  }

  removeReaction(messageID, callback) {
    return this.reactions.remove(messageID, callback);
  }

  // ==================== THREAD METHODS ====================

  getThreadInfo(threadID, callback) {
    return this.threadInfo.get(threadID, callback);
  }

  getInbox(options, callback) {
    return this.threadInfo.getInbox(options, callback);
  }

  getPendingRequests(options, callback) {
    return this.threadInfo.getPending(options, callback);
  }

  searchThreads(query, options, callback) {
    return this.threadInfo.search(query, options, callback);
  }

  getThreadHistory(threadID, amount, timestamp, callback) {
    return this.threadHistory.getHistory(threadID, amount, timestamp, callback);
  }

  deleteThread(threadID, callback) {
    return this.threadManagement.delete(threadID, callback);
  }

  approveRequest(threadID, callback) {
    return this.threadManagement.approveRequest(threadID, callback);
  }

  declineRequest(threadID, callback) {
    return this.threadManagement.declineRequest(threadID, callback);
  }

  muteThread(threadID, callback) {
    return this.threadManagement.mute(threadID, callback);
  }

  unmuteThread(threadID, callback) {
    return this.threadManagement.unmute(threadID, callback);
  }

  changeThreadTitle(threadID, title, callback) {
    return this.threadManagement.changeTitle(threadID, title, callback);
  }

  changeNickname(userID, threadID, nickname, callback) {
    return this.threadManagement.changeNickname(userID, threadID, nickname, callback);
  }

  // ==================== TYPING INDICATOR ====================

  sendTypingIndicator(threadID, callback) {
    return this.typingIndicator.start(threadID, callback);
  }

  stopTypingIndicator(threadID, callback) {
    return this.typingIndicator.stop(threadID, callback);
  }

  // ==================== MARK READ ====================

  markAsRead(threadID, read, callback) {
    return this.markRead.markAsRead(threadID, read, callback);
  }

  markAsUnread(threadID, callback) {
    return this.markRead.markAsUnread(threadID, callback);
  }

  // ==================== USER METHODS ====================

  getUserInfo(userID, callback) {
    return this.userMethods.getInfo(userID, callback);
  }

  getUserInfoByUsername(username, callback) {
    return this.userMethods.getInfoByUsername(username, callback);
  }

  searchUsers(query, options, callback) {
    return this.userMethods.search(query, options, callback);
  }

  // ==================== SEARCH (REELS / HASHTAGS / PLACES) ====================

  searchReels(query, options, callback) {
    return this.search.reels(query, options, callback);
  }

  // ==================== HEALTH ====================

  /**
   * Returns a snapshot of the API's runtime health: MQTT connection state,
   * HTTP circuit breaker state, adaptive rate-limit state, and timing of the
   * last successful HTTP response. Use this for monitoring and to detect
   * stale connections in long-running bots.
   */
  getHealth() {
    const httpHealth = this.http.getHealth();
    return {
      authenticated: this.auth.isAuthenticated(),
      userId: this.userId || (this.auth.getCurrentUserID() || {}).userId || null,
      listening: this.listenActive,
      mqtt: {
        initialized: !!this.mqtt,
        connected: !!(this.mqtt && this.mqtt.connected),
        connecting: this.mqttConnecting,
        endpoint: this.mqtt && this.mqtt.activeEndpoint,
        reconnectAttempts: this.mqtt && this.mqtt.reconnectAttempts || 0
      },
      http: httpHealth,
      database: !!this.db,
      scheduler: !!this.scheduler
    };
  }

  // ==================== SESSION METHODS ====================

  getSession() {
    return {
      ...this.auth.getSession(),
      deviceId: this.deviceId,
      phoneId: this.phoneId,
      uuid: this.uuid,
      advertisingId: this.advertisingId,
      sessionId: this.sessionId,
      clientSessionId: this.clientSessionId
    };
  }

  async loadSession(sessionData) {
    // Restore HTTP session first so cookies are available before auth checks
    if (sessionData.httpSession) {
      await this.http.loadSession(sessionData.httpSession);
    }

    await this.auth.loadSession(sessionData);
    
    // Only init MQTT after auth is fully confirmed, avoiding state inconsistencies
    if (this.auth.isAuthenticated()) {
      const { userId } = this.auth.getCurrentUserID() || {};
      if (userId) {
        this._initMqtt(userId);
      }
    }
    
    this.emit('sessionRestored', this.auth.getCurrentUserID());
    
    return true;
  }

  getCurrentUserID() {
    return this.auth.getCurrentUserID();
  }

  // ==================== UTILITY METHODS ====================

  formatThreadID(threadID) {
    return FormatUtils.formatID(threadID, 'thread');
  }

  formatUserID(userID) {
    return FormatUtils.formatID(userID, 'user');
  }

  // ==================== DATABASE METHODS ====================

  async initDatabase() {
    if (this.db) {
      await this.db.init();
      this.logger.info('Database initialized');
    }
  }

  async saveMessageToDB(message) {
    if (this.db) {
      await this.db.saveMessage(message);
    }
  }

  async getMessagesFromDB(threadId, options) {
    if (this.db) {
      return await this.db.getMessagesByThread(threadId, options);
    }
    return [];
  }

  // ==================== SCHEDULER METHODS ====================

  scheduleTask(name, cronExpression, task, options) {
    if (this.scheduler) {
      return this.scheduler.schedule(name, cronExpression, task, options);
    }
    return null;
  }

  stopTask(name) {
    if (this.scheduler) {
      return this.scheduler.stop(name);
    }
    return false;
  }

  // ==================== SESSION METHODS ====================

  serialize() {
    return {
      deviceId: this.deviceId,
      phoneId: this.phoneId,
      uuid: this.uuid,
      advertisingId: this.advertisingId,
      sessionId: this.sessionId,
      clientSessionId: this.clientSessionId,
      username: this.username,
      userId: this.userId,
      fullName: this.fullName,
      cookies: this.http.jar.serializeSync(),
      userAgent: this.http.userAgent
    };
  }

  async deserialize(state) {
    if (typeof state === 'string') {
      state = JSON.parse(state);
    }
    
    // Restore device IDs
    this.deviceId = state.deviceId || this.deviceId;
    this.phoneId = state.phoneId || this.phoneId;
    this.uuid = state.uuid || this.uuid;
    this.advertisingId = state.advertisingId || this.advertisingId;
    this.sessionId = state.sessionId || this.sessionId;
    this.clientSessionId = state.clientSessionId || this.clientSessionId;
    
    // Restore user info
    this.username = state.username || this.username;
    this.userId = state.userId || this.userId;
    this.fullName = state.fullName || this.fullName;
    
    // Restore cookies
    if (state.cookies) {
      const jar = CookieJar.deserializeSync(state.cookies);
      this.http.jar = jar;
    }
    
    // Restore user agent
    if (state.userAgent) {
      this.http.userAgent = state.userAgent;
    }
  }

  // ==================== EVENT EMITTER ====================

  on(event, listener) {
    return super.on(event, listener);
  }

  emit(event, ...args) {
    return super.emit(event, ...args);
  }
}

module.exports = InstagramChatAPI;
