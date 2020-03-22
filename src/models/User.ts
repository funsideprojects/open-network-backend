import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'
import { genSalt, hash } from 'bcryptjs'

export interface IUser extends Document {
  fullName: string
  email: string
  username: string
  passwordResetToken: string
  passwordResetTokenExpiry: Date
  password: string
  image: string
  imagePublicId: string
  coverImage: string
  coverImagePublicId: string
  isOnline: boolean

  posts: Array<ObjectId>
  likes: Array<ObjectId>
  comments: Array<ObjectId>
  followers: Array<ObjectId>
  following: Array<ObjectId>
  notifications: Array<ObjectId>
  messages: Array<ObjectId>
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
    passwordResetToken: String,
    passwordResetTokenExpiry: Date,
    password: {
      type: String,
      required: true
    },
    image: String,
    imagePublicId: String,
    coverImage: String,
    coverImagePublicId: String,
    isOnline: {
      type: Boolean,
      default: false
    },
    posts: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Post'
      }
    ],
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Like'
      }
    ],
    comments: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Comment'
      }
    ],
    followers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Follow'
      }
    ],
    following: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Follow'
      }
    ],
    notifications: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Notification'
      }
    ],
    messages: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
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
