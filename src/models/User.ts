import { Document, Schema, model } from 'mongoose'
import { hashSync } from 'bcryptjs'

import { serverTimezoneOffset } from 'constants/Date'
import { fullNameRegex, emailRegex, usernameRegex, passwordRegex } from 'constants/RegExr'

export interface IUser extends Document {
  fullName: string
  email: string
  emailVerificationToken?: string
  emailVerified: boolean
  username: string
  password: string
  passwordResetToken?: string
  image?: string
  imagePublicId?: string
  coverImage?: string
  coverImagePublicId?: string
  visibleToEveryone: boolean
  online: boolean
  displayOnlineStatus: boolean
  lastActiveAt: Date
}

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      minlength: [1, 'Full name length should be between 1 and 40 characters'],
      maxlength: [40, 'Full name length should be between 1 and 40 characters'],
      validate: {
        validator: fullNameRegex,
        message: () => {
          return 'Full name should not contain double white-spaces, tab and new-line.'
        },
      },
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      validate: {
        validator: emailRegex,
        message: () => {
          return 'Email address is invalid'
        },
      },
      lowercase: true,
      trim: true,
      unique: true,
    },
    emailVerificationToken: String,
    emailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      minlength: [3, 'Username length should be between 3 and 20 characters'],
      maxlength: [20, 'Username length should be between 3 and 20 characters'],
      validate: {
        validator: usernameRegex,
        message: () => {
          return 'Username can only contain letters(a-z), numbers(0-9), underscore(_) and dot(.)'
        },
      },
      lowercase: true,
      trim: true,
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    passwordResetToken: String,
    image: String,
    imagePublicId: String,
    coverImage: String,
    coverImagePublicId: String,
    visibleToEveryone: {
      type: Boolean,
      required: true,
      default: true,
    },
    online: {
      type: Boolean,
      required: true,
      default: false,
    },
    displayOnlineStatus: {
      type: Boolean,
      required: true,
      default: true,
    },
    lastActiveAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: {
      currentTime: () => new Date(Date.now() + serverTimezoneOffset),
    },
  }
)

userSchema.set('toObject', {
  versionKey: false,
  transform: ({ _id }, { __v, ...restConvertedDocument }) => {
    return Object.assign({}, { id: _id }, restConvertedDocument)
  },
})

// ? Hash user's password before saving
userSchema.pre<IUser>('save', function (next) {
  const modifiedPaths = this.modifiedPaths()

  if (modifiedPaths.indexOf('password') > -1) {
    if (this.password?.length < 6) {
      return next(new Error('Minimum password length should be 6 characters.'))
    }

    if (!passwordRegex.test(this.password)) {
      return next(new Error('Password only accept word, digit and certain types of special characters'))
    }

    try {
      const hash = hashSync(this.password, 10)
      Object.assign(this, { password: hash })
    } catch (error) {
      return next(error)
    }
  }

  if (modifiedPaths.indexOf('email') > -1) {
    Object.assign(this, { emailVerificationToken: undefined, emailVerified: false })
  }

  next()
})

export default model<IUser>('User', userSchema)
