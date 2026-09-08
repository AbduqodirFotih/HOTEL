/**
 * logger.js
 * --------------------------------------------------------------------------
 * Soddalashtirilgan, lekin tuzilgan jurnal yozuvchisi. Barcha servislar
 * bir xil format orqali yozadi. Vaqt belgisi, daraja va kontekst.
 * --------------------------------------------------------------------------
 */

'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const COLORS = {
  debug: '\x1b[90m', // kulrang
  info: '\x1b[36m',  // moviy
  warn: '\x1b[33m',  // sariq
  error: '\x1b[31m', // qizil
  reset: '\x1b[0m',
};

// LOG_LEVEL muhit o'zgaruvchisi orqali boshqarish mumkin
const currentLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;

function fmt(level, args) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const color = COLORS[level] || '';
  const reset = COLORS.reset;
  const tag = `${color}[${level.toUpperCase()}]${reset}`;
  return [`${ts} ${tag}`, ...args];
}

function makeLogger(level) {
  return function (...args) {
    if (LEVELS[level] < currentLevel) return;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(...fmt(level, args));
  };
}

module.exports = {
  debug: makeLogger('debug'),
  info: makeLogger('info'),
  warn: makeLogger('warn'),
  error: makeLogger('error'),
};
