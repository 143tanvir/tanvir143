'use strict';

/**
 * Maintainer: Tanvir Ahmed
 * WhatsApp: wa.me/+8801750079773
 * GitHub: www.github.com/143tanvir
 * Instagram: @ig.tanvir_ahmed
 */

const fs = require('fs');
const path = require('path');
const InstagramChatAPI = require('./src/instagramChat');
const CookieUtils = require('./src/utils/cookies');
const {
  setOptions,
  getOptions,
  resetOptions,
  validateOptions,
  applyOptions
} = require('./src/utils/setOptions');
const { createCompatibilityApi, nodeify } = require('./src/compatibility');

const PACKAGE_VERSION = require('./package.json').version;

function normalizeCookieCredential(credentials) {
  if (typeof credentials === 'string' || Array.isArray(credentials)) return credentials;
  if (!credentials || typeof credentials !== 'object') return credentials;
  return credentials.cookies || credentials.appState || credentials.cookie || credentials.session || credentials;
}

function hasCookieShape(value) {
  if (typeof value === 'string') return /(?:^|;\s*)(?:sessionid|ds_user_id)=/i.test(value);
  if (Array.isArray(value)) return value.some(c => c && (c.name === 'sessionid' || c.key === 'sessionid'));
  return !!(value && typeof value === 'object' && (value.cookies || value.appState || value.cookie || value.session));
}

function buildLoginOptions(credentials, options) {
  const source = credentials && typeof credentials === 'object' ? credentials : {};
  const merged = { ...source, ...(options || {}) };
  if (source.cookies && !merged.cookies) merged.cookies = source.cookies;
  return merged;
}

async function _login(credentials, options = {}) {
  const loginOptions = buildLoginOptions(credentials, options);
  const isCookieLogin = hasCookieShape(credentials) || hasCookieShape(options) || !credentials?.password;
  const client = new InstagramChatAPI(loginOptions);

  let result;
  if (isCookieLogin) {
    const cookies = normalizeCookieCredential(credentials);
    if (!cookies || cookies === credentials && !hasCookieShape(credentials)) {
      throw new Error('Instagram cookies are required. Pass a cookie header string, cookie array, or { cookies }.');
    }
    result = await client.loginWithCookies(cookies, {
      userId: loginOptions.userId || loginOptions.userID,
      username: loginOptions.username,
      userAgent: loginOptions.userAgent
    });
  } else {
    const username = credentials?.username || credentials?.email;
    const password = credentials?.password;
    result = await client.login(username, password);
    if (result && result.twoFactorRequired) {
      const error = new Error('Two-factor authentication required');
      error.twoFactorRequired = true;
      error.twoFactorIdentifier = result.twoFactorIdentifier;
      error.verify = code => client.verifyTwoFactor(code, result.twoFactorIdentifier);
      throw error;
    }
    if (result && result.challengeRequired) {
      const error = new Error('Instagram challenge/checkpoint required');
      error.challengeRequired = true;
      error.checkpointUrl = result.checkpointUrl;
      throw error;
    }
  }

  if (!result?.success) throw new Error(result?.error || 'Instagram login failed');

  const api = createCompatibilityApi(client, loginOptions);
  api.version = PACKAGE_VERSION;
  api.packageName = 'tanvir143';

  // Optional auto-session restore/persistence.
  const sessionFile = path.resolve(loginOptions.sessionFile || './session.json');
  if (loginOptions.autoSaveSession === true) {
    try {
      await api.saveSession(sessionFile);
    } catch (_) {
      // Session saving is convenience functionality; successful login remains valid.
    }
  }

  if (loginOptions.autoListen === true) {
    api.listenMqtt(loginOptions.listener || (() => {}));
  }

  return api;
}

function login(credentials, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const promise = _login(credentials, options || {});
  return typeof callback === 'function'
    ? nodeify(promise, callback)
    : promise;
}

login.CookieUtils = CookieUtils;
login.setOptions = setOptions;
login.getOptions = getOptions;
login.resetOptions = resetOptions;
login.validateOptions = validateOptions;
login.applyOptions = applyOptions;
login.createClient = options => new InstagramChatAPI(options || {});
login.version = PACKAGE_VERSION;
login.packageName = 'tanvir143';

// Load a serialized session into a brand-new client/API instance.
login.fromSessionFile = async (file, options = {}) => {
  const target = path.resolve(file || options.sessionFile || './session.json');
  const state = JSON.parse(fs.readFileSync(target, 'utf8'));
  const client = new InstagramChatAPI(options);
  await client.deserialize(state);
  return createCompatibilityApi(client, { ...options, sessionFile: target });
};

module.exports = { login };
