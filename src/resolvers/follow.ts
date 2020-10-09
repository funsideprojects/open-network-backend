import { GraphQLResolveInfo } from 'graphql'
import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { IContext } from '_apollo-server'

import { getRequestedFieldsFromInfo } from './functions'
import { isAuthenticated } from './high-order-resolvers'
import { pubsubNotification } from './notification'

// *_:
const Query = {
  // DONE:
  getFollowedUsers: async (
    root,
    { username, skip, limit },
    { authUser, User, Follow, ERROR_TYPES }: IContext,
    info: GraphQLResolveInfo
  ) => {
    let userFound
    // if there's username then find base on it
    if (username) {
      userFound = await User.findOne({ username })
      if (!userFound) throw new Error(`user_${ERROR_TYPES.NOT_FOUND}`)
    } else {
      // There's no username, then find followed users of authUser
      if (authUser) {
        userFound = await User.findOne({ username: authUser.username })
        if (!userFound) throw new Error(`user_${ERROR_TYPES.NOT_FOUND}`)
      } else {
        // There's no username and no authUser, invalid input
        throw new Error(ERROR_TYPES.INVALID_INPUT)
      }
    }

    const requestedFields = getRequestedFieldsFromInfo(info)
    const query = { '_id.followerId': userFound._id }
    const result = {}

    // Count users followed by userFound
    if (requestedFields.includes('count')) {
      const count = await Follow.countDocuments(query)

      result['count'] = count
    }

    // Get users info
    if (requestedFields.some((f) => f.includes('users'))) {
      const users = await Follow.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
        {
          $lookup: {
            from: 'users',
            let: { userId: '$_id.userId' },
            pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$userId'] } } }, { $set: { id: '$_id' } }],
            as: 'users',
          },
        },
        { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
        { $replaceRoot: { newRoot: { $mergeObjects: ['$users'] } } },
      ])

      result['users'] = users
    }

    return result
  },

  // DONE:
  getUserFollowers: async (
    root,
    { username, skip, limit },
    { User, Follow, ERROR_TYPES }: IContext,
    info: GraphQLResolveInfo
  ) => {
    const userFound = await User.findOne({ username })
    if (!userFound) throw new Error(`user_${ERROR_TYPES.NOT_FOUND}`)

    const requestedFields = getRequestedFieldsFromInfo(info)
    const query = { '_id.userId': userFound._id }
    const result = {}

    // Count users that userFound follows
    if (requestedFields.includes('count')) {
      const count = await Follow.countDocuments(query)

      result['count'] = count
    }

    // Get users info
    if (requestedFields.some((f) => f.includes('users'))) {
      const users = await Follow.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
        {
          $lookup: {
            from: 'users',
            let: { userId: '$_id.followerId' },
            pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$userId'] } } }, { $set: { id: '$_id' } }],
            as: 'users',
          },
        },
        { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
        { $replaceRoot: { newRoot: { $mergeObjects: ['$users'] } } },
      ])

      result['users'] = users
    }

    return result
  },
}

// *_:
const Mutation = {
  // DONE:
  createFollow: combineResolvers(
    isAuthenticated,
    async (root, { input: { userId } }, { authUser, User, Follow, Notification, ERROR_TYPES }: IContext) => {
      if (!userId) throw new Error(ERROR_TYPES.INVALID_INPUT)
      if (userId === authUser.id) throw new Error(ERROR_TYPES.INVALID_OPERATION)

      const userFound = await User.findById(userId)
      if (!userFound) throw new Error(`user_${ERROR_TYPES.NOT_FOUND}`)
      if (
        !!(await Follow.findOne({
          $and: [{ '_id.userId': userId }, { '_id.followerId': authUser.id }],
        }))
      ) {
        throw new Error(ERROR_TYPES.INVALID_OPERATION)
      }

      const [authUserFound] = await Promise.all([
        User.findById(authUser.id).select({
          password: 0,
          passwordResetToken: 0,
          passwordResetTokenExpiry: 0,
        }),
        // Create follow
        new Follow({ _id: { userId, followerId: authUser.id } }).save(),
        // Send noti
        new Notification({
          type: 'FOLLOW',
          fromIds: [Types.ObjectId(authUser.id)],
          toId: Types.ObjectId(userId),
        }).save(),
      ])

      // *: PubSub
      pubsubNotification({
        operation: 'CREATE',
        type: 'FOLLOW',
        dataId: authUser.id,
        from: authUserFound,
        recipients: [Types.ObjectId(userId)],
      })

      return true
    }
  ),

  // DONE:
  deleteFollow: combineResolvers(
    isAuthenticated,
    async (root, { input: { userId } }, { authUser, User, Follow, Notification, ERROR_TYPES }: IContext) => {
      if (!userId) throw new Error(ERROR_TYPES.INVALID_INPUT)

      const userFound = await User.findById(userId)
      if (!userFound) throw new Error(`user_${ERROR_TYPES.NOT_FOUND}`)

      await Promise.all([
        // Delete follow
        Follow.deleteOne({
          $and: [{ '_id.userId': userId }, { '_id.followerId': authUser.id }],
        }),
        // Delete noti
        Notification.deleteOne({
          $and: [
            { type: 'FOLLOW' },
            { fromIds: { $elemMatch: { $eq: Types.ObjectId(authUser.id) } } },
            { toId: Types.ObjectId(userId) },
          ],
        }),
      ])

      // *: PubSub
      pubsubNotification({
        operation: 'DELETE',
        type: 'FOLLOW',
        recipients: [Types.ObjectId(userId)],
      })

      return true
    }
  ),
}

export default { Query, Mutation }
