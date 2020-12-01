import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface INotification extends Document {
  type: string
  postId?: ObjectId
  comentId?: ObjectId
  fromId: Array<ObjectId>
  toId: ObjectId
  seen: boolean
}

const notificationSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
    },
    commentId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
    },
    fromId: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    toId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    seen: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

notificationSchema.set('toObject', {
  versionKey: false,
  transform: ({ _id }, { __v, ...restConvertedDocument }) => {
    return Object.assign({}, { id: _id }, restConvertedDocument)
  },
})

export default model<INotification>('Notification', notificationSchema)
