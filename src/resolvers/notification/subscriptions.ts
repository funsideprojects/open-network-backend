import { withFilter } from 'apollo-server'

import { NOTIFICATION_UPDATED } from 'constants/Subscriptions'

import { ISubscriptionContext, pubSub } from '_apollo-server'

export enum NotiPubsubOperation {
  Create = 'CREATE',
  Delete = 'DELETE',
}
export enum NotificationType {
  Comment = 'COMMENT',
  Follow = 'FOLLOW',
  Like = 'LIKE',
  Notification = 'NOTIFICATION',
}
type NotificationPayload = {
  operation: NotiPubsubOperation
  type: NotificationType
  data?: string
  from?: any
  recipients: Array<string>
}

export function pubsubNotification(payload: NotificationPayload) {
  pubSub.publish(NOTIFICATION_UPDATED, {
    notificationUpdated: payload,
  })
}

export const Subscription = {
  notificationUpdated: {
    resolve: ({ notificationUpdated: { recipients, ...rest } }: { notificationUpdated: NotificationPayload }) => rest,
    subscribe: withFilter(
      () => pubSub.asyncIterator(NOTIFICATION_UPDATED),
      (payload: { notificationUpdated: NotificationPayload }, variables, { authUser }: ISubscriptionContext) => {
        return payload.notificationUpdated.recipients.some((userId) => userId === authUser.id)
      }
    ),
  },
}
