'use strict';

/**
 * Maintainer: Tanvir Ahmed
 * WhatsApp: wa.me/+8801750079773
 * GitHub: www.github.com/143tanvir
 * Instagram: @ig.tanvir_ahmed
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function freshIndex() {
  const target = require.resolve('../index.js');
  delete require.cache[target];

  class FakeClient {
    constructor(options) {
      this.options = options;
      this.authenticated = true;
      this.userId = '123456789';
      this.username = 'test';
      this.http = { jar: { serializeSync: () => ({ cookies: [] }) } };
    }
    async loginWithCookies(cookies) { this.cookies = cookies; return { success: true, userID: '123456789', username: 'test' }; }
    async login() { return { success: true, userID: '123456789', username: 'test' }; }
    getSession() { return { userId: this.userId, username: this.username, cookies: { cookies: [] } }; }
    serialize() { return this.getSession(); }
    async loadSession() {}
    async deserialize() {}
    getCurrentUserID() { return { userId: this.userId, username: this.username }; }
    listen() {}
    stopListening() {}
    getHealth() { return { authenticated: true }; }
    logout() { return Promise.resolve({ success: true }); }
  }

  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const resolvedParent = parent && parent.filename ? path.normalize(parent.filename) : '';
    if (request === './src/instagramChat' && resolvedParent.endsWith(path.normalize('/index.js'))) return FakeClient;
    if (request === './src/utils/cookies' && resolvedParent.endsWith(path.normalize('/index.js'))) {
      return { parse: x => x, parseHeaderString: () => [], parseNetscape: () => [], parseJSON: () => [] };
    }
    if (request === './src/utils/setOptions' && resolvedParent.endsWith(path.normalize('/index.js'))) {
      return { setOptions: x => x, getOptions: () => ({}), resetOptions: () => ({}), validateOptions: () => ({ valid: true, errors: [], warnings: [] }), applyOptions: (c) => c };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(target);
  } finally {
    Module._load = originalLoad;
    delete require.cache[target];
  }
}

test('index login accepts bot-style { cookies, options } and returns compatibility API', async () => {
  const { login } = freshIndex();
  const api = await login({
    cookies: [{ name: 'sessionid', value: 'x' }],
    autoReconnect: true,
    userAgent: 'test-agent'
  });
  assert.equal(typeof api.sendImage, 'function');
  assert.equal(typeof api.listenMqtt, 'function');
  assert.equal(typeof api.getThreadList, 'function');
  assert.equal(api.version, '1.0.0');
});
