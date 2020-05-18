import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface INotification extends Document {
  type: string
  additionalData?: string
  fromId: ObjectId
  toId: ObjectId
  seen: boolean
}

const notificationSchema = new Schema(
  {
    type: {
      type: String,
      required: true
    },
    additionalData: String,
    fromId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    toId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    seen: {
      type: Boolean,
      required: true,
      default: false
    }
  },
  {
    timestamps: true
  }
)

export default model<INotification>('Notification', notificationSchema)
