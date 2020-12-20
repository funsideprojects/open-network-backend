import { GraphQLResolveInfo } from 'graphql'
import { ApolloError } from 'apollo-server'
import { Types } from 'mongoose'

import { getRequestedFieldsFromInfo } from 'resolvers/functions'

import { IContext } from '_apollo-server'
import { verifyToken } from '_jsonwebtoken'

// ! Limit the result for safety purpose
const MaximumRecordPerQuery = 25

export const Query = {
  getAuthUser: async (root, args, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
    const userFound = await User.findById(authUser!.id)
    if (!userFound) {
      throw new ApolloError('Unauthorized', HTTP_STATUS_CODE.Unauthorized)
    }

    // ! Manually handled due to this query get fired before the onConnect event
    if (userFound.displayOnlineStatus) {
      userFound.online = true
    }

    return userFound
  },

  getUser: async (root, { username, id }, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
    if ((!username && !id) || (username && id)) {
      throw new ApolloError('Invalid arguments', HTTP_STATUS_CODE['Bad Request'])
    }

    const userFound = await User.findOne({
      $and: [
        { ...(username ? { username: username.toLowerCase() } : { _id: id }) },
        ...(authUser ? [] : [{ visibleToEveryone: true }]),
      ],
    })
    if (!userFound) {
      throw new ApolloError('User could not be found', HTTP_STATUS_CODE['Not Found'])
    }

    return userFound
  },

  getUsers: async (
    root,
    { skip, limit },
    { authUser, User, Follow, HTTP_STATUS_CODE }: IContext,
    info: GraphQLResolveInfo
  ) => {
    // ! Early return 0 record if skip and limit fall into cases below
    if (typeof skip !== 'number' || typeof limit !== 'number' || skip < 0 || limit <= 0) {
      return { count: 0, users: [] }
    }

    if (limit - skip >= MaximumRecordPerQuery) {
      throw new ApolloError('Exceeded maximum results per request', HTTP_STATUS_CODE['Method Not Allowed'])
    }

    const result = {}
    const requestedFields = getRequestedFieldsFromInfo(info)

    // ? Find userIds that authUser is following
    const following = await Follow.find({ '_id.followerId': authUser!.id })

    // ? Find users that authUser is not following
    const query = {
      $and: [{ _id: { $nin: [...following.map(({ _id }) => _id.userId), authUser!.id] } }, { visibleToEveryone: true }],
    }

    if (requestedFields.includes('count')) {
      result['count'] = await User.countDocuments(query)
    }

    if (requestedFields.some((f) => f.includes('users'))) {
      result['users'] = await User.find(query).skip(skip).limit(limit).sort({ createdAt: 'desc' })
    }

    return result
  },

  searchUsers: async (
    root,
    { searchQuery, skip, limit },
    { authUser, Follow, User, HTTP_STATUS_CODE }: IContext,
    info: GraphQLResolveInfo
  ) => {
    // ! Early return 0 record if skip and limit fall into cases below
    if (typeof skip !== 'number' || typeof limit !== 'number' || skip < 0 || limit <= 0) {
      return { count: 0, users: [] }
    }

    if (limit - skip >= MaximumRecordPerQuery) {
      throw new ApolloError('Exceeded maximum results per request', HTTP_STATUS_CODE['Method Not Allowed'])
    }

    const result = {}
    const requestedFields = getRequestedFieldsFromInfo(info)
    const following = await Follow.find({ '_id.followerId': authUser!.id })
    const followingIds = following.map(({ _id }) => _id.userId)

    // ? Query object
    const regex = new RegExp(searchQuery, 'i')
    const query = {
      $and: [
        {
          $or: [
            {
              $and: [{ _id: { $in: followingIds } }, { $or: [{ username: regex }, { fullName: regex }] }],
            },
            {
              $and: [
                { $and: [{ _id: { $nin: followingIds } }, { visibleToEveryone: true }] },
                { $or: [{ username: regex }, { fullName: regex }] },
              ],
            },
          ],
        },
        { _id: { $ne: authUser!.id } },
      ],
    }

    if (requestedFields.includes('count')) {
      result['count'] = await User.countDocuments(query)
    }

    if (requestedFields.some((f) => f.includes('users'))) {
      result['users'] = await User.find(query).skip(skip).limit(limit).sort({ createdAt: 'desc' })
    }

    return result
  },

  suggestUsers: async (root, { except = [] }, { authUser, User, Follow }: IContext) => {
    const SUGGESTION_LIMIT = 5
    const followings = await Follow.find({ '_id.followerId': authUser!.id })

    return await User.aggregate([
      {
        $match: {
          $and: [
            {
              _id: {
                $nin: [
                  ...except.map((id) => Types.ObjectId(id)),
                  ...followings.map(({ _id }) => _id.userId),
                  Types.ObjectId(authUser!.id),
                ],
              },
            },
            { visibleToEveryone: true },
          ],
        },
      },
      { $sample: { size: SUGGESTION_LIMIT } },
      { $set: { id: '$_id' } },
    ])
  },

  // ? Check if user exists and token is valid
  verifyToken: async (root, { token }, { User }: IContext) => {
    return !!verifyToken(token)
  },
}
