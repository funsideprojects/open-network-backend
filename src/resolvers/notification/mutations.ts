import { Types } from 'mongoose'

import { IContext } from '_apollo-server'

import { NotiPubsubOperation, NotiPubsubType, pubsubNotification } from './subscriptions'

export const Mutation = {
  updateNotificationSeen: async (root, { input: { ids, seenAll } }, { authUser, Notification }: IContext) => {
    if (ids || typeof seenAll === 'boolean') {
      let updateResult

      if (seenAll) {
        updateResult = await Notification.updateMany(
          { $and: [{ toId: Types.ObjectId(authUser!.id) }, { seen: false }] },
          { $set: { seen: true } }
        )
      } else if (ids?.length) {
        updateResult = await Notification.updateMany(
          { $and: [{ _id: { $in: ids } }, { seen: false }] },
          { $set: { seen: true } }
        )
      }

      // ? PubSub
      if (updateResult?.nModified) {
        pubsubNotification({
          operation: NotiPubsubOperation.Create,
          type: NotiPubsubType.Notification,
          recipients: [authUser!.id],
        })
      }
    }

    return true
  },

  deleteNotification: async (root, { input: { id } }, { authUser, Notification }: IContext) => {
    if (id) {
      const deleteResult = await Notification.deleteOne({ _id: id })

      // ? PubSub
      if (deleteResult.deletedCount) {
        pubsubNotification({
          operation: NotiPubsubOperation.Delete,
          type: NotiPubsubType.Notification,
          recipients: [authUser!.id],
        })
      }
    }

    return true
  },
}
