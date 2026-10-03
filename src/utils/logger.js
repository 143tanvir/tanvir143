'use strict';

/**
 * Maintainer: Tanvir Ahmed
 * WhatsApp: wa.me/+8801750079773
 * GitHub: www.github.com/143tanvir
 * Instagram: @ig.tanvir_ahmed
 */

/**
 * @license MIT
 */

const LEVEL_NUM = { silent: -1, error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5 };

let _globalLevel = 'warn';

class Logger {
  constructor(prefix, level) {
    // Backward-compat: if prefix is an options object {level, prefix}
    if (prefix && typeof prefix === 'object') {
      const opts = prefix;
      this.prefix = opts.prefix || 'tanvir143';
      if (opts.level) _globalLevel = opts.level;
    } else {
      this.prefix = prefix || 'tanvir143';
      if (level) _globalLevel = level;
    }
  }

  setLevel(level) {
    _globalLevel = level;
  }

  _enabled(level) {
    return (LEVEL_NUM[level] ?? 99) <= (LEVEL_NUM[_globalLevel] ?? 1);
  }

  _format(level, msg, args) {
    const extra = args.length
      ? ' ' + args.map(a =>
          a instanceof Error ? a.message
          : typeof a === 'object' ? JSON.stringify(a)
          : String(a)
        ).join(' ')
      : '';
    return `[${this.prefix}] ${msg}${extra}`;
  }

  error(msg, ...args) {
    if (this._enabled('error')) console.error(this._format('error', msg, args));
  }

  warn(msg, ...args) {
    if (this._enabled('warn')) console.warn(this._format('warn', msg, args));
  }

  info(msg, ...args) {
    if (this._enabled('info')) console.log(this._format('info', msg, args));
  }

  verbose(msg, ...args) {
    if (this._enabled('verbose')) console.log(this._format('verbose', msg, args));
  }

  silly(msg, ...args) {
    if (this._enabled('silly')) console.log(this._format('silly', msg, args));
  }
}

const nkxicaLog = new Logger('tanvir143');
const mqttLog   = new Logger('MQTT');

function getLogger(namespace) {
  const ns = (namespace || '').toLowerCase();
  if (ns.includes('mqtt')) return mqttLog;
  return nkxicaLog;
}

function setGlobalLevel(level) {
  _globalLevel = level;
}

module.exports = Logger;
module.exports.getLogger      = getLogger;
module.exports.setGlobalLevel = setGlobalLevel;
module.exports.nkxicaLog      = nkxicaLog;
module.exports.mqttLog        = mqttLog;
