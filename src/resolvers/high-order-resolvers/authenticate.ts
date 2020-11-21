import { ApolloError } from 'apollo-server'
import { GraphQLResolveInfo } from 'graphql'
import { skip } from 'graphql-resolvers'

import { IContext } from '_apollo-server'

export const isAuthenticated = (
  root: any,
  args: any,
  { authUser, HTTP_STATUS_CODE }: IContext,
  info: GraphQLResolveInfo
) => {
  return authUser ? skip : new ApolloError('Unauthenticated', HTTP_STATUS_CODE.Unauthorized)
}
