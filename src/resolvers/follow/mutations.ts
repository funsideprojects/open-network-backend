import { ApolloError } from 'apollo-server-express'
import { Types } from 'mongoose'

import { IContext } from '_apollo-server'

import { pubsubNotification, NotiPubsubOperation, NotificationType } from 'resolvers/notification/subscriptions'

export const Mutation = {
  createFollow: async (
    root,
    { input: { userId } },
    { authUser, User, Follow, Notification, HTTP_STATUS_CODE }: IContext
  ) => {
    if (userId === authUser!.id) {
      throw new ApolloError('You can not follow yourself', HTTP_STATUS_CODE['Method Not Allowed'])
    }

    const userFound = await User.findById(userId)
    if (!userFound) throw new ApolloError('This user is no longer exists', HTTP_STATUS_CODE['Not Found'])
    if (
      !!(await Follow.findOne({
        $and: [{ '_id.userId': userId }, { '_id.followerId': authUser!.id }],
      }))
    ) {
      throw new ApolloError(HTTP_STATUS_CODE['Method Not Allowed'])
    }

    const [authUserFound] = await Promise.all([
      // ? Find authUser
      User.findById(authUser!.id).select({
        password: 0,
        passwordResetToken: 0,
        passwordResetTokenExpiry: 0,
      }),
      // ? Create follow
      new Follow({ _id: { userId, followerId: authUser!.id } }).save(),
      // ? Create notification
      new Notification({
        type: NotificationType.Follow,
        fromId: Types.ObjectId(authUser!.id),
        toId: Types.ObjectId(userId),
      }).save(),
    ])

    // * PubSub
    pubsubNotification({
      operation: NotiPubsubOperation.Create,
      type: NotificationType.Follow,
      data: authUser!.username,
      from: authUserFound,
      recipients: [userId],
    })

    return true
  },

  deleteFollow: async (
    root,
    { input: { userId } },
    { authUser, User, Follow, Notification, HTTP_STATUS_CODE }: IContext
  ) => {
    const userFound = await User.findById(userId)
    if (!userFound) throw new ApolloError('This user is no longer exists', HTTP_STATUS_CODE['Not Found'])

    await Promise.all([
      // ? Delete follow
      Follow.deleteOne({
        $and: [{ '_id.userId': userId }, { '_id.followerId': authUser!.id }],
      }),
      // ? Delete notification
      Notification.deleteOne({
        $and: [
          { type: NotificationType.Follow },
          { fromId: Types.ObjectId(authUser!.id) },
          { toId: Types.ObjectId(userId) },
        ],
      }),
    ])

    // * PubSub
    pubsubNotification({
      operation: NotiPubsubOperation.Delete,
      type: NotificationType.Follow,
      data: authUser!.username,
      recipients: [userId],
    })

    return true
  },
}
