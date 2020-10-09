import { GraphQLResolveInfo } from 'graphql'
import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { IContext } from '_apollo-server'

import { isAuthenticated } from './high-order-resolvers'
import { getRequestedFieldsFromInfo } from './functions'
import { pubsubNotification } from './notification'

const Query = {
  // DONE:
  getLikes: async (root, { postId }, { authUser, Post, Like, ERROR_TYPES }: IContext, info: GraphQLResolveInfo) => {
    const postFound = await Post.findById(postId)
    if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)
    if (postFound.isPrivate) {
      if (!authUser || authUser.id !== postFound.authorId.toHexString()) {
        throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)
      }
    }

    const requestedFields = getRequestedFieldsFromInfo(info)
    const query = { '_id.postId': Types.ObjectId(postId) }
    const result = {}

    if (requestedFields.includes('count')) {
      const count = await Like.countDocuments(query)

      result['count'] = count
    }

    if (requestedFields.some((f) => f.includes('likes'))) {
      const shouldAggregateLikesPost = requestedFields.some((f) => f.includes('likes.post'))
      const shouldAggregateLikesUser = requestedFields.some((f) => f.includes('likes.user'))

      const likes = await Like.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        ...(shouldAggregateLikesPost
          ? [
              {
                $lookup: {
                  from: 'posts',
                  let: { postId: '$_id.postId' },
                  pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$postId'] } } }, { $set: { id: '$_id' } }],
                  as: 'post',
                },
              },
              { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
            ]
          : []),
        ...(shouldAggregateLikesUser
          ? [
              {
                $lookup: {
                  from: 'users',
                  let: { userId: '$_id.userId' },
                  pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$userId'] } } }, { $set: { id: '$_id' } }],
                  as: 'user',
                },
              },
              { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            ]
          : []),
      ])

      result['likes'] = likes
    }

    return result
  },
}

// *_:
const Mutation = {
  // DONE:
  createLike: combineResolvers(
    isAuthenticated,
    async (root, { input: { postId } }, { authUser, Post, User, Like, Notification, ERROR_TYPES }: IContext) => {
      if (!postId) throw new Error(ERROR_TYPES.INVALID_INPUT)

      const postFound = await Post.findById(postId)
      if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)

      if (!!(await Like.findOne({ $and: [{ '_id.postId': postId }, { '_id.userId': authUser.id }] }))) {
        throw new Error(ERROR_TYPES.INVALID_OPERATION)
      }

      const [authUserFound] = await Promise.all([
        User.findById(authUser.id).select({
          password: 0,
          passwordResetToken: 0,
          passwordResetTokenExpiry: 0,
        }),
        // Create like
        new Like({ _id: { postId, userId: authUser.id } }).save(),
        // Send Noti
        new Notification({
          type: 'LIKE',
          postId,
          fromIds: [Types.ObjectId(authUser.id)],
          toId: postFound.authorId,
        }).save(),
      ])

      // *: PubSub
      pubsubNotification({
        operation: 'CREATE',
        type: 'LIKE',
        dataId: postFound.id,
        from: authUserFound,
        recipients: [postFound.authorId],
      })

      return true
    }
  ),

  // DONE:
  deleteLike: combineResolvers(
    isAuthenticated,
    async (root, { input: { postId } }, { authUser, Post, Like, Notification, ERROR_TYPES }: IContext) => {
      if (!postId) throw new Error(ERROR_TYPES.INVALID_INPUT)

      const postFound = await Post.findById(postId)
      if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)

      await Promise.all([
        // Delete Like
        Like.deleteOne({
          $and: [{ '_id.postId': postId }, { '_id.userId': authUser.id }],
        }),
        // Delete Noti
        Notification.deleteOne({
          $and: [
            { type: 'LIKE' },
            { postId },
            { fromIds: { $elemMatch: { $eq: Types.ObjectId(authUser.id) } } },
            { toId: postFound.authorId },
          ],
        }),
      ])

      // *: PubSub
      pubsubNotification({ operation: 'DELETE', type: 'LIKE', recipients: [postFound.authorId] })

      return true
    }
  ),
}

export default { Query, Mutation }
