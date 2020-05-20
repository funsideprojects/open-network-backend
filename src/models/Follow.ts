import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IFollow extends Document {
  _id: {
    userId: ObjectId
    followerId: ObjectId
  }
}

const followSchema = new Schema(
  {
    _id: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      followerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  },
  {
    timestamps: true,
  }
)

export default model<IFollow>('Follow', followSchema)
