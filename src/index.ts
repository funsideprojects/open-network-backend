import 'dotenv/config'
import * as express from 'express'
import { createServer } from 'http'
import * as cors from 'cors'

import models from 'models'
import { createApolloServer } from 'utils/apollo-server'
import { success } from 'utils/chalk'
import { connectMongoDB } from 'utils/mongoose'
import Logger from 'utils/logger'

// * Process events
process.on('exit', (code) => {
  // Application specific logging, throwing an error, or other logic here
  Logger.error('Process exited with code: ', code)
})

async function main() {
  // * Connect to database
  if (!process.env.MONGO_URL) throw new Error(`Missing environment variable: MONGO_URL`)
  await connectMongoDB(process.env.MONGO_URL).then(async () => {
    await models.User.updateMany({}, { $set: { isOnline: false } })
  })

  // * Initializes application
  const app = express()

  if (process.env.NODE_ENV === 'development') {
    app.use(express.static('uploads'))
  }

  // * Enable cors
  if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
    app.use(
      cors({
        origin: process.env.FRONTEND_URL,
        credentials: true,
      })
    )
  }

  // * Create a Apollo Server
  const server = createApolloServer()
  server.applyMiddleware({ app, path: '/graphql' })

  // * Create http server and add subscriptions to it
  const httpServer = createServer(app)
  server.installSubscriptionHandlers(httpServer)

  // ? Listen to HTTP and WebSocket server
  const PORT = process.env.PORT || process.env.API_PORT
  httpServer.listen({ port: PORT }, () => {
    if (process.env.NODE_ENV === 'development') {
      Logger.log(`Server ready at ${success(`http://localhost:${PORT!}${server.graphqlPath}`)}`)
    } else Logger.log(`Server is ready at port ${PORT}`)
  })
}

main()
