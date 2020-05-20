import 'dotenv/config'
import * as express from 'express'
import { createServer } from 'http'
import * as cors from 'cors'
import { join } from 'path'
import { fileLoader, mergeTypes } from 'merge-graphql-schemas'

import { highlight } from './utils/chalk'
import { createApolloServer } from './utils/apollo-server'
import { connectMongoDB } from './utils/mongoose'

import models from './models'
import resolvers from './resolvers'
import { schemaDirectives } from './directives'

// *_: Process events
process.on('exit', (code) => {
  // Application specific logging, throwing an error, or other logic here
  console.log('Process exited with code: ', code)
})

async function main() {
  // *_: Connect to database
  if (!process.env.MONGO_URL) throw new Error(`Missing environment variable: MONGO_URL`)
  await connectMongoDB(process.env.MONGO_URL)

  // *_: Initializes application
  const app = express()

  app.use(express.static('uploads'))

  // *_: Enable cors
  if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
    app.use(
      cors({
        origin: process.env.FRONTEND_URL,
        credentials: true,
      })
    )
  }

  // *_: Create a Apollo Server
  const typeDefs = mergeTypes(fileLoader(join(__dirname, `/schema/**/*.gql`)), { all: true })

  const server = createApolloServer(typeDefs, resolvers, schemaDirectives, models)
  server.applyMiddleware({ app, path: '/graphql' })

  // *__: Create http server and add subscriptions to it
  const httpServer = createServer(app)
  server.installSubscriptionHandlers(httpServer)

  // *__: Listen to HTTP and WebSocket server
  const PORT = process.env.PORT || process.env.API_PORT
  httpServer.listen({ port: PORT }, () => {
    if (!!process.env.MORE_INFO) {
      console.log(`
Platform                : ${process.platform}
Processor architecture  : ${process.arch}
pid                     : ${highlight(1, `${process.pid}`)}
Current directory       : ${process.cwd()}`)
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`
Server ready at ${highlight(0, `http://localhost:${PORT!}${server.graphqlPath}`)}
Subscriptions ready at ${highlight(0, `ws://localhost:${PORT!}${server.subscriptionsPath}`)}
`)
    } else console.log(`Server is ready`)
  })
}

main()
