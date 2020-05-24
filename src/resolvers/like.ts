import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { IContext } from 'utils/apollo-server'

import { isAuthenticated } from './high-order-resolvers'
import { getRequestedFieldsFromInfo } from './functions'

const Query = {
  // TODO:
  getMyLikes: combineResolvers(
    isAuthenticated,
    async (root, { input: { skip, limit } }, { authUser: { id }, Like }: IContext) => {
      const postsFound = await Like.aggregate([
        { $match: { '_id.userId': id } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
      ])

      return postsFound
    }
  ),

  // DONE:
  getLikes: async (root, { postId }, { authUser, Post, Like, ERROR_TYPES }: IContext, info) => {
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
        ...(shouldAggregateLikesUser
          ? [
              {
                $lookup: {
                  from: 'users',
                  let: { userId: '$_id.userId' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                    { $set: { id: '$_id' } },
                  ],
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
    async (root, { input: { postId } }, { authUser: { id }, Like, ERROR_TYPES }: IContext) => {
      if (!!(await Like.findOne({ $and: [{ '_id.postId': postId }, { '_id.userId': id }] }))) {
        throw new Error(ERROR_TYPES.INVALID_OPERATION)
      }

      await new Like({ _id: { postId, userId: id } }).save()

      return true
    }
  ),

  // DONE:
  deleteLike: combineResolvers(
    isAuthenticated,
    async (root, { input: { postId } }, { authUser: { id }, Like }: IContext) => {
      await Like.findOneAndRemove({ $and: [{ '_id.postId': postId }, { '_id.userId': id }] })

      return true
    }
  ),
}

export default { Query, Mutation }
