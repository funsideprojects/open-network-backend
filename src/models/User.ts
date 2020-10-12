import { Document, Schema, model } from 'mongoose'
import { hashSync } from 'bcryptjs'

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
  lastActiveAt: string
}

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      validate: {
        validator: (value: string) => {
          console.log('value', value)

          return !(value.length < 4 || value.length > 40 || /\s\s|\r\n|\n|\r/g.test(value))
        },
        message: (props) => {
          console.log('zz', props)

          return ''
        },
      },
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
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
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
    try {
      const hash = hashSync(this.password, 10)
      Object.assign(this, { password: hash })
    } catch (error) {
      next(error)
    }
  }

  if (this.isModified('fullName')) {
    Object.assign(this, { fullName: this.fullName.trim() })
  }

  console.log('xxx', this.fullName)

  next()
})

// userSchema.post([''], function () {

// })

export default model<IUser>('User', userSchema)
