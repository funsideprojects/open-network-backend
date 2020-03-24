import { skip } from 'graphql-resolvers'

import { IContext } from 'utils/apollo-server'

export function isAuthenticated(root, args, { authUser }: IContext, info) {
  if (!authUser) return new Error('Not authenticated.')
  else return skip
}
