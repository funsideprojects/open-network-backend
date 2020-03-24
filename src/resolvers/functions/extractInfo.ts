import { GraphQLResolveInfo, FragmentDefinitionNode, SelectionSetNode } from 'graphql'

function getField(
  fragments: { [key: string]: FragmentDefinitionNode },
  selectionSet?: SelectionSetNode,
  fieldName?: string
) {
  if (selectionSet?.selections)
    return selectionSet?.selections.flatMap((fn) => {
      switch (fn.kind) {
        case 'Field': {
          const concatenatedFieldName = `${fieldName ? `${fieldName}.` : ''}${fn.name.value}`
          if (fn.selectionSet)
            return getField(
              fragments,
              fn.selectionSet,
              fieldName ? concatenatedFieldName : fn.name.value
            )

          return concatenatedFieldName
        }
        case 'FragmentSpread': {
          return getField(fragments, fragments[fn.name.value].selectionSet, fieldName ?? undefined)
        }

        case 'InlineFragment': {
          if (fn.selectionSet) return getField(fragments, fn.selectionSet, fieldName ?? undefined)

          return undefined
        }

        default: {
          return undefined
        }
      }
    })

  return undefined
}

export function getRequestedFieldsFromInfo({ fieldNodes, fragments }: GraphQLResolveInfo) {
  if (fieldNodes.length)
    return fieldNodes
      .flatMap(({ selectionSet }) => getField(fragments, selectionSet))
      .filter((field) => typeof field !== 'undefined')

  return []
}
