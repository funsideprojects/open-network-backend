import { Document, Schema, model } from 'mongoose'
import { hashSync } from 'bcryptjs'

import { serverTimezoneOffset } from 'constants/Date'
import { fullNameRegex, emailRegex, usernameRegex, passwordRegex } from 'constants/RegExr'

export interface IUser extends Document {
  fullName: string
  email: string
  username: string
  password: string
  passwordResetToken?: string
  passwordResetTokenExpiry?: Date
  image?: string
  imagePublicId?: string
  coverImage?: string
  coverImagePublicId?: string
  isOnline: boolean
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
    passwordResetTokenExpiry: Date,
    image: String,
    imagePublicId: String,
    coverImage: String,
    coverImagePublicId: String,
    isOnline: {
      type: Boolean,
      required: true,
      default: false,
    },
    lastActiveAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: {
      currentTime: () => +new Date() + serverTimezoneOffset,
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
  if (this.isModified('password')) {
    if (!passwordRegex.test(this.password)) {
      return next(new Error('Password should not contain white-space, tab and new-line'))
    }

    if (this.password?.length < 6) {
      return next(new Error('Minimum password length should be 6 characters.'))
    }

    try {
      const hash = hashSync(this.password, 10)
      Object.assign(this, { password: hash })

      return next()
    } catch (error) {
      return next(error)
    }
  }
})

// userSchema.post<IUser>('save', (doc, next) => {
//   next()
// })

export default model<IUser>('User', userSchema)
