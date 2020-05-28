import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface ISetting extends Document {
  installedStickers: Array<ObjectId>
  userId: ObjectId
}

const settingSchema = new Schema(
  {
    installedStickerIds: [{ type: Schema.Types.ObjectId }],
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
)

export default model<ISetting>('Setting', settingSchema)
