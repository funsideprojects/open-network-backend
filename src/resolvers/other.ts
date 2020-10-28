import { withFilter } from 'apollo-server'

import { LOG_FILE_UPDATED } from 'constants/Subscriptions'

import { pubSub } from '_apollo-server'

import { startWatching } from 'utils/log-file'

function publishChanges(change: string) {
  pubSub.publish(LOG_FILE_UPDATED, {
    logFileUpdated: change,
  })
}

// startWatching(publishChanges)

// *_:
const Subscription = {
  // DONE:
  logFileUpdated: {
    subscribe: withFilter(
      () => pubSub.asyncIterator(LOG_FILE_UPDATED),
      (payload, { secret }) => {
        return process.env.SECRET?.slice(0, 5) === secret
      }
    ),
  },
}

export default { Subscription }
