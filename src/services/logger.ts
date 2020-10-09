import hl from 'utils/chalk'

enum LOG_TYPES {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

class Logger {
  private logType: string | number
  private _logger = console.log

  constructor() {
    this.logType = process.env.LOG_TYPE ?? LOG_TYPES.INFO
  }

  private pid = () => `[${process.pid}]`

  private time = () => {
    const now = new Date()

    return hl.warn(`[${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour12: false })}]`)
  }

  public setLogType(type: LOG_TYPES) {
    this.logType = type
  }

  public error(...messages: Array<any>) {
    if (this.logType >= LOG_TYPES.ERROR) {
      this._logger(this.time(), this.pid(), hl.error('[ERROR]'), ...messages)
    }
  }

  public warn(...messages: Array<any>) {
    if (this.logType >= LOG_TYPES.WARN) {
      this._logger(this.time(), this.pid(), hl.warn('[WARN]'), ...messages)
    }
  }

  public info(...messages: Array<any>) {
    if (this.logType >= LOG_TYPES.INFO) {
      this._logger(this.time(), this.pid(), hl.info('[INFO]'), ...messages)
    }
  }

  public debug(...messages: Array<any>) {
    if (this.logType >= LOG_TYPES.DEBUG) {
      this._logger(this.time(), this.pid(), hl.debug('[DEBUG]'), ...messages)
    }
  }
}

export default new Logger()
