import { join } from 'path'
import { Request } from 'express'
import { PubSub } from 'apollo-server'
import * as depthLimit from 'graphql-depth-limit'
import { ApolloServer, ApolloError } from 'apollo-server-express'
import { fileLoader, mergeTypes } from 'merge-graphql-schemas'
import 'apollo-cache-control'

import { HTTP_STATUS_CODE, ERROR_MESSAGE } from 'constants/Errors'
import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { schemaDirectives } from 'directives'
import * as models from 'models'
import resolvers from 'resolvers'
import { Logger, ConnectionManager } from 'services'
import { hl } from 'utils'

import { mongooseConnection, ConnectionStates } from '_mongoose'
import { UserPayload, verifyToken } from '_jsonwebtoken'
import { serverTimezoneOffset } from 'constants/Date'

// ? Interface
type IModels = typeof models
export interface IContext extends IModels {
  authUser?: UserPayload
  HTTP_STATUS_CODE: typeof HTTP_STATUS_CODE
  ERROR_MESSAGE: typeof ERROR_MESSAGE
  req: Request
}

export interface ISubscriptionContext {
  authUser: UserPayload
  connectionId: string
}

// ? Create pubSub instance for publishing events
export const pubSub = new PubSub()

// ? Merge Graphql schema
const typeDefs = mergeTypes(fileLoader(join(__dirname, `/schema/**/*.gql`)), { all: true })

export function createApolloServer(graphqlPath: string) {
  return new ApolloServer({
    uploads: {
      maxFileSize: 5 * 1000 * 1000, // ? 5 MB
      maxFiles: 20,
    },
    typeDefs,
    resolvers,
    cacheControl: {
      defaultMaxAge: 0,
    },
    playground: {
      settings: {
        'request.credentials': 'include',
      },
    },
    validationRules: [depthLimit(6)],
    plugins: [
      {
        serverWillStart(e) {
          Logger.info(`[Apollo Server] Ready at ${hl.success(graphqlPath)}`)
        },
        requestDidStart(_requestContext) {
          return {
            // didResolveSource(reqContext) {},
            // parsingDidStart(reqContext) {},
            // validationDidStart(reqContext) {},
            // didResolveOperation(reqContext) {},
            // responseForOperation(reqContext) {},
            // executionDidStart(reqContext) {},
            // didEncounterErrors() {},
            // willSendResponse(reqContext) {},
          }
        },
      },
    ],
    schemaDirectives,
    debug: process.env.NODE_ENV === 'development',
    formatError: (error) => {
      const errorCode = error.extensions?.code

      // Logger.debug(
      //   `[Apollo Server]\r\n`,
      //   `[${error.path}]: {\r\n`,
      //   ` Code: ${errorCode || 'unknown'},\r\n `,
      //   hl.error(error.extensions?.exception?.stacktrace.join('\r\n'))
      // )

      if (errorCode === 'INTERNAL_SERVER_ERROR') {
        if (mongooseConnection.readyState === ConnectionStates.disconnected) {
          // ? Error occurred due to database connection lost
          return {
            extensions: { code: HTTP_STATUS_CODE['Service Unavailable'] },
            message: ERROR_MESSAGE['Service Unavailable'],
          }
        }

        return {
          extensions: { code: HTTP_STATUS_CODE['Internal Server Error'] },
          message: process.env.NODE_ENV === 'development' ? error.message : ERROR_MESSAGE['Internal Server Error'],
        }
      }

      // ! Don't give the specific errors to the client.
      return {
        extensions: { code: errorCode },
        message: error.message,
      }
    },
    context: async ({ req, connection }) => {
      // ? Subscription
      if (connection) return connection.context

      // ? Queries / Mutations
      return Object.assign({}, models, { HTTP_STATUS_CODE, ERROR_MESSAGE }, { req })
    },
    subscriptions: {
      path: graphqlPath,
      onConnect: async (connectionParams, _webSocket) => {
        if (connectionParams['authorization']) {
          const authUser = verifyToken(connectionParams['authorization'])

          // ? Throw error if token is invalid
          if (!authUser) {
            throw new ApolloError('Unauthorized', HTTP_STATUS_CODE.Unauthorized)
          }

          const now = new Date(Date.now() + serverTimezoneOffset)

          // * Update connection manager
          const connectionId = ConnectionManager.addConnection(authUser.id, 'device X')
          const userConnections = ConnectionManager.userConnections(authUser.id).length

          // todo - Create session
          // new models.UserSession({
          //   userId: authUser.id,
          //   connectionId,
          //   connectedAt: now,
          //   userAgent: _webSocket['upgradeReq']['headers']['user-agent'],
          // }).save(),

          // ? If user have no connection at the moment
          if (!userConnections) {
            // * Update user status
            await models.User.findByIdAndUpdate(authUser.id, { online: true })

            // * Publish user status
            pubSub.publish(IS_USER_ONLINE, {
              isUserOnline: {
                userId: authUser.id,
                online: true,
                lastActiveAt: now,
              },
            })
          }

          Logger.debug('[Apollo Server]', hl.success('[User Connected]'), authUser.id, authUser.username)

          // ? Add authUser to socket's context, so we have access to it, in onDisconnect method
          return { authUser, connectionId }
        }
      },
      onDisconnect: async (_webSocket, context) => {
        // * Get socket's context
        const subscriptionContext: ISubscriptionContext = await context.initPromise
        if (subscriptionContext?.authUser && subscriptionContext?.connectionId) {
          const { authUser, connectionId } = subscriptionContext
          const now = new Date(Date.now() + serverTimezoneOffset)

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
              online: false,
              lastActiveAt: now,
            })

            // * Publish user status
            await pubSub.publish(IS_USER_ONLINE, {
              isUserOnline: {
                userId: authUser.id,
                online: false,
                lastActiveAt: now,
              },
            })
          }

          Logger.debug('[Apollo Server]', hl.error('[User Disconnected]'), authUser.id, authUser.username)
        }
      },
    },
  })
}
