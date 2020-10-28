import * as mongoose from 'mongoose'
import * as ora from 'ora'

import { Logger } from 'services'
import { hl } from 'utils'

export async function mongooseConnect() {
  const { MONGO_URL } = process.env

  if (!MONGO_URL) throw new Error('[Mongoose] Missing MONGO_URL')

  const spinner = ora({ spinner: 'dots', prefixText: Logger.prefixes })
  const prefix = `[Service] [Mongoose]`
  const affix = `(URL: ${hl.success(MONGO_URL)})`

  // ? Mongoose events
  mongoose.connection.once('connecting', () => {
    spinner.start(`${prefix} Connecting ${affix}`)
  })

  mongoose.connection.once('connected', () => {
    spinner.succeed(`${prefix} Connected ${affix}`)
  })

  mongoose.connection.on('reconnected', () => {
    spinner.succeed(`${prefix} ${hl.success('Reconnected')}`)
  })

  mongoose.connection.on('disconnected', () => {
    spinner.start(`${prefix} ${hl.warn('Disconnected. Attempting to reconnect')}`)
  })

  mongoose.connection.once('error', (err) => {
    spinner.fail(`${prefix} ${err.message}`)
    process.exit(0)
  })

  return await mongoose.connect(MONGO_URL, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true,
    keepAlive: true,
    keepAliveInitialDelay: 1000 * 60 * 30, // ? 30 mins
  })
}
