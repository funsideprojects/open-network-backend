import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IMessage extends Document {
  senderId: ObjectId
  receiverId: ObjectId
  message: string
  seen: Array<ObjectId>
}

/**
 * Message schema that has reference to user schema
 */
const messageSchema = new Schema(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    seen: [
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

export default model<IMessage>('Message', messageSchema)
