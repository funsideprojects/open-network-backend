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

      case 'FOLLOWING': {
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
      const shouldAggregateLikeCount = requestedFields.some((f) => f.includes('posts.likeCount'))
      const shouldAggregateCommentCount = requestedFields.some((f) =>
        f.includes('posts.commentCount')
      )

      const posts = await Post.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
        ...(shouldAggregateLikeCount
          ? [
              {
                $lookup: {
                  from: 'likes',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id.postId', '$$postId'] } } },
                    { $project: { _id: 1 } }
                  ],
                  as: 'likeCount'
                }
              }
            ]
          : []),
        ...(shouldAggregateCommentCount
          ? [
              {
                $lookup: {
                  from: 'comments',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
                    { $project: { _id: 1 } }
                  ],
                  as: 'commentCount'
                }
              }
            ]
          : []),
        { $addFields: { id: '$_id' } },
        {
          $set: {
            ...(shouldAggregateLikeCount
              ? {
                  likeCount: {
                    $cond: {
                      if: { $isArray: '$likeCount' },
                      then: { $size: '$likeCount' },
                      else: 0
                    }
                  }
                }
              : {}),
            ...(shouldAggregateCommentCount
              ? {
                  commentCount: {
                    $cond: {
                      if: { $isArray: '$commentCount' },
                      then: { $size: '$commentCount' },
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

  /**
   * Gets posts from followed users
   *
   * @param {string} userId
   * @param {int} skip how many posts to skip
   * @param {int} limit how many posts to limit
   */
  // getFollowingPosts: combineResolvers(
  //   isAuthenticated,
  //   async (root, { userId, skip, limit }, { Post, Follow }: IContext) => {
  //     // Find user ids, that current user follows
  //     const userFollowing: Array<any> = []
  //     const follow = await Follow.find({ follower: userId }, { _id: 0 }).select('user')
  //     follow.map((f) => userFollowing.push(f.user))

  //     // Find user posts and followed posts by using userFollowing ids array
  //     const query = {
  //       $or: [{ author: { $in: userFollowing } }, { author: userId }]
  //     }
  //     const followedPostsCount = await Post.find(query).countDocuments()
  //     const followedPosts = await Post.find(query)
  //       .populate({
  //         path: 'author',
  //         populate: [
  //           { path: 'following' },
  //           { path: 'followers' },
  //           {
  //             path: 'notifications',
  //             populate: [
  //               { path: 'author' },
  //               { path: 'follow' },
  //               { path: 'like' },
  //               { path: 'comment' }
  //             ]
  //           }
  //         ]
  //       })
  //       .populate('likes')
  //       .populate({
  //         path: 'comments',
  //         options: { sort: { createdAt: 'desc' } },
  //         populate: { path: 'author' }
  //       })
  //       .skip(skip)
  //       .limit(limit)
  //       .sort({ createdAt: 'desc' })

  //     return { posts: followedPosts, count: followedPostsCount }
  //   }
  // ),

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
      const shouldAggregateLikeCount = requestedFields.some((f) => f.includes('likeCount'))
      const shouldAggregateCommentCount = requestedFields.some((f) => f.includes('commentCount'))

      const [post] = await Post.aggregate([
        { $match: { _id: postFound._id } },
        ...(shouldAggregateLikeCount
          ? [
              {
                $lookup: {
                  from: 'likes',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id.postId', '$$postId'] } } },
                    { $project: { _id: 1 } }
                  ],
                  as: 'likeCount'
                }
              }
            ]
          : []),
        ...(shouldAggregateCommentCount
          ? [
              {
                $lookup: {
                  from: 'comments',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
                    { $project: { _id: 1 } }
                  ],
                  as: 'commentCount'
                }
              }
            ]
          : []),
        { $addFields: { id: '$_id' } },
        {
          $set: {
            ...(shouldAggregateLikeCount
              ? {
                  likeCount: {
                    $cond: {
                      if: { $isArray: '$likeCount' },
                      then: { $size: '$likeCount' },
                      else: 0
                    }
                  }
                }
              : {}),
            ...(shouldAggregateCommentCount
              ? {
                  commentCount: {
                    $cond: {
                      if: { $isArray: '$commentCount' },
                      then: { $size: '$commentCount' },
                      else: 0
                    }
                  }
                }
              : {})
          }
        }
      ])

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
            ...(isPrivate ? { isPrivate } : {})
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
    }
  )
}

export default { Query, Mutation }
