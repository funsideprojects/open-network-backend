import 'dotenv/config'
import * as express from 'express'
import * as cors from 'cors'
import { createServer } from 'http'

import models from 'models'
import { Logger } from 'services'
import { hl } from 'utils'

import { createApolloServer } from '_apollo-server'
import { mongooseConnect } from '_mongoose'

// * Process events
process.on('exit', (code) => {
  // ? Application specific logging, throwing an error, or other logic here
  Logger.error('Process exited with code: ', code)
})

async function main() {
  // * Connect to database
  await mongooseConnect().then(async () => {
    await models.User.updateMany({}, { $set: { isOnline: false } })
  })

  // * Initialize application
  const app = express()

  if (process.env.NODE_ENV === 'development') {
    app.use(express.static('uploads'))
  }

  // * Enable cors
  if (process.env.CORS_ORIGIN) {
    app.use(
      cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true,
      })
    )
  }

  // * Create a Apollo Server
  const apolloServer = createApolloServer()
  apolloServer.applyMiddleware({ app, path: '/graphql' })

  // * Create http server and add subscriptions to it
  const httpServer = createServer(app)
  apolloServer.installSubscriptionHandlers(httpServer)

  // * Listen to HTTP and WebSocket server
  const PORT = process.env.PORT || process.env.API_PORT
  httpServer.listen({ port: PORT }, () => {
    if (process.env.NODE_ENV === 'development') {
      Logger.info(`Server ready at ${hl.success(`http://localhost:${PORT!}${apolloServer.graphqlPath}`)}`)
    } else Logger.info(`Server is ready at port ${PORT}`)
  })
}

main()
