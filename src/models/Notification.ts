import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface INotification extends Document {
  author: ObjectId
  user: ObjectId
  post: ObjectId
  like: ObjectId
  follow: ObjectId
  comment: ObjectId
  seen: boolean
}

/**
 * Notification schema that has references to User, Like, Follow and Comment schemas
 */
const notificationSchema = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    post: Schema.Types.ObjectId,
    like: {
      type: Schema.Types.ObjectId,
      ref: 'Like'
    },
    follow: {
      type: Schema.Types.ObjectId,
      ref: 'Follow'
    },
    comment: {
      type: Schema.Types.ObjectId,
      ref: 'Comment'
    },
    seen: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
)

export default model<INotification>('Notification', notificationSchema)
