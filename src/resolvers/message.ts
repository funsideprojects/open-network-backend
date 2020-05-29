import { Types } from 'mongoose'
import { withFilter } from 'apollo-server'
import { combineResolvers } from 'graphql-resolvers'

import { isAuthenticated } from './high-order-resolvers/authenticate'

import { IContext, pubSub } from '../utils/apollo-server'
import { MESSAGE_CREATED, NEW_CONVERSATION } from '../constants/Subscriptions'

const Query = {
  // /**
  //  * Gets user's specific conversation
  //  *
  //  * @param {string} authUserId
  //  * @param {string} userId
  //  */
  // getMessages: combineResolvers(
  //   isAuthenticated,
  //   async (root, { authUserId, userId }, { Message }: IContext) => {
  //     const specificMessage = await Message.find()
  //       .and([
  //         { $or: [{ sender: authUserId }, { receiver: authUserId }] },
  //         { $or: [{ sender: userId }, { receiver: userId }] },
  //       ])
  //       .populate('sender')
  //       .populate('receiver')
  //       .sort({ updatedAt: 'asc' })
  //     return specificMessage
  //   }
  // ),
  // /**
  //  * Get users with whom authUser had a conversation
  //  *
  //  * @param {string} authUserId
  //  */
  // getConversations: combineResolvers(
  //   isAuthenticated,
  //   async (root, { authUserId }, { User, Message }: IContext) => {
  //     // Get users with whom authUser had a chat
  //     const users = await User.findById(authUserId).populate(
  //       'messages',
  //       'id username fullName image isOnline'
  //     )
  //     // Get last messages with wom authUser had a chat
  //     const lastMessages = await Message.aggregate([
  //       {
  //         $match: {
  //           $or: [
  //             {
  //               receiver: Types.ObjectId(authUserId),
  //             },
  //             {
  //               sender: Types.ObjectId(authUserId),
  //             },
  //           ],
  //         },
  //       },
  //       {
  //         $sort: { createdAt: -1 },
  //       },
  //       {
  //         $group: {
  //           _id: '$sender',
  //           doc: {
  //             $first: '$$ROOT',
  //           },
  //         },
  //       },
  //       { $replaceRoot: { newRoot: '$doc' } },
  //     ])
  //     // Attach message properties to users
  //     const conversations: Array<any> = []
  //     users!..map((u: any) => {
  //       const user: any = {
  //         id: u.id,
  //         username: u.username,
  //         fullName: u.fullName,
  //         image: u.image,
  //         isOnline: u.isOnline,
  //       }
  //       const sender = lastMessages.find((m) => u.id === m.sender.toString())
  //       if (sender) {
  //         user.seen = sender.seen
  //         user.lastMessageCreatedAt = sender.createdAt
  //         user.lastMessage = sender.message
  //         user.lastMessageSender = false
  //       } else {
  //         const receiver = lastMessages.find((m) => u.id === m.receiver.toString())
  //         if (receiver) {
  //           user.seen = receiver.seen
  //           user.lastMessageCreatedAt = receiver.createdAt
  //           user.lastMessage = receiver.message
  //           user.lastMessageSender = true
  //         }
  //       }
  //       conversations.push(user)
  //     })
  //     // Sort users by last created messages date
  //     const sortedConversations = conversations.sort((a, b) =>
  //       b.lastMessageCreatedAt.toString().localeCompare(a.lastMessageCreatedAt)
  //     )
  //     return sortedConversations
  //   }
  // ),
}

const Mutation = {
  createMessage: combineResolvers(
    isAuthenticated,
    async (root, { input: { message, sender, receiver } }, { Message, User }: IContext) => {}
  ),
  // /**
  //  * Updates message seen values for user
  //  *
  //  * @param {string} userId
  //  */
  // updateMessageSeen: combineResolvers(
  //   isAuthenticated,
  //   async (root, { input: { sender, receiver } }, { Message }: IContext) => {
  //     try {
  //       await Message.update({ receiver, sender, seen: false }, { seen: true }, { multi: true })
  //       return true
  //     } catch (e) {
  //       return false
  //     }
  //   }
  // ),
}

const Subscription = {
  /**
   * Subscribes to message created event
   */
  messageCreated: {
    subscribe: withFilter(
      () => pubSub.asyncIterator(MESSAGE_CREATED),
      ({ messageCreated: { sender, receiver } }, { authUserId, userId }) => {
        const isAuthUserSenderOrReceiver = authUserId === sender.id || authUserId === receiver.id
        const isUserSenderOrReceiver = userId === sender.id || userId === receiver.id

        return isAuthUserSenderOrReceiver && isUserSenderOrReceiver
      }
    ),
  },

  /**
   * Subscribes to new conversations event
   */
  newConversation: {
    subscribe: withFilter(
      () => pubSub.asyncIterator(NEW_CONVERSATION),
      (payload, variables, { authUser }) =>
        authUser && authUser.id === payload.newConversation.receiverId
    ),
  },
}

export default { Query, Mutation, Subscription }
