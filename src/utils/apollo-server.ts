import { ApolloServer } from 'apollo-server-express'
import { PubSub } from 'apollo-server'

import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { IModels } from 'models'
import { checkAuthorization, IDecodedToken } from 'utils/jwt'
import { highlight } from 'utils/chalk'

// *_: Interface
export interface IContext extends IModels {
  authUser: IDecodedToken
}

export interface ISubscriptionContext {
  authUser: IDecodedToken
}

// *_: Export pubSub instance for publishing events
export const pubSub = new PubSub()

/**
 * *: Creates an Apollo server and identifies if user is authenticated or not
 *
 * @param {obj} schema GraphQL Schema
 * @param {array} resolvers GraphQL Resolvers
 * @param {obj} models Mongoose Models
 */
export function createApolloServer(typeDefs, resolvers, models: IModels) {
  return new ApolloServer({
    uploads: {
      maxFileSize: 10000000, // 10 MB
      maxFiles: 20,
    },
    typeDefs,
    resolvers,
    context: async ({ req, connection }) => {
      if (connection) return connection.context

      let authUser
      if (req.headers.authorization !== 'null') {
        const user = await checkAuthorization(req.headers.authorization!)
        if (user) authUser = user
      }

      return Object.assign({ authUser }, models)
    },
    subscriptions: {
      onConnect: async (connectionParams: any, _webSocket) => {
        // *: Check if user is authenticated
        if (connectionParams.authorization) {
          const authUser = await checkAuthorization(connectionParams.authorization)

          console.log(highlight(0, '[Connected User]:'), authUser!.fullName, +new Date())

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
          console.log(
            highlight(3, '[Disconnected User]:'),
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
            lastActiveAt: new Date().toDateString(),
          })
        }
      },
    },
  })
}
