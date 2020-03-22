import { IContext } from '../../utils/apollo-server'

export function isAuthenticated(root, args, { authUser }: IContext, info) {
  if (!authUser) return new Error('Not authenticated')
}
