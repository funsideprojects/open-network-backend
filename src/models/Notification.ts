import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface INotification extends Document {
  type: string
  relativeData: string
  authorId: ObjectId
  seen: boolean
}

/**
 * Notification schema that has references to User, Like, Follow and Comment schemas
 */
const notificationSchema = new Schema(
  {
    type: {
      type: String,
      required: true
    },
    relativeData: String,
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
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
