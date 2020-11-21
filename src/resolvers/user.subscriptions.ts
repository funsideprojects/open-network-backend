import { withFilter } from 'apollo-server'

import { IS_USER_ONLINE } from 'constants/Subscriptions'

import { pubSub } from '_apollo-server'

export const Subscription = {
  isUserOnline: {
    subscribe: withFilter(
      () => pubSub.asyncIterator(IS_USER_ONLINE),
      (payload, variables, _context) => variables.userId === payload.isUserOnline.userId
    ),
  },
}
