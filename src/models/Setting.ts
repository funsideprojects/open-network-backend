import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface ISetting extends Document {
  installedStickers: Array<string>
  userId: ObjectId
}

const settingSchema = new Schema(
  {
    installedStickers: [{ type: String }],
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
