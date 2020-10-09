import { sync as mkdirSync } from 'mkdirp'
import { existsSync } from 'fs'
import { Tail } from 'tail'

import { Logger } from 'services'

export function startWatching(publishChanges: (line: string) => void = () => {}) {
  const logDir = process.env.PM2_LOG_DIR || './logs'
  const logFilename = process.env.PM2_LOGS_FILENAME || 'console.log'

  mkdirSync(logDir)

  if (!existsSync(`${logDir}/${logFilename}`)) {
    Logger.error(`Log file not found for ${logDir}/${logFilename}`)
  } else {
    const tail = new Tail(`${logDir}/${logFilename}`)
    tail.watch()
    tail.on('line', (data) => {
      publishChanges(data)
    })
    tail.on('error', () => {
      process.exit(0)
    })
  }
}
