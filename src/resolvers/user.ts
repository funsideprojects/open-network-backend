import { GraphQLResolveInfo } from 'graphql'
import { compare } from 'bcryptjs'
import { withFilter } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'

import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { Mailer } from 'services'

import { pubSub, IContext } from '_apollo-server'
import { generateToken, resetPasswordTokenExpiresIn } from '_jsonwebtoken'

import { getRequestedFieldsFromInfo, uploadFile, removeUploadedFile } from './functions'
import { isAuthenticated } from './high-order-resolvers'

const Query = {
  getAuthUser: combineResolvers(isAuthenticated, async (root, args, { authUser, User }: IContext) => {
    // * Update user isOnline field to true
    return await User.findById(authUser.id)
  }),

  getUser: async (root, { username, id }, { User, ERROR_TYPES }: IContext) => {
    if ((!username && !id) || (username && id)) throw new Error(ERROR_TYPES.INVALID_INPUT)

    const userFound = await User.findOne({ ...(username ? { username } : { _id: id }) })
    if (!userFound) throw new Error(`user_${ERROR_TYPES.NOT_FOUND}`)

    return userFound
  },

  getUsers: combineResolvers(
    isAuthenticated,
    async (root, { skip, limit }, { authUser, User, Follow }: IContext, info: GraphQLResolveInfo) => {
      const result = {}
      const requestedFields = getRequestedFieldsFromInfo(info)

      // Find user ids, that authUser follows
      const currentFollowing = await Follow.find({ '_id.followerId': authUser.id })

      // Find users that user is not following
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
    async (root, { searchQuery }, { authUser: { id }, User }: IContext) => {
      // Return an empty array if searchQuery isn't presented
      if (!searchQuery) return []

      const users = User.find({
        $or: [{ username: new RegExp(searchQuery, 'i') }, { fullName: new RegExp(searchQuery, 'i') }],
        _id: {
          $ne: id,
        },
      }).limit(50)

      return users
    }
  ),

  suggestPeople: combineResolvers(isAuthenticated, async (root, args, { authUser: { id }, User, Follow }: IContext) => {
    const SUGGEST_LIMIT = 5

    // Find people who authUser followed
    const currentFollowing = await Follow.find({ '_id.followerId': id })

    // Find random users except that authUser follows
    const query = { _id: { $nin: [...currentFollowing.map(({ _id }) => _id.userId), id] } }
    const usersCount = await User.countDocuments(query)
    let random = ~~(Math.random() * usersCount)

    const usersLeft = usersCount - random
    if (usersLeft < SUGGEST_LIMIT) {
      random = random - (SUGGEST_LIMIT - usersLeft)
      if (random < 0) random = 0
    }

    const randomUsers = await User.find(query).skip(random).limit(SUGGEST_LIMIT)

    return randomUsers.sort(() => Math.random() - 0.5)
  }),

  verifyResetPasswordToken: async (root, { email, token }, { User }: IContext) => {
    // Check if user exists and token is valid
    const userFound = await User.findOne({
      email,
      passwordResetToken: token,
      passwordResetTokenExpiry: {
        $gte: Date.now() - resetPasswordTokenExpiresIn,
      },
    })
    if (!userFound) throw new Error('This token is either invalid or expired!')

    return { message: 'Success' }
  },
}

const Mutation = {
  signup: async (root, { input: { fullName, email, username, password } }, { User }: IContext) => {
    // Check if user with given email or username already exists
    const userFound = await User.findOne({ $or: [{ email }, { username }] })
    if (userFound) {
      const field = userFound.email === email ? 'email' : 'username'
      throw new Error(`User with given ${field} already exists.`)
    }

    // Empty field validation
    if (!fullName || !email || !username || !password) throw new Error('All fields are required.')

    // FullName validation
    if (fullName.length < 4 || fullName.length > 40) {
      throw new Error(`Full name length should be between 4-40 characters.`)
    }

    // Email validation
    // tslint:disable-next-line
    const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    if (!emailRegex.test(String(email).toLowerCase())) {
      throw new Error('Please enter a valid email address.')
    }

    // Username validation
    const usernameRegex = /^(?!.*\.\.)(?!.*\.$)[^\W][\w.]{0,29}$/
    if (!usernameRegex.test(username)) {
      throw new Error('Usernames can only use letters, numbers, underscores and periods.')
    }

    if (username.length < 3 || username.length > 20) {
      throw new Error('Username length should be between 3-50 characters.')
    }

    // Username shouldn't equal to frontend route path
    const frontEndPages = ['forgot-password', 'reset-password', 'explore', 'people', 'notifications', 'post']
    if (frontEndPages.includes(username)) {
      throw new Error(`This username isn't available. Please try another.`)
    }

    // Password validation
    if (password.length < 6) throw new Error('Minimum password length should be 6 characters.')

    const newUser = await new User({
      fullName,
      email,
      username,
      password,
      lastActiveAt: new Date(),
    }).save()

    return {
      token: generateToken({ id: newUser.id, email, username, fullName }, 'access'),
    }
  },

  signin: async (root, { input: { emailOrUsername, password } }, { User }: IContext) => {
    const userFound = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
    })
    if (!userFound) throw new Error(`Username or email hasn't been registered`)

    const isValidPassword = await compare(password, userFound.password)
    if (!isValidPassword) throw new Error('Wrong password.')

    return {
      token: generateToken(
        {
          id: userFound.id,
          email: userFound.email,
          username: userFound.username,
          fullName: userFound.fullName,
        },
        'access'
      ),
    }
  },

  requestPasswordReset: async (root, { input: { email } }, { User }: IContext) => {
    // Check if user exists
    const userFound = await User.findOne({ email })
    if (!userFound) throw new Error(`No such user found for email ${email}.`)

    // Set password reset token and it's expiry
    const passwordResetToken = generateToken(
      { id: userFound.id, email, username: userFound.username, fullName: userFound.fullName },
      'access'
    )
    const passwordResetTokenExpiry = Date.now() + resetPasswordTokenExpiresIn
    await User.findOneAndUpdate({ _id: userFound.id }, { passwordResetToken, passwordResetTokenExpiry })

    // Email user reset link
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?email=${email}&token=${passwordResetToken}`
    const mailOptions = {
      to: email,
      subject: 'Password Reset',
      html: resetLink,
    }

    await Mailer.sendEmail(mailOptions)

    // Return success message
    return {
      message: `A link to reset your password has been sent to ${email}`,
    }
  },

  resetPassword: async (root, { input: { email, token, password } }, { User }: IContext) => {
    if (!password) throw new Error('Please enter password and Confirm password.')

    if (password.length < 6) throw new Error('Minimum password length should be 6 characters.')

    // Check if user exists and token is valid
    const userFound = await User.findOne({
      $and: [
        { email },
        { passwordResetToken: token },
        {
          passwordResetTokenExpiry: {
            $gte: Date.now() - resetPasswordTokenExpiresIn,
          },
        },
      ],
    })
    if (!userFound) throw new Error('This token is either invalid or expired!.')

    // Update password, reset token and it's expiry
    userFound.passwordResetToken = undefined
    userFound.passwordResetTokenExpiry = undefined
    userFound.password = password
    await userFound.save()

    // Return success message
    return {
      token: generateToken(
        { id: userFound.id, email, username: userFound.username, fullName: userFound.fullName },
        'access'
      ),
    }
  },

  updateUserInfo: combineResolvers(
    isAuthenticated,
    async (root, { input: { fullName } }, { authUser, User }: IContext) => {
      // FullName validation
      if (fullName.length < 4 || fullName.length > 40) {
        throw new Error(`Full name length should be between 4-40 characters.`)
      }

      return await User.findByIdAndUpdate(authUser.id, { $set: { fullName } }, { new: true })
    }
  ),

  updateUserPhoto: combineResolvers(
    isAuthenticated,
    async (root, { input: { image, isCover } }, { authUser, User, ERROR_TYPES }: IContext) => {
      if (typeof isCover !== 'boolean') throw new Error(ERROR_TYPES.INVALID_INPUT)

      let fieldsToUpdate

      if (image) {
        const userFound = await User.findById(authUser.id)
        if (!userFound) throw new Error(`user_${ERROR_TYPES.NOT_FOUND}`)

        const uploadedFile = await uploadFile(authUser.username, image, ['image'])
        if (!uploadedFile) throw new Error(ERROR_TYPES.UNKNOWN)

        fieldsToUpdate = {
          [isCover ? 'coverImage' : 'image']: uploadedFile.fileAddress,
          [isCover ? 'coverImagePublicId' : 'imagePublicId']: uploadedFile.filePublicId,
        }

        if (userFound[isCover ? 'coverImage' : 'image']) {
          removeUploadedFile('image', userFound[isCover ? 'coverImage' : 'image']!)
        }

        // Record the file metadata in the DB.
        await User.findByIdAndUpdate(authUser.id, { $set: fieldsToUpdate })
      } else {
        fieldsToUpdate = {
          [isCover ? 'coverImage' : 'image']: undefined,
          [isCover ? 'coverImagePublicId' : 'imagePublicId']: undefined,
        }

        const userFound = await User.findByIdAndUpdate(authUser.id, { $set: fieldsToUpdate })

        if (userFound && userFound[isCover ? 'coverImage' : 'image']) {
          removeUploadedFile('image', userFound[isCover ? 'coverImage' : 'image']!)
        }
      }

      return fieldsToUpdate
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
