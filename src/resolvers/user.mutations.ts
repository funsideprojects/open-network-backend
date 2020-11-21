import { compare } from 'bcryptjs'
import { ApolloError } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'

import { serverTimezoneOffset } from 'constants/Date'
import { Mailer, UploadManager } from 'services'

import { IContext } from '_apollo-server'
import {
  generateToken,
  verifyToken,
  accessTokenMaxAge,
  refreshTokenMaxAge,
  resetPasswordTokenMaxAge,
} from '_jsonwebtoken'

import { isAuthenticated } from './high-order-resolvers'

export const Mutation = {
  signup: async (
    root,
    { input: { fullName, email, username, password, autoSignIn } },
    { User, HTTP_STATUS_CODE, ERROR_MESSAGE, req }: IContext
  ) => {
    // ? Throw error if express middleware failed to initialize response
    if (!req.res) {
      throw new ApolloError(ERROR_MESSAGE['Internal Server Error'], HTTP_STATUS_CODE['Internal Server Error'])
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
        throw new ApolloError(
          error.keyPattern.username
            ? '__USERNAME__This username has been taken already'
            : '__EMAIL__This email is already connected to an account',
          HTTP_STATUS_CODE['Bad Request'],
          error
        )
      }
      throw new ApolloError(error.message, HTTP_STATUS_CODE['Bad Request'], error)
    }

    if (autoSignIn) {
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
    } else {
      return true
    }
  },

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

    const isPasswordValid = await compare(password, userFound.password)
    // ? User found but the password was incorrect
    if (!isPasswordValid) {
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

  requestVerificationEmail: combineResolvers(
    isAuthenticated,
    async (root, args, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
      const userFound = await User.findById(authUser!.id)
      if (!userFound) {
        throw new ApolloError('Unauthorized', HTTP_STATUS_CODE.Unauthorized)
      }

      if (userFound.emailVerified) {
        throw new ApolloError('Email linked to this account has been verified already', HTTP_STATUS_CODE['Bad Request'])
      }

      const user = {
        id: userFound.id,
        email: userFound.email,
        username: userFound.username,
        fullName: userFound.fullName,
      }

      // ? Set password reset token and it's expiry
      const emailVerificationToken = generateToken(user, 'emailVerification')

      await User.findOneAndUpdate({ _id: userFound.id }, { emailVerificationToken })

      // ? Send an email contain reset link
      const emailVerificationLink = `${process.env.CORS_ORIGIN}/verify-email/${emailVerificationToken}`
      // todo Enhance html template
      const mailOptions = {
        to: userFound.email,
        subject: 'Verify Email',
        html: emailVerificationLink,
      }

      await Mailer.sendMail(mailOptions)

      return true
    }
  ),

  verifyUserEmail: async (root, { input: { token } }, { User, HTTP_STATUS_CODE }: IContext) => {
    const authUser = verifyToken(token)
    if (authUser) {
      throw new ApolloError('This token is either invalid or expired', HTTP_STATUS_CODE['Bad Request'])
    }

    const userFound = await User.findOne({ emailVerificationToken: token })
    if (!userFound) {
      throw new ApolloError('This token is either invalid or expired', HTTP_STATUS_CODE['Bad Request'])
    }

    userFound.emailVerificationToken = undefined
    userFound.emailVerified = true
    await userFound.save()

    return !!authUser
  },

  requestPasswordReset: async (root, { input: { email, username } }, { User, HTTP_STATUS_CODE }: IContext) => {
    if ((!email && !username) || (email && username)) {
      throw new ApolloError('__INPUT__Invalid arguments', HTTP_STATUS_CODE['Bad Request'])
    }

    const userFound = await User.findOne({ ...(email ? { email } : { username }) })
    if (!userFound) {
      throw new ApolloError(
        `__INPUT__No such user found for this ${email ? 'email' : 'username'}`,
        HTTP_STATUS_CODE['Bad Request']
      )
    }

    if (!userFound.emailVerified) {
      throw new ApolloError(
        '__INPUT__Email address linked to this account has not been verified. Please contact administrator to reset your password',
        HTTP_STATUS_CODE['Bad Request']
      )
    }

    const user = {
      id: userFound.id,
      email: userFound.email,
      username: userFound.username,
      fullName: userFound.fullName,
    }

    const passwordResetToken = generateToken(user, 'resetPassword')

    await User.findOneAndUpdate({ _id: userFound.id }, { passwordResetToken })

    // ? Send an email contain reset link
    const resetLink = `${process.env.CORS_ORIGIN}/reset-password/${passwordResetToken}`
    // todo Enhance html template
    const mailOptions = {
      to: userFound.email,
      subject: 'Password Reset',
      html: resetLink,
    }

    await Mailer.sendMail(mailOptions)

    return true
  },

  resetPassword: async (root, { input: { token, password } }, { User, HTTP_STATUS_CODE }: IContext) => {
    // ? Validate token
    const authUser = verifyToken(token)
    if (!authUser) {
      throw new ApolloError('This token is either invalid or expired', HTTP_STATUS_CODE['Bad Request'])
    }

    const userFound = await User.findOne({ passwordResetToken: token })
    if (!userFound) {
      throw new ApolloError('This token is either invalid or expired', HTTP_STATUS_CODE['Bad Request'])
    }

    // ? Update password and reset token
    userFound.passwordResetToken = undefined
    userFound.password = password
    await userFound.save()

    return true
  },

  updateUserPassword: combineResolvers(
    isAuthenticated,
    async (root, { input: { password, newPassword } }, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
      const userFound = await User.findById(authUser!.id)
      if (!userFound) {
        throw new ApolloError('Unauthorized', HTTP_STATUS_CODE.Unauthorized)
      }

      const isPasswordValid = await compare(password, userFound.password)
      // ? User found but the password was incorrect
      if (!isPasswordValid) {
        throw new ApolloError(`Current password is incorrect`, HTTP_STATUS_CODE['Bad Request'])
      }

      // ? Update password, reset token and it's expiry
      userFound.passwordResetToken = undefined
      userFound.password = newPassword
      await userFound.save()

      return true
    }
  ),

  updateUserInfo: combineResolvers(
    isAuthenticated,
    async (root, { input: { fullName } }, { authUser, User }: IContext) => {
      return await User.findByIdAndUpdate(authUser!.id, { $set: { fullName } }, { new: true, runValidators: true })
    }
  ),

  updateUserPhoto: combineResolvers(
    isAuthenticated,
    async (root, { input: { image, isCover } }, { authUser, User, HTTP_STATUS_CODE }: IContext) => {
      let fieldsToUpdate: { [key: string]: string | undefined }

      const userFound = await User.findById(authUser!.id)
      if (!userFound) {
        throw new ApolloError('Unauthorized', HTTP_STATUS_CODE.Unauthorized)
      }

      if (image) {
        const uploadedFile = await UploadManager.uploadFile(authUser!.username, image, ['image'])

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

      const updatedUser = await User.findByIdAndUpdate(authUser!.id, { $set: fieldsToUpdate }, { new: true })

      return updatedUser
    }
  ),
}
