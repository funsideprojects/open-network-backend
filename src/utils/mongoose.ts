import * as mongoose from 'mongoose'

import * as hl from 'utils/chalk'
import Logger from 'utils/logger'

export async function connectMongoDB(mongoUrl: string) {
  mongoose.set('useCreateIndex', true)

  return await mongoose
    .connect(mongoUrl, {
      useNewUrlParser: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
    })
    .then(() => {
      Logger.log(`Database connected (URL: ${hl.success(mongoUrl)})`)
    })
    .catch((err) => {
      Logger.error(hl.error(`Database connection: ${err.message}`))
      process.exit(0)
    })
}
