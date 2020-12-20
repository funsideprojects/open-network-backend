import mongoose from 'mongoose'

import { serverTimezoneOffset } from 'constants/Date'
import { User } from 'models'
import { Logger } from 'services'
import { hl } from 'utils'

export enum ConnectionStates {
  disconnected = 0,
  connected = 1,
  connecting = 2,
  disconnecting = 3,
  uninitialized = 99,
}

export const { connection: mongooseConnection } = mongoose

export async function mongooseConnect() {
  const { MONGO_URL } = process.env

  if (!MONGO_URL) throw new Error('[Mongoose] Missing MONGO_URL')

  const prefix = `[Mongoose]`
  const affix = `(URL: ${hl.success(MONGO_URL)})`

  // ? Mongoose events
  // mongoose.connection.once('connecting', () => {
  //   Logger.info(`${prefix} Connecting ${affix}`)
  // })

  mongoose.connection.once('connected', () => {
    Logger.info(`${prefix} Connected ${affix}`)
  })

  mongoose.connection.on('reconnected', () => {
    Logger.info(`${prefix} ${hl.success('Reconnected')}`)
  })

  mongoose.connection.on('disconnected', () => {
    Logger.info(`${prefix} ${hl.warn('Disconnected. Attempting to reconnect')}`)
  })

  mongoose.connection.once('error', (err) => {
    Logger.error(`${prefix} ${err.message}`)
    process.exit(0)
  })

  return await mongoose
    .connect(MONGO_URL, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
      keepAlive: true,
      keepAliveInitialDelay: 1000 * 60 * 30, // ? 30 mins
    })
    .then(async () => {
      // ? Update all user status
      const now = new Date(Date.now() + serverTimezoneOffset)
      await User.updateMany({ online: true }, { $set: { online: false, lastActiveAt: new Date() } })
    })
}
