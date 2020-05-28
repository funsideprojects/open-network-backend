import { join } from 'path'
import { PubSub } from 'apollo-server'
import { createError } from 'apollo-errors'
import { ApolloServer } from 'apollo-server-express'
import { fileLoader, mergeTypes } from 'merge-graphql-schemas'
import { v1 } from 'uuid'

import { ERROR_TYPES } from 'constants/Errors'
import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { schemaDirectives } from 'directives'
import models, { IModels } from 'models'
import resolvers from 'resolvers'
import * as hl from 'utils/chalk'
import { checkAuthorization, IDecodedToken } from 'utils/jwt'
import Logger from 'utils/logger'
import { connectionCache } from 'utils/mnemonist'

// *_: Interface
export interface IContext extends IModels {
  authUser: IDecodedToken
  ERROR_TYPES: typeof ERROR_TYPES
}

export interface ISubscriptionContext {
  authUser: IDecodedToken
  connectionId: string
  ERROR_TYPES: typeof ERROR_TYPES
}

// *_: Export pubSub instance for publishing events
export const pubSub = new PubSub()

const typeDefs = mergeTypes(fileLoader(join(__dirname, `/../schema/**/*.gql`)), { all: true })

// *: Hide apollo schema from the outside
const ForbiddenError = createError('ForbiddenError', { message: 'Forbidden' })
function NoIntrospection(context) {
  return {
    Field(node) {
      const nodeValue = node.name.value
      if (nodeValue === '__schema' || nodeValue === '__type') {
        context.reportError(new ForbiddenError())
      }
    },
  }
}

export function createApolloServer() {
  return new ApolloServer({
    uploads: {
      maxFileSize: 10 * 1000 * 1000, // 10 MB
      maxFiles: 20,
    },
    typeDefs,
    resolvers,
    schemaDirectives,
    formatError: (err) => {
      // Don't give the specific errors to the client.
      if (
        err.path &&
        err.path[0] === 'getAuthUser' &&
        err.message === ERROR_TYPES.UNAUTHENTICATED
      ) {
        return new Error('')
      }

      Logger.error(`[ApolloError]: `, err)

      return err
    },
    validationRules: [],
    context: async ({ req, connection }) => {
      if (connection) return connection.context

      let authUser
      if (req.headers.authorization !== 'null') {
        const user = await checkAuthorization(req.headers.authorization!)
        if (user) authUser = user
      }

      return Object.assign({ authUser }, models, { ERROR_TYPES })
    },
    subscriptions: {
      onConnect: async (connectionParams, _webSocket) => {
        // *: Check if user is authenticated
        if (connectionParams['authorization']) {
          const authUser = await checkAuthorization(connectionParams['authorization'])
          let connectionId

          if (authUser) {
            connectionId = v1()

            // *: Logger
            Logger.debug(hl.success('[Connected User]:'), authUser.fullName)

            // *: Caching connection
            const hasConnection = connectionCache.get(authUser.id)

            if (!!hasConnection) {
              // If user has connected somewhere else
              connectionCache.set(authUser.id, hasConnection + 1)
            } else {
              // If it's not
              connectionCache.set(authUser.id, 1)

              // *: Publish user isOnline true
              pubSub.publish(IS_USER_ONLINE, {
                isUserOnline: {
                  userId: authUser.id,
                  isOnline: true,
                  lastActiveAt: +new Date(),
                },
              })
            }

            await Promise.all([
              // Update user online
              models.User.findByIdAndUpdate(authUser.id, { isOnline: true }),
              // Create session
              new models.UserSession({
                userId: authUser.id,
                connectionId,
                connectedAt: new Date(),
                userAgent: _webSocket['upgradeReq']['headers']['user-agent'],
              }).save(),
            ])
          } else {
            Logger.error(hl.error('[Subscription][onConnect]:'), 'Unknown connection detected')
          }

          // Add authUser to socket's context, so we have access to it, in onDisconnect method
          return { authUser, connectionId }
        }
      },
      onDisconnect: async (_webSocket, context) => {
        // *: Get socket's context
        const subscriptionContext: ISubscriptionContext = await context.initPromise
        if (
          subscriptionContext &&
          subscriptionContext.authUser &&
          subscriptionContext.connectionId
        ) {
          Logger.debug(hl.error('[Disconnected User]:'), subscriptionContext.authUser!.fullName)

          const now = new Date()

          // *: Connection cache
          const hasConnection = connectionCache.get(subscriptionContext.authUser.id)

          if (!!hasConnection && hasConnection > 1) {
            // If user still having other connections somewhere else
            connectionCache.set(subscriptionContext.authUser.id, hasConnection - 1)
          } else {
            // If it's not, then it's a fully disconnected
            connectionCache.set(subscriptionContext.authUser.id, 0)

            // *: Publish user isOnline false
            pubSub.publish(IS_USER_ONLINE, {
              isUserOnline: {
                userId: subscriptionContext.authUser.id,
                isOnline: false,
                lastActiveAt: now,
              },
            })

            // Update user isOnline and lastActiveAt
            await models.User.findByIdAndUpdate(subscriptionContext.authUser.id, {
              isOnline: false,
              lastActiveAt: now,
            })
          }

          // for (const [userId, connectionCount] of connectionCache) {
          //   console.log(userId, connectionCount, `FULLY DISCONNECTED: ${!connectionCount}`)
          // }

          // Update session
          await models.UserSession.findOneAndUpdate(
            { connectionId: subscriptionContext.connectionId },
            { $set: { disconnectedAt: now } }
          )
        }
      },
    },
  })
}
