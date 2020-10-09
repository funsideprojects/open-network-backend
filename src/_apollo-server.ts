import { join } from 'path'
import { PubSub, AuthenticationError } from 'apollo-server'
import * as depthLimit from 'graphql-depth-limit'
import { ApolloServer } from 'apollo-server-express'
import { fileLoader, mergeTypes } from 'merge-graphql-schemas'

import { ERROR_TYPES } from 'constants/Errors'
import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { schemaDirectives } from 'directives'
import models, { IModels } from 'models'
import resolvers from 'resolvers'
import { Logger, ConnectionManager } from 'services'
import { hl } from 'utils'

import { IDecodedToken, verifyToken } from '_jsonwebtoken'

// ? Interface
export interface IContext extends IModels {
  authUser: IDecodedToken
  ERROR_TYPES: typeof ERROR_TYPES
}

export interface ISubscriptionContext {
  authUser: IDecodedToken
  connectionId: string
  ERROR_TYPES: typeof ERROR_TYPES
}

// ? Create pubSub instance for publishing events
export const pubSub = new PubSub()

// ? Merge Graphql schema
const typeDefs = mergeTypes(fileLoader(join(__dirname, `/schema/**/*.gql`)), { all: true })

export function createApolloServer() {
  return new ApolloServer({
    uploads: {
      maxFileSize: 5 * 1000 * 1000, // ? 5 MB
      maxFiles: 20,
    },
    typeDefs,
    resolvers,
    validationRules: [depthLimit(6)],
    schemaDirectives,
    debug: process.env.NODE_ENV === 'development',
    formatError: (err) => {
      // ! Don't give the specific errors to the client.
      if (err.path && err.path[0] === 'getAuthUser' && err.message === ERROR_TYPES.UNAUTHENTICATED) {
        return new Error('')
      }

      Logger.error(`[Apollo Server]`, err)

      return err
    },
    context: async ({ req, connection }) => {
      // ? Subscription
      if (connection) return connection.context

      // ? Query / Mutation
      let authUser: ReturnType<typeof verifyToken>
      if (req.headers.authorization && req.headers.authorization !== 'null') {
        authUser = verifyToken(req.headers.authorization)
      }

      return Object.assign({ authUser }, models, { ERROR_TYPES })
    },
    subscriptions: {
      onConnect: async (connectionParams, _webSocket) => {
        if (connectionParams['authorization']) {
          const authUser = verifyToken(connectionParams['authorization'])

          // ? Throw error if token is invalid
          if (!authUser) throw new Error(ERROR_TYPES.UNAUTHENTICATED)

          const now = new Date().toUTCString()

          // * Update connection manager
          const connectionId = ConnectionManager.addConnection(authUser.id, 'x')
          const userConnections = ConnectionManager.userConnections(authUser.id).length

          // todo - Create session
          // new models.UserSession({
          //   userId: authUser.id,
          //   connectionId,
          //   connectedAt: new Date(),
          //   userAgent: _webSocket['upgradeReq']['headers']['user-agent'],
          // }).save(),

          // ? If user have no connection at the moment
          if (!userConnections) {
            // * Update user status
            await models.User.findByIdAndUpdate(authUser.id, { isOnline: true })

            // * Publish user status
            pubSub.publish(IS_USER_ONLINE, {
              isUserOnline: {
                userId: authUser.id,
                isOnline: true,
                lastActiveAt: now,
              },
            })
          }

          Logger.debug(hl.success('[Apollo Server] [User Connected]'), authUser.id, authUser.username)

          // ? Add authUser to socket's context, so we have access to it, in onDisconnect method
          return { authUser, connectionId }
        }
      },
      onDisconnect: async (_webSocket, context) => {
        // * Get socket's context
        const subscriptionContext: ISubscriptionContext = await context.initPromise
        if (subscriptionContext?.authUser && subscriptionContext?.connectionId) {
          const { authUser, connectionId } = subscriptionContext
          const now = new Date().toUTCString()

          // * Update connection manager
          ConnectionManager.removeConnection(authUser.id, connectionId)
          const userConnections = ConnectionManager.userConnections(authUser.id).length

          // todo - Update session
          // await models.UserSession.findOneAndUpdate(
          //   { connectionId: subscriptionContext.connectionId },
          //   { $set: { disconnectedAt: now } }
          // )

          // ? If there's no remaining connection left
          if (!userConnections) {
            // * Update user status and lastActiveAt
            await models.User.findByIdAndUpdate(authUser.id, {
              isOnline: false,
              lastActiveAt: now,
            })

            // * Publish user status
            await pubSub.publish(IS_USER_ONLINE, {
              isUserOnline: {
                userId: authUser.id,
                isOnline: false,
                lastActiveAt: now,
              },
            })
          }

          Logger.debug(hl.success('[Apollo Server] [User Disconnected]'), authUser.id, authUser.username)
        }
      },
    },
  })
}
