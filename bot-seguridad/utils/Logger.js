export default class Logger {
  constructor(name) {
    this.name = name;
  }

  _log(level, ...args) {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}] [${this.name}]`;
    console.log(prefix, ...args);
  }

  debug(...args) { this._log('debug', ...args); }
  info(...args) { this._log('info', ...args); }
  warn(...args) { this._log('warn', ...args); }
  error(...args) { this._log('error', ...args); }
}
