import * as mongoose from 'mongoose'

import { highlight } from './chalk'

export async function connectMongoDB(mongoUrl: string) {
  mongoose.set('useCreateIndex', true)

  return await mongoose
    .connect(mongoUrl, {
      useNewUrlParser: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log(`${highlight(0, '✓')} Database connected (URL: ${highlight(0, mongoUrl)})`)
    })
    .catch((err) => {
      console.log(highlight(3, `Database connection: ${err.message}`))
      process.exit(0)
    })
}
