import { GraphQLResolveInfo } from 'graphql'
import { combineResolvers } from 'graphql-resolvers'

import { IContext } from 'utils/apollo-server'

import { getRequestedFieldsFromInfo } from './functions'
import { isAuthenticated } from './high-order-resolvers'

// *_:
const Query = {
  // DONE:
  getUserFollowings: async (
    root,
    { username, skip, limit },
    { User, Follow }: IContext,
    info: GraphQLResolveInfo
  ) => {
    const userFound = await User.findOne({ username })
    if (!userFound) throw new Error('User not found')

    const requestedFields = getRequestedFieldsFromInfo(info)
    const query = { '_id.followerId': userFound._id }
    const result = {}

    // Count users followed by userFund
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
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
              { $set: { id: '$_id' } }
            ],
            as: 'users'
          }
        },
        { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
        { $replaceRoot: { newRoot: { $mergeObjects: ['$users'] } } }
      ])

      result['users'] = users
    }

    return result
  },

  // DONE:
  getUserFollowers: async (
    root,
    { username, skip, limit },
    { User, Follow }: IContext,
    info: GraphQLResolveInfo
  ) => {
    const userFound = await User.findOne({ username })
    if (!userFound) throw new Error('User not found')

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
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
              { $set: { id: '$_id' } }
            ],
            as: 'users'
          }
        },
        { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
        { $replaceRoot: { newRoot: { $mergeObjects: ['$users'] } } }
      ])

      result['users'] = users
    }

    return result
  }
}

// *_:
const Mutation = {
  // DONE:
  createFollow: combineResolvers(
    isAuthenticated,
    async (root, { input: { userId } }, { authUser: { id }, User, Follow }: IContext) => {
      if (userId === id) throw new Error(`You can't follow yourself!`)
      if (!(await User.findById(userId))) throw new Error('User not found')
      await new Follow({ _id: { userId, followerId: id } }).save()

      return true
    }
  ),

  // DONE:
  deleteFollow: combineResolvers(
    isAuthenticated,
    async (root, { input: { userId } }, { authUser: { id }, User, Follow }: IContext) => {
      if (!(await User.findById(userId))) throw new Error('User not found')

      await Follow.deleteOne({
        $and: [{ '_id.userId': userId }, { '_id.followerId': id }]
      })

      return true
    }
  )
}

export default { Query, Mutation }
