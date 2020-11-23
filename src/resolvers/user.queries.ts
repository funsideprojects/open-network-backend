import { GraphQLResolveInfo } from 'graphql'
import { ApolloError } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'

import { IContext } from '_apollo-server'
import { TokenTypes, generateToken, verifyToken, accessTokenMaxAge, refreshTokenMaxAge } from '_jsonwebtoken'

import { getRequestedFieldsFromInfo } from './functions'
import { isAuthenticated } from './high-order-resolvers'

// ! Limit the result for safety purpose
const MaximumRecordPerQuery = 25

// ! Exclude these private fields
// const privateFields = ['-emailVerified', '-visibleToEveryone', '-displayOnlineStatus']

export const Query = {
  getAuthUser: combineResolvers(isAuthenticated, async (root, args, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
    const userFound = await User.findById(authUser!.id)

    if (!userFound) {
      throw new ApolloError('Unauthorized', HTTP_STATUS_CODE.Unauthorized)
    }

    return userFound
  }),

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

    console.log(userFound)

    return userFound
  },

  getUsers: combineResolvers(
    isAuthenticated,
    async (root, { skip, limit }, { authUser, User, Follow, HTTP_STATUS_CODE }: IContext, info: GraphQLResolveInfo) => {
      // ! Early return 0 record if skip and limit fall into cases below
      if (typeof skip !== 'number' || typeof limit !== 'number' || skip < 0 || limit < 0 || !(limit - skip)) {
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
        $and: [
          { _id: { $nin: [...following.map(({ _id }) => _id.userId), authUser!.id] } },
          { visibleToEveryone: true },
        ],
      }

      if (requestedFields.includes('count')) {
        result['count'] = await User.countDocuments(query)
      }

      if (requestedFields.some((f) => f.includes('users'))) {
        result['users'] = await User.find(query).skip(skip).limit(limit).sort({ createdAt: 'desc' })
      }

      return result
    }
  ),

  searchUsers: combineResolvers(
    isAuthenticated,
    async (
      root,
      { searchQuery, skip, limit },
      { authUser, Follow, User, HTTP_STATUS_CODE }: IContext,
      info: GraphQLResolveInfo
    ) => {
      // ! Early return 0 record if skip and limit fall into cases below
      if (typeof skip !== 'number' || typeof limit !== 'number' || skip < 0 || limit < 0 || !(limit - skip)) {
        return []
      }

      if (limit - skip >= MaximumRecordPerQuery) {
        throw new ApolloError('Exceeded maximum results per request', HTTP_STATUS_CODE['Method Not Allowed'])
      }

      const result = {}
      const requestedFields = getRequestedFieldsFromInfo(info)

      const following = await Follow.find({ '_id.followerId': authUser!.id })

      const followingIds = following.map(({ _id }) => _id.userId)

      // ? Query object
      const query = {
        $and: [
          {
            $or: [
              {
                $and: [
                  { _id: { $in: followingIds } },
                  { $or: [{ username: new RegExp(searchQuery, 'i') }, { fullName: new RegExp(searchQuery, 'i') }] },
                ],
              },
              {
                $and: [
                  { $and: [{ _id: { $nin: followingIds } }, { visibleToEveryone: true }] },
                  { $or: [{ username: new RegExp(searchQuery, 'i') }, { fullName: new RegExp(searchQuery, 'i') }] },
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
    }
  ),

  suggestUsers: combineResolvers(isAuthenticated, async (root, args, { authUser, User, Follow }: IContext) => {
    const SUGGESTION_LIMIT = 5

    // ? Find users who authUser is following
    const following = await Follow.find({ '_id.followerId': authUser!.id })

    // ? Find random users except users that authUser is following
    const query = {
      $and: [{ _id: { $nin: [...following.map(({ _id }) => _id.userId), authUser!.id] } }, { visibleToEveryone: true }],
    }

    const usersCount = await User.countDocuments(query)
    let random = ~~(Math.random() * usersCount)

    const usersLeft = usersCount - random
    if (usersLeft < SUGGESTION_LIMIT) {
      random = random - (SUGGESTION_LIMIT - usersLeft)
      if (random < 0) random = 0
    }

    const randomUsers = await User.find(query).skip(random).limit(SUGGESTION_LIMIT)

    return randomUsers.sort(() => Math.random() - 0.5)
  }),

  // ? Check if user exists and token is valid
  verifyToken: async (root, { token }, { User }: IContext) => {
    return !!verifyToken(token)
  },

  silentRenew: (root, args, { req, ERROR_MESSAGE, HTTP_STATUS_CODE }: IContext) => {
    // ? Throw error if express middleware failed to initialize response
    if (!req.res) {
      throw new ApolloError(ERROR_MESSAGE['Internal Server Error'], HTTP_STATUS_CODE['Internal Server Error'])
    }

    const authUser = verifyToken(req.cookies.refreshToken)
    if (!authUser) {
      throw new ApolloError('This token is either invalid or expired', HTTP_STATUS_CODE['Bad Request'])
    }

    const accessToken = generateToken({ type: TokenTypes.Access, payload: authUser })
    const refreshToken = generateToken({ type: TokenTypes.Refresh, payload: { ip: '', userAgent: '' } })
    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production' }

    req.res.cookie('accessToken', accessToken, { maxAge: accessTokenMaxAge, ...cookieOptions })
    req.res.cookie('refreshToken', refreshToken, { maxAge: refreshTokenMaxAge, ...cookieOptions })

    return true
  },
}
