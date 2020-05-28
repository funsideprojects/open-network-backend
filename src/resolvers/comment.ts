import { GraphQLResolveInfo } from 'graphql'
import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { IContext } from 'utils/apollo-server'
import Logger from 'utils/logger'

import { getRequestedFieldsFromInfo, uploadFile, removeUploadedFile } from './functions'
import { isAuthenticated } from './high-order-resolvers'
import { pubsubNotification } from './notification'

// *_:
const Query = {
  // DONE:
  getComments: async (
    root,
    { postId, skip, limit },
    { authUser, Post, Comment, ERROR_TYPES }: IContext,
    info: GraphQLResolveInfo
  ) => {
    // Ensure post exist
    const postFound = await Post.findById(postId)
    if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)

    // Check post privacy
    if (postFound.isPrivate) {
      if (!authUser || authUser.id !== postFound.authorId.toHexString()) {
        throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)
      }
    }

    const result = {}
    const requestedFields = getRequestedFieldsFromInfo(info)

    // Get data if requested
    if (requestedFields.includes('count')) {
      const count = await Comment.countDocuments({ postId })

      result['count'] = count
    }

    if (requestedFields.some((f) => f.includes('comments'))) {
      const shouldAggregateCommentsSticker = requestedFields.some((f) =>
        f.includes('comments.sticker.')
      )
      const shouldAggregateCommentsPost = requestedFields.some((f) => f.includes('comments.post.'))
      const shouldAggregateCommentsAuthor = requestedFields.some((f) =>
        f.includes('comments.author.')
      )

      const comments = await Comment.aggregate([
        { $match: { postId: Types.ObjectId(postId) } },
        { $sort: { createdAt: -1 } },
        ...(typeof skip === 'number' ? [{ $skip: skip }] : []),
        ...(typeof limit === 'number' ? [{ $limit: limit }] : []),
        ...(shouldAggregateCommentsSticker
          ? [
              {
                $lookup: {
                  from: 'stickers',
                  let: { stickerId: '$stickerId' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$stickerId'] } } },
                    { $set: { id: '$_id' } },
                  ],
                  as: 'sticker',
                },
              },
              { $unwind: { path: '$sticker', preserveNullAndEmptyArrays: true } },
            ]
          : []),
        ...(shouldAggregateCommentsPost
          ? [
              {
                $lookup: {
                  from: 'posts',
                  let: { postId: '$postId' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$postId'] } } },
                    { $set: { id: '$_id' } },
                  ],
                  as: 'post',
                },
              },
              { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
            ]
          : []),
        ...(shouldAggregateCommentsAuthor
          ? [
              {
                $lookup: {
                  from: 'users',
                  let: { authorId: '$authorId' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$authorId'] } } },
                    { $set: { id: '$_id' } },
                  ],
                  as: 'author',
                },
              },
              { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
            ]
          : []),
        { $set: { id: '$_id' } },
      ])

      result['comments'] = comments
    }

    return result
  },
}

