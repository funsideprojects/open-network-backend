import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IMessage extends Document {
  sender: ObjectId
  receiver: ObjectId
  message: string
  seen: boolean
}

/**
 * Message schema that has reference to user schema
 */
const messageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    seen: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
)

export default model<IMessage>('Message', messageSchema)
