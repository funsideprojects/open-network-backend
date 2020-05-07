import { GraphQLResolveInfo } from 'graphql'
import { combineResolvers } from 'graphql-resolvers'

import { IContext } from 'utils/apollo-server'

import { getRequestedFieldsFromInfo } from './functions'
import { isAuthenticated } from './high-order-resolvers'

// *_:
const Query = {
  // DONE:
  getFollowedUsers: async (
    root,
    { username, skip, limit },
    { authUser, User, Follow }: IContext,
    info: GraphQLResolveInfo
  ) => {
    let userFound
    // if there's username then find base on it
    if (username) {
      userFound = await User.findOne({ username })
      if (!userFound) throw new Error('User not found')
    } else {
      // There's no username, then find followed users of authUser
      if (authUser) {
        userFound = await User.findOne({ username: authUser.username })
        if (!userFound) throw new Error('User not found')
        // There's no username and no authUser, invalid action
      } else {
        throw new Error(`Field 'username' is required`)
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
      if (!(await Follow.findOne({ $and: [{ '_id.userId': userId }, { '_id.followerId': id }] }))) {
        await new Follow({ _id: { userId, followerId: id } }).save()

        return true
      }

      throw new Error(`You've already followed this user`)
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