// *_:
const Mutation = {
  // DONE:
  createComment: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { comment, image, stickerId, postId } },
      { authUser, Post, Sticker, File, Comment, User, Notification, ERROR_TYPES }: IContext
    ) => {
      if (((!comment || comment.trim() === '') && !image && !stickerId) || (image && stickerId)) {
        throw new Error(ERROR_TYPES.INVALID_INPUT)
      }

      let postFound = await Post.findById(postId).select({
        authorId: 1,
        isPrivate: 1,
        subscribers: 1,
      })
      if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)
      if (postFound.isPrivate && postFound.authorId.toHexString() !== authUser.id) {
        throw new Error(ERROR_TYPES.PERMISSION_DENIED)
      }

      let stickerFound
      if (stickerId) {
        stickerFound = await Sticker.findById(stickerId)

        if (!stickerFound) throw new Error(`sticker_${ERROR_TYPES.NOT_FOUND}`)
      }

      // Upload image
      let uploadedImage

      if (image) {
        const uploadedFile = await uploadFile(authUser.username, image, ['image'])
        if (!uploadedFile) throw new Error(ERROR_TYPES.UNKNOWN)

        uploadedImage = uploadedFile

        await new File({
          publicId: uploadedFile.filePublicId,
          filename: uploadedFile.filename,
          mimetype: uploadedFile.mimetype,
          encoding: uploadedFile.encoding,
          size: uploadedFile.fileSize,
          type: 'Comment',
          userId: authUser.id,
          deleted: false,
        }).save()
      }

      // New Comment
      const newComment = new Comment({
        ...(comment ? { comment } : {}),
        ...(uploadedImage ? { image: uploadedImage.fileAddress } : {}),
        ...(stickerId ? { stickerId } : {}),
        postId,
        authorId: authUser.id,
      })
      await newComment.save()
      const userFound = await User.findById(authUser.id).select({
        password: 0,
        passwordResetToken: 0,
        passwordResetTokenExpiry: 0,
      })

      // *: Send notification
      if (!postFound.isPrivate) {
        if (!postFound.subscribers.some((oid) => oid.toHexString() === authUser.id)) {
          postFound = await Post.findByIdAndUpdate(
            postId,
            { $addToSet: { subscribers: Types.ObjectId(authUser.id) } },
            { new: true }
          )
        }

        if (!postFound) {
          Logger.error(`Post not found for postId ${postId} AFTER UPDATE`)
        } else {
          const notificationsToUpdateSeen = await Notification.find({
            $and: [{ type: 'COMMENT' }, { postId }, { toId: { $in: postFound.subscribers } }],
          })

          await Promise.all([
            // Update old notifications to unseen
            Notification.updateMany(
              {
                $and: [
                  { type: 'COMMENT' },
                  { postId },
                  {
                    toId: {
                      $in: postFound.subscribers.filter(
                        (subId) => subId.toHexString() !== authUser.id
                      ),
                    },
                  },
                ],
              },
              {
                $set: { seen: false, commentId: newComment.id },
                $addToSet: { fromIds: Types.ObjectId(authUser.id) },
              }
            ),
            // Create new notifications for new subscribers
            Notification.insertMany(
              postFound.subscribers
                .filter(
                  (subId) =>
                    !notificationsToUpdateSeen.some(
                      ({ toId }) => toId.toHexString() === subId.toHexString()
                    ) && subId.toHexString() !== authUser.id
                )
                .map(
                  (subId) =>
                    new Notification({
                      type: 'COMMENT',
                      postId,
                      commentId: newComment.id,
                      fromIds: [authUser.id],
                      toId: subId,
                    })
                )
            ),
          ])

          // *: PubSub
          pubsubNotification({
            operation: 'CREATE',
            type: 'COMMENT',
            dataId: postFound.id,
            from: userFound,
            recipients: postFound.subscribers.filter(
              (subId) => subId.toHexString() !== authUser.id
            ),
          })
        }
      }

      return Object.assign({}, newComment.toObject(), {
        sticker: stickerFound,
        author: userFound,
      })
    }
  ),

  // DONE:
  updateComment: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { id, comment, image, stickerId, deleteImage, deleteSticker } },
      { authUser, Comment, File, ERROR_TYPES }: IContext
    ) => {
      const commentFound = await Comment.findById(id)
      if (!commentFound) throw new Error(`comment_${ERROR_TYPES.NOT_FOUND}`)
      if (commentFound.authorId.toHexString() !== authUser.id) {
        throw new Error(ERROR_TYPES.PERMISSION_DENIED)
      }

      const update = {}

      // Update comment
      if (comment && comment.trim() !== '') {
        update['comment'] = comment
      }

      // Update image
      if (image) {
        // Remove old image
        if (commentFound.image) {
          removeUploadedFile('image', commentFound.image)

          await File.updateOne(
            { publicId: commentFound.imagePublicId },
            { $set: { deleted: true } }
          )
        }

        // Upload new
        const uploadedFile = await uploadFile(authUser.username, image, ['image'])
        if (!uploadedFile) throw new Error(ERROR_TYPES.UNKNOWN)

        update['image'] = uploadedFile.fileAddress

        await new File({
          publicId: uploadedFile.filePublicId,
          filename: uploadedFile.filename,
          mimetype: uploadedFile.mimetype,
          encoding: uploadedFile.encoding,
          size: uploadedFile.fileSize,
          type: 'Comment',
          userId: authUser.id,
        }).save()
      } else if (typeof deleteImage === 'boolean' && deleteImage) {
        if (commentFound.image) {
          removeUploadedFile('image', commentFound.image)
          update['image'] = null
        }
      }

      // Update sticker
      if (stickerId) {
        update['stickerId'] = stickerId
      } else if (typeof deleteSticker === 'boolean' && deleteSticker) {
        update['stickerId'] = null
      }

      return !!(await Comment.findByIdAndUpdate(id, { $set: { ...update } }))
    }
  ),

  // DONE:
  deleteComment: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { id } },
      { authUser, Post, Comment, File, Notification, ERROR_TYPES }: IContext
    ) => {
      const commentFound = await Comment.findById(id)
      if (!commentFound) throw new Error(`comment_${ERROR_TYPES.NOT_FOUND}`)

      const postFound = await Post.findById(commentFound.postId)
      if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)

      if (
        commentFound.authorId.toHexString() !== authUser.id &&
        postFound.authorId.toHexString() !== authUser.id
      ) {
        throw new Error(ERROR_TYPES.PERMISSION_DENIED)
      }

      // Remove uploaded image
      if (commentFound.image) {
        removeUploadedFile('image', commentFound.image)

        await File.updateOne({ publicId: commentFound.imagePublicId }, { $set: { deleted: true } })
      }

      // Perform delete
      await Promise.all([
        // Delete comment
        Comment.findByIdAndRemove(id),
        // Delete related notification
        Notification.findOneAndRemove({
          $and: [
            { type: 'COMMENT' },
            { postId: commentFound.postId },
            { commentId: commentFound._id },
          ],
        }),
      ])

      // *: PubSub
      pubsubNotification({
        operation: 'DELETE',
        type: 'COMMENT',
        recipients: postFound?.subscribers.filter((subId) => subId.toHexString() !== authUser.id),
      })

      return true
    }
  ),
}

export default { Query, Mutation }
