import hl from 'utils/chalk'

enum LOG_TYPES {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

class Logger {
  private _logType: string | number
  private _logger = console.log

  constructor() {
    this._logType = process.env.LOG_TYPE ?? LOG_TYPES.INFO
  }

  public get time() {
    const now = new Date()

    return hl.warn(`[${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour12: false })}]`)
  }

  public get pid() {
    return `[${process.pid}]`
  }

  public get prefixes() {
    return `${this.time} ${this.pid}`
  }

  private get logType() {
    return this._logType
  }

  public setLogType(type: LOG_TYPES) {
    this._logType = type
  }

  public error(...messages: Array<any>) {
    if (this.logType >= LOG_TYPES.ERROR) {
      this._logger(this.prefixes, hl.error('[ERROR]'), ...messages)
    }
  }

  public warn(...messages: Array<any>) {
    if (this.logType >= LOG_TYPES.WARN) {
      this._logger(this.prefixes, hl.warn('[WARN]'), ...messages)
    }
  }

  public info(...messages: Array<any>) {
    if (this.logType >= LOG_TYPES.INFO) {
      this._logger(this.prefixes, hl.info('[INFO]'), ...messages)
    }
  }

  public debug(...messages: Array<any>) {
    if (this.logType >= LOG_TYPES.DEBUG) {
      this._logger(this.prefixes, hl.debug('[DEBUG]'), ...messages)
    }
  }
}

export default new Logger()
