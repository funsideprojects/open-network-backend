import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { getRequestedFieldsFromInfo } from './functions'
import { isAuthenticated } from './high-order-resolvers'
import { IContext } from '../utils/apollo-server'

// *_:
const Query = {
  getUserFollowings: async (root, { username, skip, limit }, { User, Follow }: IContext, info) => {
    const requestedFields = getRequestedFieldsFromInfo(info)
    const userFound = await User.findOne({ username })

    if (!userFound) throw new Error('User not found')

    const result = {}

    if (requestedFields.includes('count')) {
      const count = await Follow.countDocuments({ '_id.followerId': userFound.id })
      result['count'] = count
    }

    if (requestedFields.some((f) => f.includes('users'))) {
      const users = await Follow.aggregate([
        { $match: { '_id.followerId': Types.ObjectId(userFound.id) } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
        {
          $lookup: {
            from: 'users',
            let: { userId: '$_id.userId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$_id', '$$userId'] }]
                  }
                }
              }
            ],
            as: 'users'
          }
        },
        { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
        {
          $replaceRoot: {
            newRoot: {
              $mergeObjects: ['$users', { id: '$users._id' }]
            }
          }
        }
      ])

      result['users'] = users
    }

    return result
  },

  // DONE:
  getUserFollowers: async (root, { username, skip, limit }, { User, Follow }: IContext, info) => {
    const requestedFields = getRequestedFieldsFromInfo(info)
    const userFound = await User.findOne({ username })

    if (!userFound) throw new Error('User not found')

    const result = {}

    if (requestedFields.includes('count')) {
      const count = await Follow.countDocuments({ '_id.userId': userFound.id })
      result['count'] = count
    }

    if (requestedFields.some((f) => f.includes('users'))) {
      const users = await Follow.aggregate([
        { $match: { '_id.userId': Types.ObjectId(userFound.id) } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
        {
          $lookup: {
            from: 'users',
            let: { userId: '$_id.followerId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$_id', '$$userId'] }]
                  }
                }
              }
            ],
            as: 'users'
          }
        },
        { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
        {
          $replaceRoot: {
            newRoot: {
              $mergeObjects: ['$users', { id: '$users._id' }]
            }
          }
        }
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
      if (!(await User.findOne({ _id: userId }))) throw new Error('User not found')

      await new Follow({ _id: { userId, followerId: id } }).save()

      return true
    }
  ),

  // DONE:
  deleteFollow: combineResolvers(
    isAuthenticated,
    async (root, { input: { userId } }, { authUser: { id }, User, Follow }: IContext) => {
      if (!(await User.findOne({ _id: userId }))) throw new Error('User not found')

      await Follow.deleteOne({
        $and: [{ '_id.userId': userId }, { '_id.followerId': id }]
      })

      return true
    }
  )
}

export default { Query, Mutation }
