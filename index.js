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

const {
  createCompatibilityApi,
  nodeify
} = require('./src/compatibility');

const PACKAGE_VERSION = require('./package.json').version;
const PACKAGE_NAME = 'tanvir143-api';

/*
 * Keep one consistent User-Agent for the whole client/session.
 * This helps prevent sendMessage() User-Agent mismatch errors.
 */
const DEFAULT_USER_AGENT =
  'Instagram 350.0.0.0.0 Android (28/8.1.0; 480dpi; 1080x1920; Google; Pixel 2; walleye; qcom; en_US; 143991798)';


function normalizeCookieCredential(credentials) {
  if (typeof credentials === 'string' || Array.isArray(credentials)) {
    return credentials;
  }

  if (!credentials || typeof credentials !== 'object') {
    return credentials;
  }

  return (
    credentials.cookies ||
    credentials.appState ||
    credentials.cookie ||
    credentials.session ||
    credentials
  );
}


function hasCookieShape(value) {
  if (typeof value === 'string') {
    return /(?:^|;\s*)(?:sessionid|ds_user_id)=/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(
      cookie =>
        cookie &&
        (
          cookie.name === 'sessionid' ||
          cookie.key === 'sessionid'
        )
    );
  }

  return !!(
    value &&
    typeof value === 'object' &&
    (
      value.cookies ||
      value.appState ||
      value.cookie ||
      value.session
    )
  );
}


function buildLoginOptions(credentials, options) {
  const source =
    credentials && typeof credentials === 'object'
      ? credentials
      : {};

  const merged = {
    ...source,
    ...(options || {})
  };

  /*
   * Always use the same User-Agent unless the caller
   * explicitly provides one.
   */
  merged.userAgent =
    merged.userAgent ||
    source.userAgent ||
    DEFAULT_USER_AGENT;

  if (source.cookies && !merged.cookies) {
    merged.cookies = source.cookies;
  }

  return merged;
}


async function _login(credentials, options = {}) {
  const loginOptions = buildLoginOptions(
    credentials,
    options
  );

  const isCookieLogin =
    hasCookieShape(credentials) ||
    hasCookieShape(options) ||
    !credentials?.password;

  /*
   * Force the same User-Agent into the actual ICA client.
   */
  loginOptions.userAgent =
    loginOptions.userAgent ||
    DEFAULT_USER_AGENT;

  const client = new InstagramChatAPI(loginOptions);

  let result;

  /*
   * =========================
   * COOKIE LOGIN
   * =========================
   */
  if (isCookieLogin) {
    const cookies = normalizeCookieCredential(credentials);

    if (
      !cookies ||
      (
        cookies === credentials &&
        !hasCookieShape(credentials)
      )
    ) {
      throw new Error(
        'Instagram cookies are required. Pass a cookie header string, cookie array, or { cookies }.'
      );
    }

    result = await client.loginWithCookies(
      cookies,
      {
        userId:
          loginOptions.userId ||
          loginOptions.userID,

        username:
          loginOptions.username,

        userAgent:
          loginOptions.userAgent
      }
    );
  }

  /*
   * =========================
   * USERNAME/PASSWORD LOGIN
   * =========================
   */
  else {
    const username =
      credentials?.username ||
      credentials?.email;

    const password =
      credentials?.password;

    result = await client.login(
      username,
      password
    );

    /*
     * Two-factor authentication
     */
    if (result && result.twoFactorRequired) {
      const error = new Error(
        'Two-factor authentication required'
      );

      error.twoFactorRequired = true;
      error.twoFactorIdentifier =
        result.twoFactorIdentifier;

      error.verify = code =>
        client.verifyTwoFactor(
          code,
          result.twoFactorIdentifier
        );

      throw error;
    }

    /*
     * Instagram challenge/checkpoint
     */
    if (result && result.challengeRequired) {
      const error = new Error(
        'Instagram challenge/checkpoint required'
      );

      error.challengeRequired = true;
      error.checkpointUrl =
        result.checkpointUrl;

      throw error;
    }
  }


  /*
   * Login validation
   */
  if (!result?.success) {
    throw new Error(
      result?.error ||
      'Instagram login failed'
    );
  }


  /*
   * Compatibility API
   */
  const api = createCompatibilityApi(
    client,
    {
      ...loginOptions,
      userAgent: loginOptions.userAgent
    }
  );


  /*
   * Package information
   */
  api.version = PACKAGE_VERSION;
  api.packageName = PACKAGE_NAME;


  /*
   * Session file
   */
  const sessionFile = path.resolve(
    loginOptions.sessionFile ||
    './session.json'
  );


  /*
   * Auto save session
   */
  if (loginOptions.autoSaveSession === true) {
    try {
      await api.saveSession(sessionFile);
    } catch (_) {
      // Session saving is optional.
    }
  }


  /*
   * Auto MQTT listener
   */
  if (loginOptions.autoListen === true) {
    api.listenMqtt(
      loginOptions.listener ||
      (() => {})
    );
  }


  return api;
}


/*
 * =========================
 * PUBLIC LOGIN FUNCTION
 * =========================
 */
function login(credentials, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const promise = _login(
    credentials,
    options || {}
  );

  return typeof callback === 'function'
    ? nodeify(promise, callback)
    : promise;
}


/*
 * =========================
 * EXPORTED HELPERS
 * =========================
 */
login.CookieUtils = CookieUtils;

login.setOptions = setOptions;
login.getOptions = getOptions;
login.resetOptions = resetOptions;
login.validateOptions = validateOptions;
login.applyOptions = applyOptions;


/*
 * =========================
 * CREATE CLIENT
 * =========================
 */
login.createClient = options =>
  new InstagramChatAPI({
    userAgent: DEFAULT_USER_AGENT,
    ...(options || {})
  });


/*
 * =========================
 * PACKAGE INFORMATION
 * =========================
 */
login.version = PACKAGE_VERSION;
login.packageName = PACKAGE_NAME;


/*
 * =========================
 * LOAD FROM SESSION FILE
 * =========================
 */
login.fromSessionFile = async (
  file,
  options = {}
) => {
  const target = path.resolve(
    file ||
    options.sessionFile ||
    './session.json'
  );

  const state = JSON.parse(
    fs.readFileSync(
      target,
      'utf8'
    )
  );

  const client = new InstagramChatAPI({
    userAgent:
      options.userAgent ||
      DEFAULT_USER_AGENT,

    ...options
  });

  await client.deserialize(state);

  return createCompatibilityApi(
    client,
    {
      ...options,
      sessionFile: target,
      userAgent:
        options.userAgent ||
        DEFAULT_USER_AGENT
    }
  );
};


module.exports = {
  login
};
