import { GraphQLResolveInfo } from 'graphql'
import { Types } from 'mongoose'

import { getRequestedFieldsFromInfo } from 'resolvers/functions'

import { IContext } from '_apollo-server'

export const Query = {
  getNotifications: async (root, { skip, limit }, { authUser, Notification }: IContext, info: GraphQLResolveInfo) => {
    const result = {}
    const requestedFields = getRequestedFieldsFromInfo(info)

    if (requestedFields.includes('count')) {
      result['count'] = await Notification.countDocuments({ toId: authUser!.id })
    }

    if (requestedFields.includes('unseen')) {
      result['unseen'] = await Notification.countDocuments({
        $and: [{ toId: Types.ObjectId(authUser!.id) }, { seen: false }],
      })
    }

    if (requestedFields.some((f) => f.includes('notifications'))) {
      const shouldAggregatePost = requestedFields.some((f) => f.includes('notifications.post.'))
      const shouldAggregateComment = requestedFields.some((f) => f.includes('notifications.comment.'))
      const shouldAggregateFrom = requestedFields.some((f) => f.includes('notifications.from.'))

      result['notifications'] = await Notification.aggregate([
        { $match: { toId: Types.ObjectId(authUser!.id) } },
        { $sort: { createdAt: -1 } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
        ...(shouldAggregatePost
          ? [
              {
                $lookup: {
                  from: 'posts',
                  let: { postId: '$postId' },
                  pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$postId'] } } }, { $set: { id: '$_id' } }],
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
                  pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$commentId'] } } }, { $set: { id: '$_id' } }],
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
    }

    return result
  },
}
