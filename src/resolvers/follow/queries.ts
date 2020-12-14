import { ApolloError } from 'apollo-server-express'
import { GraphQLResolveInfo } from 'graphql'

import { getRequestedFieldsFromInfo } from 'resolvers/functions'

import { IContext } from '_apollo-server'

export const Query = {
  getFollowings: async (
    root,
    { input: { username, idOnly, skip, limit } },
    { authUser, User, Follow, HTTP_STATUS_CODE }: IContext,
    info: GraphQLResolveInfo
  ) => {
    // ? Early return if username string is empty
    if (!username.replace(/\s/g, '').length) {
      throw new ApolloError('Username is required', HTTP_STATUS_CODE['Bad Request'])
    }

    const userFound = await User.findOne({ username })
    if (!userFound) {
      throw new ApolloError('This user is no longer exists', HTTP_STATUS_CODE['Not Found'])
    }

    const requestedFields = getRequestedFieldsFromInfo(info)
    const query = { '_id.followerId': userFound._id }
    const result = {}

    // ? Count user's following
    if (requestedFields.includes('count')) {
      result['count'] = await Follow.countDocuments(query)
    }

    // ? Get users info
    if (requestedFields.some((f) => f.includes('users'))) {
      if (authUser) {
        result['users'] = await Follow.aggregate([
          { $match: query },
          ...(idOnly ? [{ $project: { '_id.userId': 1, createdAt: 1 } }] : []),
          { $sort: { createdAt: -1 } },
          ...(skip ? [{ $skip: skip }] : []),
          ...(limit ? [{ $limit: limit }] : []),
          ...(!idOnly
            ? [
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
              ]
            : [{ $replaceRoot: { newRoot: { $mergeObjects: [{ id: '$_id.userId' }] } } }]),
        ])
      } else {
        result['users'] = []
      }
    }

    return result
  },

  getFollowers: async (
    root,
    { username, skip, limit },
    { authUser, User, Follow, HTTP_STATUS_CODE }: IContext,
    info: GraphQLResolveInfo
  ) => {
    // ? Early return if username string is empty
    if (!username.replace(/\s/g, '').length) {
      throw new ApolloError('Username is required', HTTP_STATUS_CODE['Bad Request'])
    }

    const userFound = await User.findOne({ username })
    if (!userFound) {
      throw new ApolloError('This user is no longer exists', HTTP_STATUS_CODE['Not Found'])
    }

    const requestedFields = getRequestedFieldsFromInfo(info)
    const query = { '_id.userId': userFound._id }
    const result = {}

    // ? Count user's follower
    if (requestedFields.includes('count')) {
      const count = await Follow.countDocuments(query)

      result['count'] = count
    }

    // ? Get users info
    if (requestedFields.some((f) => f.includes('users'))) {
      if (authUser) {
        result['users'] = await Follow.aggregate([
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
      } else {
        result['users'] = []
      }
    }

    return result
  },
}
