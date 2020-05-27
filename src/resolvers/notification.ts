import { GraphQLResolveInfo } from 'graphql'
import { withFilter } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'
import { ObjectId } from 'mongodb'

import { NOTIFICATION_UPDATED } from 'constants/Subscriptions'
import { IContext, ISubscriptionContext, pubSub } from 'utils/apollo-server'

import { getRequestedFieldsFromInfo } from './functions'
import { isAuthenticated } from './high-order-resolvers'

interface INotificationPayload {
  operation: 'CREATE' | 'DELETE'
  type: 'COMMENT' | 'FOLLOW' | 'LIKE' | 'NOTIFICATION'
  dataId?: string
  from?: any
  recipients: Array<ObjectId>
}

export function pubsubNotification(notiPayload: INotificationPayload) {
  pubSub.publish(NOTIFICATION_UPDATED, {
    notificationUpdated: notiPayload,
  })
}

// *_:
const Query = {
  // DONE:
  getNotifications: combineResolvers(
    isAuthenticated,
    async (
      root,
      { skip, limit },
      { authUser, Notification }: IContext,
      info: GraphQLResolveInfo
    ) => {
      const result = {}
      const requestedFields = getRequestedFieldsFromInfo(info)

      if (requestedFields.includes('count')) {
        const count = await Notification.countDocuments({ toId: authUser.id })

        result['count'] = count
      }

      if (requestedFields.includes('unseen')) {
        const unseen = await Notification.countDocuments({
          $and: [{ toId: Types.ObjectId(authUser.id) }, { seen: false }],
        })

        result['unseen'] = unseen
      }

      if (requestedFields.some((f) => f.includes('notifications'))) {
        const shouldAggregatePost = requestedFields.some((f) => f.includes('notifications.post.'))
        const shouldAggregateComment = requestedFields.some((f) =>
          f.includes('notifications.comment.')
        )
        const shouldAggregateFrom = requestedFields.some((f) => f.includes('notifications.from.'))

        const notifications = await Notification.aggregate([
          { $match: { toId: Types.ObjectId(authUser.id) } },
          { $sort: { createdAt: -1 } },
          ...(skip ? [{ $skip: skip }] : []),
          ...(limit ? [{ $limit: limit }] : []),
          ...(shouldAggregatePost
            ? [
                {
                  $lookup: {
                    from: 'posts',
                    let: { postId: '$postId' },
                    pipeline: [
                      { $match: { $expr: { $eq: ['$_id', '$$postId'] } } },
                      { $set: { id: '$_id' } },
                    ],
                    as: 'post',
                  },
                },
                { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
              ]
            : []),
          ...(shouldAggregateComment
            ? [
                {
                  $lookup: {
                    from: 'comments',
                    let: { commentId: '$commentId' },
                    pipeline: [
                      { $match: { $expr: { $eq: ['$_id', '$$commentId'] } } },
                      { $set: { id: '$_id' } },
                    ],
                    as: 'comment',
                  },
                },
                { $unwind: { path: '$comment', preserveNullAndEmptyArrays: true } },
              ]
            : []),
          ...(shouldAggregateFrom
            ? [
                {
                  $lookup: {
                    from: 'users',
                    let: { userIds: '$fromIds' },
                    pipeline: [
                      { $match: { $expr: { $in: ['$_id', '$$userIds'] } } },
                      {
                        $project: {
                          password: 0,
                          passwordResetToken: 0,
                          passwordResetTokenExpiry: 0,
                        },
                      },
                      { $set: { id: '$_id' } },
                    ],
                    as: 'from',
                  },
                },
              ]
            : []),
          { $set: { id: '$_id' } },
        ])

        result['notifications'] = notifications
      }

      return result
    }
  ),
}

// *_:
const Mutation = {
  // DONE:
  updateNotificationSeen: combineResolvers(
    isAuthenticated,
    async (root, { input: { id, seenAll } }, { authUser, Notification, ERROR_TYPES }: IContext) => {
      if ((!id && typeof seenAll !== 'boolean') || (id && typeof seenAll === 'boolean')) {
        throw new Error(ERROR_TYPES.INVALID_INPUT)
      }

      if (id) await Notification.updateOne({ _id: id }, { $set: { seen: true } })

      if (typeof seenAll === 'boolean' && seenAll) {
        await Notification.updateMany(
          { $and: [{ toId: id }, { seen: false }] },
          { $set: { seen: true } }
        )
      }

      // *: PubSub
      pubsubNotification({
        operation: 'CREATE',
        type: 'NOTIFICATION',
        recipients: [Types.ObjectId(authUser.id)],
      })

      return true
    }
  ),

  // DONE:
  deleteNotification: combineResolvers(
    isAuthenticated,
    async (root, { input: { id } }, { authUser, Notification, ERROR_TYPES }: IContext) => {
      if (!id) throw new Error(ERROR_TYPES.INVALID_INPUT)

      await Notification.deleteOne({ _id: id })

      // *: PubSub
      pubsubNotification({
        operation: 'CREATE',
        type: 'NOTIFICATION',
        recipients: [Types.ObjectId(authUser.id)],
      })

      return true
    }
  ),
}

// *_:
const Subscription = {
  // DONE:
  notificationUpdated: {
    resolve: ({
      notificationUpdated: { recipients, ...rest },
    }: {
      notificationUpdated: INotificationPayload
    }) => rest,
    subscribe: withFilter(
      () => pubSub.asyncIterator(NOTIFICATION_UPDATED),
      (
        payload: { notificationUpdated: INotificationPayload },
        variables,
        { authUser }: ISubscriptionContext
      ) => {
        return payload.notificationUpdated.recipients.some(
          (rec) => rec.toHexString() === authUser.id
        )
      }
    ),
  },
}

export default { Query, Mutation, Subscription }
