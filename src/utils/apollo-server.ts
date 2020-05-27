import { join } from 'path'
import { PubSub } from 'apollo-server'
import { ApolloServer } from 'apollo-server-express'
import { fileLoader, mergeTypes } from 'merge-graphql-schemas'

import { ERROR_TYPES } from 'constants/Errors'
import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { schemaDirectives } from 'directives'
import models, { IModels } from 'models'
import resolvers from 'resolvers'
import * as hl from 'utils/chalk'
import { checkAuthorization, IDecodedToken } from 'utils/jwt'
import Logger from 'utils/logger'

// *_: Interface
export interface IContext extends IModels {
  authUser: IDecodedToken
  ERROR_TYPES: typeof ERROR_TYPES
}

export interface ISubscriptionContext {
  authUser: IDecodedToken
  ERROR_TYPES: typeof ERROR_TYPES
}

// *_: Export pubSub instance for publishing events
export const pubSub = new PubSub()

const typeDefs = mergeTypes(fileLoader(join(__dirname, `/../schema/**/*.gql`)), { all: true })

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

      Logger.error(`[From Apollo]: `, err)

      // Otherwise return the original error.  The error can also
      // be manipulated in other ways, so long as it's returned.
      return err
    },
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
      onConnect: async (connectionParams: any, _webSocket) => {
        // *: Check if user is authenticated
        if (connectionParams.authorization) {
          const authUser = await checkAuthorization(connectionParams.authorization)

          Logger.debug(hl.success('[Connected User]:'), authUser!.fullName, +new Date())

          // *: Publish user isOnline true
          pubSub.publish(IS_USER_ONLINE, {
            isUserOnline: {
              userId: authUser!.id,
              isOnline: true,
              lastActiveAt: +new Date(),
            },
          })

          // Add authUser to socket's context, so we have access to it, in onDisconnect method
          return { authUser }
        }
      },
      onDisconnect: async (_webSocket, context) => {
        // *: Get socket's context
        const subscriptionContext: ISubscriptionContext = await context.initPromise
        if (subscriptionContext && subscriptionContext.authUser) {
          Logger.debug(
            hl.error('[Disconnected User]:'),
            subscriptionContext.authUser!.fullName,
            +new Date()
          )
          // *: Publish user isOnline false
          pubSub.publish(IS_USER_ONLINE, {
            isUserOnline: {
              userId: subscriptionContext.authUser.id,
              isOnline: false,
              lastActiveAt: +new Date(),
            },
          })

          // Update user isOnline and lastActiveAt
          await models.User.findByIdAndUpdate(subscriptionContext.authUser.id, {
            isOnline: false,
            lastActiveAt: new Date(),
          })
        }
      },
    },
  })
}
