import { withFilter } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'

import { NOTIFICATION_CREATED_OR_DELETED } from 'constants/Subscriptions'
import { IContext, ISubscriptionContext, pubSub } from 'utils/apollo-server'

import { isAuthenticated } from './high-order-resolvers'

// *_:
const Query = {
  // DONE:
  getMyNotifications: combineResolvers(
    isAuthenticated,
    async (root, { skip, limit }, { authUser: { id }, Notification }: IContext) => {
      const count = await Notification.countDocuments({ to: id })
      const unseen = await Notification.countDocuments({ $and: [{ to: id }, { seen: false }] })
      const notifications = await Notification.find({ to: id })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: 'desc' })

      return { count, unseen, notifications }
    }
  )
}

// *_:
const Mutation = {
  // DONE:
  updateNotificationSeen: combineResolvers(
    isAuthenticated,
    async (root, args, { authUser: { id }, Notification }: IContext) => {
      try {
        await Notification.updateMany(
          { $and: [{ to: id }, { seen: false }] },
          { $set: { seen: true } }
        )

        return true
      } catch {
        return false
      }
    }
  ),

  // DONE:
  deleteNotification: combineResolvers(
    isAuthenticated,
    async (root, { input: { id } }, { Notification, User }: IContext) => {
      const notificationFound = await Notification.findByIdAndRemove(id)

      pubSub.publish(NOTIFICATION_CREATED_OR_DELETED, {
        notificationCreatedOrDeleted: {
          operation: 'DELETE',
          notification: notificationFound
        }
      })

      return true
    }
  )
}

// *_:
const Subscription = {
  // DONE:
  notificationCreatedOrDeleted: {
    subscribe: withFilter(
      () => pubSub.asyncIterator(NOTIFICATION_CREATED_OR_DELETED),
      (payload, variables, { authUser }: ISubscriptionContext) => {
        const userId = payload.notificationCreatedOrDeleted.notification.toId.toHexString()

        return authUser && authUser.id === userId
      }
    )
  }
}

export default { Query, Mutation, Subscription }
