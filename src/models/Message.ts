import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IMessage extends Document {
  senderId: ObjectId
  recipientId: ObjectId
  message?: string
  image?: string
  imagePublicId?: string
  stickerId?: ObjectId
  seen: Array<ObjectId>
}

const messageSchema = new Schema(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    message: String,
    image: String,
    imagePublicId: String,
    stickerId: {
      type: Schema.Types.ObjectId,
      ref: 'Sticker',
    },
    seen: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
)

export default model<IMessage>('Message', messageSchema)
