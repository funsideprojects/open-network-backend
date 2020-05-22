import * as chalk from 'chalk'

const LOG_TYPES = {
  NONE: 0,
  ERROR: 1,
  NORMAL: 2,
  DEBUG: 3,
}

const logType = (process.env.LOG_TYPE && +process.env.LOG_TYPE) || LOG_TYPES.NORMAL

const logTime = () => {
  const now = new Date()

  return `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour12: false })}`
}

const log = (...args) => {
  if (logType < LOG_TYPES.NORMAL) return
  console.log(logTime(), process.pid, chalk.greenBright.bold('[INFO]'), ...args)
}

const error = (...args) => {
  if (logType < LOG_TYPES.ERROR) return
  console.log(logTime(), process.pid, chalk.redBright.bold('[ERROR]'), ...args)
}

const debug = (...args) => {
  if (logType < LOG_TYPES.DEBUG) return
  console.log(logTime(), process.pid, chalk.blueBright.bold('[DEBUG]'), ...args)
}

export default { log, error, debug }
