import { compare } from 'bcryptjs'
import { withFilter } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'

import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { generateToken, sendEmail, pubSub, IContext } from 'utils'

import { uploadFile, removeUploadedFile } from './functions'
import { isAuthenticated } from './high-order-resolvers'

const AUTH_TOKEN_EXPIRY = '1y'
const RESET_PASSWORD_TOKEN_EXPIRY = 1000 * 60 * 60

// *_:
const Query = {
  // DONE:
  getAuthUser: combineResolvers(
    isAuthenticated,
    async (root, args, { authUser: { id }, User }: IContext) => {
      const userFound = await User.findById(id)

      // Update it's isOnline field to true
      await User.findOneAndUpdate({ _id: id }, { $set: { isOnline: true } })

      return userFound
    }
  ),

  // DONE:
  getUser: async (root, { username, id }, { User }: IContext) => {
    if (!username && !id) throw new Error('username or id is required params.')
    if (username && id) throw new Error('please pass only username or only id as a param')

    const userFound = await User.findOne({ ...(username ? { username } : { _id: id }) })

    if (!userFound) throw new Error(`User with given params doesn't exists.`)

    return userFound
  },

  // DONE:
  getUsers: combineResolvers(
    isAuthenticated,
    async (root, { skip, limit }, { authUser, User, Follow }: IContext) => {
      // Find user ids, that authUser follows
      const currentFollowing = await Follow.find({ '_id.followerId': authUser.id })

      // Find users that user is not following
      const query = {
        $and: [
          { _id: { $ne: authUser.id } },
          { _id: { $nin: currentFollowing.map(({ _id }) => _id.userId) } },
        ],
      }
      const count = await User.countDocuments(query)
      const users = await User.find(query).skip(skip).limit(limit).sort({ createdAt: 'desc' })

      return { users, count }
    }
  ),

  // DONE:
  searchUsers: combineResolvers(
    isAuthenticated,
    async (root, { searchQuery }, { authUser: { id }, User }: IContext) => {
      // Return an empty array if searchQuery isn't presented
      if (!searchQuery) return []

      const users = User.find({
        $or: [
          { username: new RegExp(searchQuery, 'i') },
          { fullName: new RegExp(searchQuery, 'i') },
        ],
        _id: {
          $ne: id,
        },
      }).limit(50)

      return users
    }
  ),

  // DONE:
  suggestPeople: combineResolvers(
    isAuthenticated,
    async (root, args, { authUser: { id }, User, Follow }: IContext) => {
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
    }
  ),

  // DONE:
  verifyResetPasswordToken: async (root, { email, token }, { User }: IContext) => {
    // Check if user exists and token is valid
    const userFound = await User.findOne({
      email,
      passwordResetToken: token,
      passwordResetTokenExpiry: {
        $gte: Date.now() - RESET_PASSWORD_TOKEN_EXPIRY,
      },
    })
    if (!userFound) throw new Error('This token is either invalid or expired!')

    return { message: 'Success' }
  },
}

// *_:
const Mutation = {
  // DONE:
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
    const frontEndPages = [
      'forgot-password',
      'reset-password',
      'explore',
      'people',
      'notifications',
      'post',
    ]
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
      token: generateToken(
        { id: newUser.id, email, username, fullName },
        process.env.SECRET!,
        AUTH_TOKEN_EXPIRY
      ),
    }
  },

  // DONE:
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
        process.env.SECRET!,
        AUTH_TOKEN_EXPIRY
      ),
    }
  },

  // DONE:
  requestPasswordReset: async (root, { input: { email } }, { User }: IContext) => {
    // Check if user exists
    const userFound = await User.findOne({ email })
    if (!userFound) throw new Error(`No such user found for email ${email}.`)

    // Set password reset token and it's expiry
    const passwordResetToken = generateToken(
      { id: userFound.id, email, username: userFound.username, fullName: userFound.fullName },
      process.env.SECRET!,
      RESET_PASSWORD_TOKEN_EXPIRY
    )
    const passwordResetTokenExpiry = Date.now() + RESET_PASSWORD_TOKEN_EXPIRY
    await User.findOneAndUpdate(
      { _id: userFound.id },
      { passwordResetToken, passwordResetTokenExpiry }
    )

    // Email user reset link
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?email=${email}&token=${passwordResetToken}`
    const mailOptions = {
      to: email,
      subject: 'Password Reset',
      html: resetLink,
    }

    await sendEmail(mailOptions)

    // Return success message
    return {
      message: `A link to reset your password has been sent to ${email}`,
    }
  },

  // DONE:
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
            $gte: Date.now() - RESET_PASSWORD_TOKEN_EXPIRY,
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
        process.env.SECRET!,
        AUTH_TOKEN_EXPIRY
      ),
    }
  },

  // DONE:
  updateUserInfo: combineResolvers(
    isAuthenticated,
    async (root, { input: { fullName } }, { authUser: { id }, User }: IContext) => {
      // FullName validation
      if (fullName.length < 4 || fullName.length > 40) {
        throw new Error(`Full name length should be between 4-40 characters.`)
      }

      const updatedUser = await User.findByIdAndUpdate(id, { $set: { fullName } }, { new: true })

      return updatedUser
    }
  ),

  // DONE:
  updateUserPhoto: combineResolvers(
    isAuthenticated,
    async (root, { input: { image, isCover } }, { authUser: { id, username }, User }: IContext) => {
      if (image) {
        const userFound = await User.findById(id)

        if (!userFound) throw new Error('User not found!')

        const uploadedFile = await uploadFile(username, image, ['image'])

        if (!uploadedFile) throw new Error('Failed to update Avatar, try again later')

        const fieldsToUpdate = {
          [isCover ? 'coverImage' : 'image']: uploadedFile.fileAddress,
          [isCover ? 'coverImagePublicId' : 'imagePublicId']: uploadedFile.filePublicId,
        }

        removeUploadedFile('image', userFound[isCover ? 'coverImage' : 'image']!)

        // Record the file metadata in the DB.
        await User.findByIdAndUpdate(id, { $set: fieldsToUpdate })

        return fieldsToUpdate
      } else {
        const fieldsToUpdate = {
          [isCover ? 'coverImage' : 'image']: undefined,
          [isCover ? 'coverImagePublicId' : 'imagePublicId']: undefined,
        }

        const userFound = await User.findByIdAndUpdate(id, {
          $set: fieldsToUpdate,
        })

        if (userFound) {
          removeUploadedFile('image', userFound[isCover ? 'coverImage' : 'image']!)
        }

        return fieldsToUpdate
      }
    }
  ),
}

// *_:
const Subscription = {
  // DONE:
  isUserOnline: {
    subscribe: withFilter(
      () => pubSub.asyncIterator(IS_USER_ONLINE),
      (payload, variables, _context) => variables.userId === payload.isUserOnline.userId
    ),
  },
}

export default { Query, Mutation, Subscription }
