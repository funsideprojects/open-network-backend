import { GraphQLResolveInfo } from 'graphql'
import { skip } from 'graphql-resolvers'

import { IContext } from '_apollo-server'

export function isAuthenticated(root: any, args: any, { authUser, ERROR_TYPES }: IContext, info: GraphQLResolveInfo) {
  return authUser ? skip : new Error(ERROR_TYPES.UNAUTHENTICATED)
}
