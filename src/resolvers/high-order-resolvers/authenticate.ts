import { AuthenticationError } from 'apollo-server'
import { GraphQLResolveInfo } from 'graphql'
import { skip } from 'graphql-resolvers'

import { IContext } from '_apollo-server'

export function isAuthenticated(root: any, args: any, { authUser }: IContext, info: GraphQLResolveInfo) {
  return authUser ? skip : new AuthenticationError('Unauthenticated')
}
