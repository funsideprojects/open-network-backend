import { GraphQLResolveInfo } from 'graphql'
import { compare } from 'bcryptjs'
import { ApolloError, withFilter } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'

import { serverTimezoneOffset } from 'constants/Date'
import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { frontEndPages } from 'constants/UsernameBlacklist'
import { Mailer, UploadManager } from 'services'

import { pubSub, IContext } from '_apollo-server'
import { generateToken, accessTokenMaxAge, refreshTokenMaxAge, resetPasswordTokenMaxAge } from '_jsonwebtoken'

import { getRequestedFieldsFromInfo } from './functions'
import { isAuthenticated } from './high-order-resolvers'

const Query = {
  getAuthUser: combineResolvers(isAuthenticated, async (root, args, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
    const userFound = await User.findById(authUser.id)
    console.log('userFound', userFound)

    if (!userFound) {
      throw new ApolloError('Unauthorized', HTTP_STATUS_CODE.Unauthorized)
    }

    return userFound
  }),

  getUser: async (root, { username, id }, { User, HTTP_STATUS_CODE }: IContext) => {
    if ((!username && !id) || (username && id)) {
      throw new ApolloError('Invalid arguments', HTTP_STATUS_CODE['Bad Request'])
    }

    const userFound = await User.findOne({ ...(username ? { username } : { _id: id }) })
    if (!userFound) {
      throw new ApolloError('User could not be found', HTTP_STATUS_CODE['Not Found'])
    }

    return userFound
  },

  getUsers: combineResolvers(
    isAuthenticated,
    async (root, { skip, limit }, { authUser, User, Follow, HTTP_STATUS_CODE }: IContext, info: GraphQLResolveInfo) => {
      // ! Limit the result for safety purpose
      if (limit - skip >= 25) {
        throw new ApolloError('', HTTP_STATUS_CODE['Method Not Allowed'])
      }

      const result = {}
      const requestedFields = getRequestedFieldsFromInfo(info)

      // ? Find userIds that authUser is following
      const currentFollowing = await Follow.find({ '_id.followerId': authUser.id })

      // ? Find users that authUser is not following
      const query = {
        $and: [{ _id: { $ne: authUser.id } }, { _id: { $nin: currentFollowing.map(({ _id }) => _id.userId) } }],
      }

      if (requestedFields.includes('count')) {
        const count = await User.countDocuments(query)
        result['count'] = count
      }

      if (requestedFields.some((f) => f.includes('users'))) {
        const users = await User.find(query).skip(skip).limit(limit).sort({ createdAt: 'desc' })
        result['users'] = users
      }

      return result
    }
  ),

  searchUsers: combineResolvers(
    isAuthenticated,
    async (root, { searchQuery, skip, limit }, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
      if (limit - skip >= 25) {
        throw new ApolloError('', HTTP_STATUS_CODE['Method Not Allowed'])
      }

      return await User.find({
        $or: [{ username: new RegExp(searchQuery, 'i') }, { fullName: new RegExp(searchQuery, 'i') }],
        _id: { $ne: authUser.id },
      })
        .skip(skip)
        .limit(limit)
    }
  ),

  suggestUsers: combineResolvers(isAuthenticated, async (root, args, { authUser, User, Follow }: IContext) => {
    const SUGGESTION_LIMIT = 5

    // ? Find users who authUser is following
    const currentFollowing = await Follow.find({ '_id.followerId': authUser.id })

    // ? Find random users except users that authUser is following
    const query = { _id: { $nin: [...currentFollowing.map(({ _id }) => _id.userId), authUser.id] } }
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

  verifyResetPasswordToken: async (root, { email, token }, { User }: IContext) => {
    // ? Check if user exists and token is valid
    const userFound = await User.findOne({
      email,
      passwordResetToken: token,
      passwordResetTokenExpiry: {
        $gte: new Date(Date.now() - resetPasswordTokenMaxAge),
      },
    })

    return !!userFound
  },
}

const Mutation = {
  // *
  signup: async (
    root,
    { input: { fullName, email, username, password } },
    { User, HTTP_STATUS_CODE, ERROR_MESSAGE, req }: IContext
  ) => {
    // ? Throw error if express middleware failed to initialize response
    if (!req.res) {
      throw new ApolloError(ERROR_MESSAGE['Internal Server Error'], HTTP_STATUS_CODE['Internal Server Error'])
    }

    if (frontEndPages.includes(username)) {
      throw new ApolloError(`This username isn't available. Please try another.`, HTTP_STATUS_CODE['Bad Request'])
    }

    let newUser = new User({
      fullName,
      email,
      username,
      password,
      lastActiveAt: new Date(Date.now() + serverTimezoneOffset),
    })

    // ? Save user to db
    try {
      newUser = await newUser.save()
    } catch (error) {
      if (error.name === 'MongoError' && error.code === 11000) {
        throw new ApolloError('Email or username is already in use', HTTP_STATUS_CODE['Bad Request'], error)
      }
      throw new ApolloError(error.message, HTTP_STATUS_CODE['Bad Request'], error)
    }

    // ? Create user credentials
    try {
      const user = {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        fullName: newUser.fullName,
      }

      const accessToken = generateToken(user, 'access')
      const refreshToken = generateToken(user, 'refresh')
      const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production' }

      req.res.cookie('accessToken', accessToken, { maxAge: accessTokenMaxAge, ...cookieOptions })
      req.res.cookie('refreshToken', refreshToken, { maxAge: refreshTokenMaxAge, ...cookieOptions })

      return true
    } catch (error) {
      await User.deleteOne({ _id: newUser._id })

      throw new ApolloError(ERROR_MESSAGE['Internal Server Error'], HTTP_STATUS_CODE['Internal Server Error'], error)
    }
  },

  // *
  signin: async (
    root,
    { input: { emailOrUsername, password } },
    { User, HTTP_STATUS_CODE, ERROR_MESSAGE, req }: IContext
  ) => {
    // ? Throw error if express middleware failed to initialize response
    if (!req.res) {
      throw new ApolloError(ERROR_MESSAGE['Internal Server Error'], HTTP_STATUS_CODE['Internal Server Error'])
    }

    const userFound = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
    })
    // ? User not found
    if (!userFound) {
      throw new ApolloError(`Username or password is incorrect`, HTTP_STATUS_CODE['Bad Request'])
    }

    const isValidPassword = await compare(password, userFound.password)
    // ? User found but the password was incorrect
    if (!isValidPassword) {
      throw new ApolloError(`Username or password is incorrect`, HTTP_STATUS_CODE['Bad Request'])
    }

    // ? Create user credentials
    try {
      const user = {
        id: userFound.id,
        email: userFound.email,
        username: userFound.username,
        fullName: userFound.fullName,
      }

      const accessToken = generateToken(user, 'access')
      const refreshToken = generateToken(user, 'refresh')

      const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production' }

      req.res.cookie('accessToken', accessToken, { maxAge: accessTokenMaxAge, ...cookieOptions })
      req.res.cookie('refreshToken', refreshToken, { maxAge: refreshTokenMaxAge, ...cookieOptions })

      return true
    } catch (error) {
      throw new ApolloError(ERROR_MESSAGE['Internal Server Error'], HTTP_STATUS_CODE['Internal Server Error'], error)
    }
  },

  requestPasswordReset: async (root, { input: { email } }, { User, HTTP_STATUS_CODE }: IContext) => {
    const userFound = await User.findOne({ email })
    if (!userFound) {
      throw new ApolloError(`No such user found for email ${email}.`, HTTP_STATUS_CODE['Bad Request'])
    }

    const user = {
      id: userFound.id,
      email: userFound.email,
      username: userFound.username,
      fullName: userFound.fullName,
    }

    // ? Set password reset token and it's expiry
    const passwordResetToken = generateToken(user, 'resetPassword')
    const passwordResetTokenExpiry = new Date(Date.now() + serverTimezoneOffset + resetPasswordTokenMaxAge)

    await User.findOneAndUpdate({ _id: userFound.id }, { passwordResetToken, passwordResetTokenExpiry })

    // ? Send an email contain reset link
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?&t=${passwordResetToken}`
    // todo Enhance html reset password template
    const mailOptions = {
      to: email,
      subject: 'Password Reset',
      html: resetLink,
    }

    await Mailer.sendMail(mailOptions)

    return true
  },

  resetPassword: async (root, { input: { email, token, password } }, { User, HTTP_STATUS_CODE }: IContext) => {
    // ? Validate token
    const userFound = await User.findOne({
      $and: [
        { email },
        { passwordResetToken: token },
        {
          passwordResetTokenExpiry: {
            $gte: new Date(Date.now() - resetPasswordTokenMaxAge),
          },
        },
      ],
    })
    if (!userFound) {
      throw new ApolloError('This token is either invalid or expired', HTTP_STATUS_CODE['Bad Request'])
    }

    // ? Update password, reset token and it's expiry
    userFound.passwordResetToken = undefined
    userFound.passwordResetTokenExpiry = undefined
    userFound.password = password
    await userFound.save()

    return true
  },

  updateUserInfo: combineResolvers(
    isAuthenticated,
    async (root, { input: { fullName } }, { authUser, User }: IContext) => {
      return await User.findByIdAndUpdate(authUser.id, { $set: { fullName } }, { new: true, runValidators: true })
    }
  ),

  updateUserPhoto: combineResolvers(
    isAuthenticated,
    async (root, { input: { image, isCover } }, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
      let fieldsToUpdate: { [key: string]: string | undefined }

      const userFound = await User.findById(authUser.id)
      if (!userFound) {
        throw new ApolloError('Unauthorized', HTTP_STATUS_CODE.Unauthorized)
      }

      if (image) {
        const uploadedFile = await UploadManager.uploadFile(authUser.username, image, ['image'])

        fieldsToUpdate = {
          [isCover ? 'coverImage' : 'image']: uploadedFile.fileAddress,
          [isCover ? 'coverImagePublicId' : 'imagePublicId']: uploadedFile.filePublicId,
        }

        if (userFound[isCover ? 'coverImage' : 'image']) {
          UploadManager.removeUploadedFile('image', userFound[isCover ? 'coverImage' : 'image']!)
        }
      } else {
        fieldsToUpdate = {
          [isCover ? 'coverImage' : 'image']: undefined,
          [isCover ? 'coverImagePublicId' : 'imagePublicId']: undefined,
        }

        if (userFound && userFound[isCover ? 'coverImage' : 'image']) {
          UploadManager.removeUploadedFile('image', userFound[isCover ? 'coverImage' : 'image']!)
        }
      }

      const updatedUser = await User.findByIdAndUpdate(authUser.id, { $set: fieldsToUpdate }, { new: true })

      return updatedUser
    }
  ),
}

const Subscription = {
  isUserOnline: {
    subscribe: withFilter(
      () => pubSub.asyncIterator(IS_USER_ONLINE),
      (payload, variables, _context) => variables.userId === payload.isUserOnline.userId
    ),
  },
}

export default { Query, Mutation, Subscription }
