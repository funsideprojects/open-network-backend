import { Document, Schema, model } from 'mongoose'
import { genSalt, hash } from 'bcryptjs'

export interface IUser extends Document {
  fullName: string
  email: string
  username: string
  password: string
  passwordResetToken?: string
  passwordResetTokenExpiry?: number
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
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    passwordResetToken: String,
    passwordResetTokenExpiry: Number,
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
    timestamps: true,
  }
)

userSchema.set('toObject', {
  versionKey: false,
  transform: (doc, res) => {
    // Delete unused field
    delete res.__v

    // Assign id
    res.id = doc._id

    return res
  },
})

/** Hash user's password when saving it to DB */
userSchema.pre('save', function (next) {
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
