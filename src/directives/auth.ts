import { SchemaDirectiveVisitor, ApolloError } from 'apollo-server'
import { GraphQLField, defaultFieldResolver } from 'graphql'

import { IContext } from '_apollo-server'
import {
  TokenTypes,
  UserPayload,
  RefreshTokenPayload,
  verifyToken,
  generateToken,
  accessTokenMaxAge,
} from '_jsonwebtoken'

export class AuthDirective extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const originalResolve = field.resolve || defaultFieldResolver
    const isAuthOptional = this.args.optional

    field.resolve = function (root, args, context: Omit<IContext, 'authUser'>, info) {
      // ? Function to reissue access-token on demand
      const reissueAccessToken = ({ id, username, fullName }: UserPayload) => {
        if (!context.req.res) {
          throw new ApolloError(
            context.ERROR_MESSAGE['Internal Server Error'],
            context.HTTP_STATUS_CODE['Internal Server Error']
          )
        }

        const accessToken = generateToken({ type: TokenTypes.Access, payload: { id, username, fullName } })
        context.req.res.cookie(TokenTypes.Access, accessToken, {
          maxAge: accessTokenMaxAge,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
        })

        return { id, username, fullName }
      }

      // ? Access-token validation
      if (isAuthOptional || context.req.cookies[TokenTypes.Access]) {
        let authUser: UserPayload | undefined

        if (context.req.cookies[TokenTypes.Access]) {
          authUser = verifyToken(context.req.cookies[TokenTypes.Access])
        }

        if (!authUser && context.req.cookies[TokenTypes.Refresh]) {
          const decodedToken = verifyToken(context.req.cookies[TokenTypes.Refresh])

          if (decodedToken) {
            authUser = reissueAccessToken({
              id: decodedToken.id,
              username: decodedToken.username,
              fullName: decodedToken.fullName,
            })
          }
        }

        return originalResolve.apply(this, [root, args, { ...context, authUser }, info])
      } else if (context.req.cookies[TokenTypes.Refresh]) {
        // ? If the request has a valid refresh token instead, reissue new access token
        const decodedToken = verifyToken(context.req.cookies[TokenTypes.Refresh])

        if (decodedToken) {
          const authUser = reissueAccessToken({
            id: decodedToken.id,
            username: decodedToken.username,
            fullName: decodedToken.fullName,
          })

          return originalResolve.apply(this, [root, args, { ...context, authUser }, info])
        }
      }

      throw new ApolloError('Unauthenticated', context.HTTP_STATUS_CODE.Unauthorized)
    }
  }
}
