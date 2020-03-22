import { ApolloServer } from 'apollo-server-express'
import { PubSub } from 'apollo-server'

import { checkAuthorization, IDecodedToken } from './jwt'
import { IModels } from '../models'
import { IS_USER_ONLINE } from '../constants/Subscriptions'

// *_: Interface

export interface IContext extends IModels {
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
          const user = await checkAuthorization(connectionParams.authorization)

          // *: Publish user isOnline true
          pubSub.publish(IS_USER_ONLINE, {
            isUserOnline: {
              userId: user!.id,
              isOnline: true
            }
          })

          // Add authUser to socket's context, so we have access to it, in onDisconnect method
          return { authUser: user }
        }
      },
      onDisconnect: async (_webSocket, context) => {
        // *: Get socket's context
        const subscriptionContext = await context.initPromise
        if (subscriptionContext && subscriptionContext.authUser) {
          // *: Publish user isOnline false
          pubSub.publish(IS_USER_ONLINE, {
            isUserOnline: {
              userId: subscriptionContext.authUser.id,
              isOnline: false
            }
          })

          // Update user isOnline to false in DB
          await models.User.findOneAndUpdate(
            { email: subscriptionContext.authUser.email },
            { isOnline: false }
          )
        }
      }
    }
  })
}
