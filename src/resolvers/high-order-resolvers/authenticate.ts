import { skip } from 'graphql-resolvers'

import { IContext } from 'utils/apollo-server'

export function isAuthenticated(root, args, { authUser, ERROR_TYPES }: IContext, info) {
  if (!authUser) return new Error(ERROR_TYPES.UNAUTHENTICATED)
  else return skip
}
