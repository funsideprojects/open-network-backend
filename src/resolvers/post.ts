import { GraphQLResolveInfo } from 'graphql'
import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { IContext } from 'utils/apollo-server'

import { getRequestedFieldsFromInfo, uploadFile, removeUploadedFile } from './functions'
import { isAuthenticated } from './high-order-resolvers'

// *_:
const Query = {
  // DONE:
  getPosts: async (
    root,
    { type, username, skip, limit },
    { authUser, User, Post, Follow }: IContext,
    info: GraphQLResolveInfo
  ) => {
    let query
    switch (type) {
      case 'USER': {
        const userFound = await User.findOne({ username }).select('_id')
        if (!userFound) throw new Error('User not found')

        query = {
          $and: [
            { authorId: userFound._id },
            ...(authUser?.id !== userFound.id ? [{ isPrivate: false }] : [])
          ]
        }

        break
      }

      case 'FOLLOWED': {
        if (!authUser) throw new Error('Not signed in')
        const currentFollowing = await Follow.find({ '_id.followerId': authUser.id })

        query = {
          $or: [
            {
              $and: [
                { authorId: { $in: [...currentFollowing.map(({ _id }) => _id.userId)] } },
                { isPrivate: false }
              ]
            },
            {
              authorId: Types.ObjectId(authUser.id)
            }
          ]
        }

        break
      }

      case 'EXPLORE': {
        if (authUser) {
          const currentFollowing = await Follow.find({ '_id.followerId': authUser.id })

          query = {
            $and: [
              // { image: { $ne: null } },
              {
                authorId: {
                  $nin: [
                    ...currentFollowing.map(({ _id }) => _id.userId),
                    Types.ObjectId(authUser.id)
                  ]
                }
              },
              { isPrivate: false }
            ]
          }
        } else {
          query = {
            $and: [
              // { image: { $ne: null } },
              { isPrivate: false }
            ]
          }
        }

        break
      }

      default: {
        throw new Error('Invalid operation')
      }
    }

    const requestedFields = getRequestedFieldsFromInfo(info)
    const result = {}

    if (requestedFields.includes('count')) {
      const count = await Post.countDocuments(query)

      result['count'] = count
    }

    if (requestedFields.map((f) => f.includes('posts'))) {
      const shouldAggregateAuthor = requestedFields.some((f) => f.includes('posts.author'))
      const shouldAggregateLikes = requestedFields.some((f) => f.includes('posts.likes'))
      const shouldAggregateLikeCount = requestedFields.some((f) => f.includes('posts.likeCount'))
      const shouldAggregateCommentCount = requestedFields.some((f) =>
        f.includes('posts.commentCount')
      )
      const shouldAggregateComments = requestedFields.some((f) => f.includes('posts.comments'))

      const posts = await Post.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
        ...(shouldAggregateAuthor
          ? [
              {
                $lookup: {
                  from: 'users',
                  let: { authorId: '$authorId' },
                  pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$authorId'] } } }],
                  as: 'author'
                }
              },
              { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } }
            ]
          : []),
        ...(shouldAggregateLikeCount || shouldAggregateLikes
          ? [
              {
                $lookup: {
                  from: 'likes',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id.postId', '$$postId'] } } },
                    ...(shouldAggregateLikes
                      ? [
                          {
                            $lookup: {
                              from: 'users',
                              let: { userId: '$_id.userId' },
                              pipeline: [
                                { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                                { $set: { id: '$_id' } }
                              ],
                              as: 'user'
                            }
                          },
                          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
                        ]
                      : []),
                    { $project: { _id: 0 } }
                  ],
                  as: 'likes'
                }
              }
            ]
          : []),
        ...(shouldAggregateCommentCount || shouldAggregateComments
          ? [
              {
                $lookup: {
                  from: 'comments',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
                    ...(shouldAggregateComments
                      ? [
                          {
                            $lookup: {
                              from: 'users',
                              let: { authorId: '$authorId' },
                              pipeline: [
                                { $match: { $expr: { $eq: ['$_id', '$$authorId'] } } },
                                { $set: { id: '$_id' } }
                              ],
                              as: 'author'
                            }
                          },
                          { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
                          { $set: { id: '$_id' } }
                        ]
                      : [])
                  ],
                  as: 'comments'
                }
              }
            ]
          : []),
        {
          $set: {
            id: '$_id',
            ...(shouldAggregateAuthor ? { 'author.id': '$author._id' } : {}),
            ...(shouldAggregateLikeCount
              ? {
                  likeCount: {
                    $cond: {
                      if: { $isArray: '$likes' },
                      then: { $size: '$likes' },
                      else: 0
                    }
                  }
                }
              : {}),
            ...(shouldAggregateCommentCount
              ? {
                  commentCount: {
                    $cond: {
                      if: { $isArray: '$comments' },
                      then: { $size: '$comments' },
                      else: 0
                    }
                  }
                }
              : {})
          }
        }
      ])

      result['posts'] = posts
    }

    return result
  },

  // DONE:
  getPost: combineResolvers(
    async (root, { postId }, { authUser, Post }: IContext, info: GraphQLResolveInfo) => {
      const postFound = await Post.findById(postId).select({ _id: 1, isPrivate: 1, authorId: 1 })
      if (!postFound) throw new Error('Post not found!')

      if (postFound.isPrivate) {
        if (!authUser || authUser.id !== postFound.authorId.toHexString()) {
          throw new Error('Post not found')
        }
      }

      const requestedFields = getRequestedFieldsFromInfo(info)
      const shouldAggregateAuthor = requestedFields.some((f) => f.includes('author'))
      const shouldAggregateLikes = requestedFields.some((f) => f.includes('likes'))
      const shouldAggregateLikeCount = requestedFields.some((f) => f.includes('likeCount'))
      const shouldAggregateCommentCount = requestedFields.some((f) => f.includes('commentCount'))
      const shouldAggregateComments = requestedFields.some((f) => f.includes('comments'))

      const [post] = await Post.aggregate([
        { $match: { _id: postFound._id } },
        ...(shouldAggregateAuthor
          ? [
              {
                $lookup: {
                  from: 'users',
                  let: { authorId: '$authorId' },
                  pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$authorId'] } } }],
                  as: 'author'
                }
              },
              { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } }
            ]
          : []),
        ...(shouldAggregateLikeCount || shouldAggregateLikes
          ? [
              {
                $lookup: {
                  from: 'likes',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id.postId', '$$postId'] } } },
                    ...(shouldAggregateLikes
                      ? [
                          {
                            $lookup: {
                              from: 'users',
                              let: { userId: '$_id.userId' },
                              pipeline: [
                                { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                                { $set: { id: '$_id' } }
                              ],
                              as: 'user'
                            }
                          },
                          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
                        ]
                      : []),
                    { $project: { _id: 0 } }
                  ],
                  as: 'likes'
                }
              }
            ]
          : []),
        ...(shouldAggregateCommentCount || shouldAggregateComments
          ? [
              {
                $lookup: {
                  from: 'comments',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
                    ...(shouldAggregateComments
                      ? [
                          {
                            $lookup: {
                              from: 'users',
                              let: { authorId: '$authorId' },
                              pipeline: [
                                { $match: { $expr: { $eq: ['$_id', '$$authorId'] } } },
                                { $set: { id: '$_id' } }
                              ],
                              as: 'author'
                            }
                          },
                          { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
                          { $set: { id: '$_id' } }
                        ]
                      : [])
                  ],
                  as: 'comments'
                }
              }
            ]
          : []),
        {
          $set: {
            id: '$_id',
            ...(shouldAggregateAuthor ? { 'author.id': '$author._id' } : {}),
            ...(shouldAggregateLikeCount
              ? {
                  likeCount: {
                    $cond: {
                      if: { $isArray: '$likes' },
                      then: { $size: '$likes' },
                      else: 0
                    }
                  }
                }
              : {}),
            ...(shouldAggregateCommentCount
              ? {
                  commentCount: {
                    $cond: {
                      if: { $isArray: '$comments' },
                      then: { $size: '$comments' },
                      else: 0
                    }
                  }
                }
              : {})
          }
        }
      ])

      console.log(post)

      return post
    }
  )
}

