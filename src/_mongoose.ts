import * as mongoose from 'mongoose'

import { Logger, hl } from 'utils'

export async function mongooseConnect() {
  mongoose.set('useCreateIndex', true)

  const { MONGO_URL } = process.env

  return await mongoose
    .connect(MONGO_URL, {
      useNewUrlParser: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
    })
    .then(() => {
      Logger.info(`[Service] [Mongoose] Database connected (URL: ${hl.success(MONGO_URL)})`)
    })
    .catch((err) => {
      Logger.error(`[Service] [Mongoose] ${err.message}`)
      process.exit(0)
    })
}
