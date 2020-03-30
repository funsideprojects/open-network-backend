import { compare } from 'bcryptjs'
import { withFilter } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'
import { sync as mkdirSync } from 'mkdirp'
import { createWriteStream, unlinkSync } from 'fs'
import { extname } from 'path'
import { v4 } from 'uuid'

import { IS_USER_ONLINE } from 'constants/Subscriptions'
import { uploadToCloudinary, generateToken, sendEmail, pubSub, IContext } from 'utils'

// import { getRequestedFieldsFromInfo } from './functions'
import { isAuthenticated } from './high-order-resolvers'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

const AUTH_TOKEN_EXPIRY = '1y'
const RESET_PASSWORD_TOKEN_EXPIRY = 1000 * 60 * 60

const Query = {
  // DONE:
  getAuthUser: combineResolvers(
    isAuthenticated,
    async (root, args, { authUser, User }: IContext, info) => {
      // const requestedFields = getRequestedFieldsFromInfo(info)

      return await User.findOne({ email: authUser.email }, { isOnline: true })
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

  // // TODO:
  // getUserPosts: async (root, { username, skip, limit }, { User, Post }: IContext) => {
  //   const user = await User.findOne({ username }).select('_id')

  //   const query = { author: user!._id }
  //   const count = await Post.find(query).countDocuments()
  //   const posts = await Post.find(query)
  //     .populate({
  //       path: 'author',
  //       populate: [
  //         { path: 'following' },
  //         { path: 'followers' },
  //         {
  //           path: 'notifications',
  //           populate: [
  //             { path: 'author' },
  //             { path: 'follow' },
  //             { path: 'like' },
  //             { path: 'comment' }
  //           ]
  //         }
  //       ]
  //     })
  //     .populate('likes')
  //     .populate({
  //       path: 'comments',
  //       options: { sort: { createdAt: 'desc' } },
  //       populate: { path: 'author' }
  //     })
  //     .skip(skip)
  //     .limit(limit)
  //     .sort({ createdAt: 'desc' })

  //   return { posts, count }
  // },

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
          { _id: { $nin: currentFollowing.map(({ _id }) => _id.userId) } }
        ]
      }
      const count = await User.countDocuments(query)
      const users = await User.find(query).skip(skip).limit(limit).sort({ createdAt: 'desc' })

      return { users, count }
    }
  ),

  // DONE:
  searchUsers: combineResolvers(
    isAuthenticated,
    async (root, { searchQuery }, { authUser, User }: IContext) => {
      // Return an empty array if searchQuery isn't presented
      if (!searchQuery) return []

      const users = User.find({
        $or: [
          { username: new RegExp(searchQuery, 'i') },
          { fullName: new RegExp(searchQuery, 'i') }
        ],
        _id: {
          $ne: authUser.id
        }
      }).limit(50)

      return users
    }
  ),

  // DONE:
  suggestPeople: combineResolvers(
    isAuthenticated,
    async (root, { userId }, { authUser, User, Follow }: IContext) => {
      const LIMIT = 6

      // Find who user follows
      const currentFollowing = await Follow.find({ '_id.followerId': authUser.id })

      // Find random users
      const query = { _id: { $nin: currentFollowing.map(({ _id }) => _id.userId) } }
      const usersCount = await User.countDocuments(query)
      /* tslint:disable-next-line */
      let random = ~~(Math.random() * usersCount)

      const usersLeft = usersCount - random
      if (usersLeft < LIMIT) {
        random = random - (LIMIT - usersLeft)
        if (random < 0) random = 0
      }

      const randomUsers = await User.find(query).skip(random).limit(LIMIT)

      return randomUsers
    }
  ),

  // DONE:
  verifyResetPasswordToken: async (root, { email, token }, { User }: IContext) => {
    // Check if user exists and token is valid
    const userFound = await User.findOne({
      email,
      passwordResetToken: token,
      passwordResetTokenExpiry: {
        $gte: Date.now() - RESET_PASSWORD_TOKEN_EXPIRY
      }
    })
    if (!userFound) throw new Error('This token is either invalid or expired!')

    return { message: 'Success' }
  }
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
    if (fullName.length < 4 || fullName.length > 40)
      throw new Error(`Full name length should be between 4-40 characters.`)

    // Email validation
    // tslint:disable-next-line
    const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    if (!emailRegex.test(String(email).toLowerCase()))
      throw new Error('Please enter a valid email address.')

    // Username validation
    const usernameRegex = /^(?!.*\.\.)(?!.*\.$)[^\W][\w.]{0,29}$/
    if (!usernameRegex.test(username))
      throw new Error('Usernames can only use letters, numbers, underscores and periods.')

    if (username.length < 3 || username.length > 20)
      throw new Error('Username length should be between 3-50 characters.')

    // Username shouldn't equal to frontend route path
    const frontEndPages = [
      'forgot-password',
      'reset-password',
      'explore',
      'people',
      'notifications',
      'post'
    ]
    if (frontEndPages.includes(username))
      throw new Error(`This username isn't available. Please try another.`)

    // Password validation
    if (password.length < 6) throw new Error('Minimum password length should be 6 characters.')

    const newUser = await new User({
      fullName,
      email,
      username,
      password,
      lastActiveAt: new Date()
    }).save()

    return {
      token: generateToken(
        { id: newUser.id, email, username, fullName },
        process.env.SECRET!,
        AUTH_TOKEN_EXPIRY
      )
    }
  },

  // DONE:
  signin: async (root, { input: { emailOrUsername, password } }, { User }: IContext) => {
    const userFound = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }]
    })

    if (!userFound) throw new Error('User not found.')

    const isValidPassword = await compare(password, userFound.password)
    if (!isValidPassword) throw new Error('Invalid password.')

    // If user is authenticated, update it's isOnline field to true
    await User.findOneAndUpdate({ _id: userFound._id }, { $set: { isOnline: true } })

    return {
      token: generateToken(
        {
          id: userFound.id,
          email: userFound.email,
          username: userFound.username,
          fullName: userFound.fullName
        },
        process.env.SECRET!,
        AUTH_TOKEN_EXPIRY
      )
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
      { passwordResetToken, passwordResetTokenExpiry },
      { new: true }
    )

    // Email user reset link
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?email=${email}&token=${passwordResetToken}`
    const mailOptions = {
      to: email,
      subject: 'Password Reset',
      html: resetLink
    }

    await sendEmail(mailOptions)

    // Return success message
    return {
      message: `A link to reset your password has been sent to ${email}`
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
            $gte: Date.now() - RESET_PASSWORD_TOKEN_EXPIRY
          }
        }
      ]
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
      )
    }
  },

  // DONE:
  updateUserPhoto: combineResolvers(
    isAuthenticated,
    async (root, { input: { image, isCover } }, { authUser: { id, username }, User }: IContext) => {
      if (image) {
        const { createReadStream, filename } = await image
        const stream = createReadStream()
        const imagePublicId = v4()
        // Ensure upload path
        mkdirSync(`${UPLOAD_DIR}/${username}`)
        const imageAddress = `${username}/${imagePublicId}${extname(filename)}`
        const path = `${UPLOAD_DIR}/${imageAddress}`

        // Store the file in the filesystem.
        await new Promise((resolve, reject) => {
          const writeStream = createWriteStream(path)
          writeStream.on('finish', resolve)
          writeStream.on('error', (error) => {
            unlinkSync(path)
            reject(error)
          })

          stream.on('error', (error) => writeStream.destroy(error))
          stream.pipe(writeStream)
        })

        const fieldsToUpdate = {
          [isCover ? 'coverImage' : 'image']: imageAddress,
          [isCover ? 'coverImagePublicId' : 'imagePublicId']: imagePublicId
        }

        // Record the file metadata in the DB.
        await User.findByIdAndUpdate(id, { $set: fieldsToUpdate })

        return fieldsToUpdate
      } else {
        const fieldsToUpdate = {
          [isCover ? 'coverImage' : 'image']: undefined,
          [isCover ? 'coverImagePublicId' : 'imagePublicId']: undefined
        }

        const userFound = await User.findByIdAndUpdate(id, {
          $set: fieldsToUpdate
        })

        if (userFound)
          try {
            unlinkSync(`${UPLOAD_DIR}/${userFound[isCover ? 'coverImage' : 'image']}`)
          } catch {
            console.log('Failed to unlink, file does not exist')
          }

        return fieldsToUpdate
      }
    }
  )
}

const Subscription = {
  // DONE:
  isUserOnline: {
    subscribe: withFilter(
      () => pubSub.asyncIterator(IS_USER_ONLINE),
      (payload, variables, _context) => variables.userId === payload.isUserOnline.userId
    )
  }
}

export default { Query, Mutation, Subscription }
