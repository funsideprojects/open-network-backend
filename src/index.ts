import 'dotenv/config'
import { createServer } from 'http'
// import cluster from 'cluster'
// import { cpus } from 'os'

import { Logger, NetWorkManager } from 'services'
import { hl, getCorsOrigin } from 'utils'

import { createApolloServer } from '_apollo-server'
import { createApplication } from '_express'
import { mongooseConnect } from '_mongoose'

// * Process events
process.on('exit', (code) => {
  // ? Application specific logging, throwing an error, or other logic here
  Logger.error('Process exited with code:', code)
})

async function main() {
  // * Connect to database
  await mongooseConnect()

  // * Initialize application
  const app = createApplication()

  // ? Apollo Server
  const graphqlPath = '/gql'
  const apolloServer = createApolloServer(graphqlPath)
  apolloServer.applyMiddleware({
    app,
    path: graphqlPath,
    cors: {
      credentials: true,
      origin: getCorsOrigin(),
    },
  })

  // ? Start
  // const numCPUs = cpus().length

  // if (cluster.isMaster) {
  //   console.log(`Master ${process.pid} is running`)

  //   for (let i = 0; i < ; i++) {
  //     cluster.fork()
  //   }

  //   cluster.on('exit', (worker, code, signal) => {
  //     console.log(`Worker ${worker.process.pid} terminated`)
  //   })
  // } else {
  // ? Create http server and add subscriptions to it
  const httpServer = createServer(app)
  apolloServer.installSubscriptionHandlers(httpServer)

  // ? Listen to HTTP and WebSocket server
  const { PORT, NODE_ENV } = process.env
  httpServer.listen({ port: PORT }, () => {
    Logger.info(
      `[Express] Server ready at ${
        NODE_ENV === 'development' ? hl.success(`http://${NetWorkManager.ip}:${PORT!}`) : `port ${PORT}`
      }`
    )
  })
  // }
}

main()
