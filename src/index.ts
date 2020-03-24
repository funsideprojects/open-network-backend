import 'dotenv/config'
import * as express from 'express'
import { createServer } from 'http'
import * as mongoose from 'mongoose'
import * as cors from 'cors'
import { join } from 'path'
import { fileLoader, mergeTypes } from 'merge-graphql-schemas'

import { highlight } from './utils/chalk'
import models from './models'
import resolvers from './resolvers'
import { createApolloServer } from './utils/apollo-server'

// *_: Process events

process.on('exit', (code) => {
  // Application specific logging, throwing an error, or other logic here
  console.log('Process exited with code: ', code)
})

// *_: Connect to database
mongoose.set('useCreateIndex', true)
mongoose
  .connect(process.env.MONGO_URL!, {
    useNewUrlParser: true,
    useFindAndModify: false,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log(
      `${highlight(0, '✓')} Database connected (URL: ${highlight(0, process.env.MONGO_URL!)})`
    )
  })
  .catch((err) => {
    console.log(highlight(3, `Database connection: ${err.message}`))
    process.exit(0)
  })

// *_: Initializes application
const app = express()

// *_: Enable cors
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
  })
)

// *_: Create a Apollo Server
const typeDefs = mergeTypes(fileLoader(join(__dirname, `/schema/**/*.gql`)), { all: true })

const server = createApolloServer(typeDefs, resolvers, models)
server.applyMiddleware({ app, path: '/graphql' })

// *__: Create http server and add subscriptions to it
const httpServer = createServer(app)
server.installSubscriptionHandlers(httpServer)

// *__: Listen to HTTP and WebSocket server
const PORT = process.env.PORT || process.env.API_PORT
httpServer.listen({ port: PORT }, () => {
  if (!!process.env.MORE_INFO)
    console.log(`
Platform                : ${process.platform}
Processor architecture  : ${process.arch}
pid                     : ${highlight(1, `${process.pid}`)}
Current directory       : ${process.cwd()}`)

  if (process.env.NODE_ENV === 'development')
    console.log(`
Server ready at http://localhost:${highlight(0, PORT!)}${server.graphqlPath}
Subscriptions ready at ws://localhost:${highlight(0, PORT!)}${server.subscriptionsPath}
`)
  else console.log(`Server is ready`)
})
