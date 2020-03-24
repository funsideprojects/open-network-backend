import { Document, Schema, model } from 'mongoose'
import { genSalt, hash } from 'bcryptjs'

export interface IUser extends Document {
  fullName: string
  email: string
  username: string
  password: string
  passwordResetToken: string
  passwordResetTokenExpiry: Date
  image: string
  imagePublicId: string
  coverImage: string
  coverImagePublicId: string
  isOnline: boolean
  lastActiveAt: string
}

/**
 * User schema that has references to Post, Like, Comment, Follow and Notification schemas
 */
const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true
    },
    username: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true
    },
    password: {
      type: String,
      required: true
    },
    passwordResetToken: String,
    passwordResetTokenExpiry: Date,
    image: String,
    imagePublicId: String,
    coverImage: String,
    coverImagePublicId: String,
    isOnline: {
      type: Boolean,
      default: false
    },
    lastActiveAt: Date
  },
  {
    timestamps: true
  }
)

/**
 * Hashes the users password when saving it to DB
 */
userSchema.pre('save', function(next) {
  if (!this.isModified('password')) return next()

  genSalt(10, (genSaltErr, salt) => {
    if (genSaltErr) return next(genSaltErr)

    hash((this as any).password, salt, (hashErr, hashedString) => {
      if (hashErr) return next(hashErr)

      Object.assign(this, { password: hashedString })
      next()
    })
  })
})

export default model<IUser>('User', userSchema)