// *_:
const Mutation = {
  // DONE:
  createPost: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { title, image, isPrivate = false } },
      { authUser: { id, username }, Post }: IContext
    ) => {
      if (!title && !image) throw new Error('Post title or image is required.')

      let imageUrl
      let imagePublicId
      if (image) {
        const uploadedResult = await uploadFile(username, image)

        imageUrl = uploadedResult.imageAddress
        imagePublicId = uploadedResult.imagePublicId
      }

      const newPost = await new Post({
        title,
        image: imageUrl,
        imagePublicId,
        authorId: id,
        isPrivate
      }).save()

      return newPost
    }
  ),

  // DONE:
  updatePost: combineResolvers(
    isAuthenticated,
    async (root, { input: { id, title, isPrivate } }, { authUser, Post }: IContext) => {
      if (!title && typeof isPrivate !== 'boolean') throw new Error('Nothing to update')
      const postFound = await Post.findById(id).select({ authorId: 1 })
      if (!postFound) throw new Error('Post not found!')
      if (postFound.authorId.toHexString() !== authUser.id) throw new Error('Perrmission denied!')

      try {
        await Post.findByIdAndUpdate(id, {
          $set: {
            ...(title ? { title } : {}),
            ...(typeof isPrivate === 'boolean' ? { isPrivate } : {})
          }
        })

        return true
      } catch {
        return false
      }
    }
  ),

  // FIXME:
  deletePost: combineResolvers(
    isAuthenticated,
    async (root, { input: { id } }, { Post, Like, Comment, Notification }: IContext) => {
      try {
        const postFound = await Post.findOne({ _id: id })
        if (!postFound) throw new Error('Post not found!')

        // Remove post image from upload
        if (postFound.image) {
          removeUploadedFile(postFound.image)
        }

        // Find post and remove it
        await Post.findByIdAndRemove(id)

        // Delete post likes from likes collection
        await Like.deleteMany({ '_id.postId': id })

        // Delete post comments from comments collection
        await Comment.deleteMany({ postId: id })

        // Remove notifications from notifications collection
        // await Notification.deleteMany({ relativeData: id })

        return true
      } catch {
        return false
      }
    }
  )
}

export default { Query, Mutation }
