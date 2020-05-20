import { SchemaDirectiveVisitor } from 'apollo-server'
// import { defaultFieldResolver } from 'graphql'

export class DebugDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    console.log(field)
  }
}
