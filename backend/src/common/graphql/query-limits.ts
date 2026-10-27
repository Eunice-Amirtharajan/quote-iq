import {
  GraphQLError,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

export interface QueryLimits {
  /** Deepest field nesting allowed in one operation */
  maxDepth: number;
  /** Total fields in one operation, aliases included: stops "500 aliased copies" requests */
  maxFields: number;
}

interface Measure {
  depth: number;
  fields: number;
}

/**
 * Rejects operations that are too deep or select too many fields, before they execute.
 * Fragments are expanded; introspection fields (__schema, __type, …) are not counted, so dev
 * tooling keeps working (introspection itself is disabled in production).
 */
export function queryLimits(limits: QueryLimits): ValidationRule {
  return (context: ValidationContext) => ({
    OperationDefinition(operation) {
      const { depth, fields } = measure(
        operation.selectionSet,
        context,
        0,
        new Set(),
      );
      const name = operation.name?.value ?? 'anonymous operation';
      if (depth > limits.maxDepth) {
        context.reportError(
          new GraphQLError(
            `${name} is nested ${depth} levels deep; the limit is ${limits.maxDepth}`,
            { nodes: [operation] },
          ),
        );
      }
      if (fields > limits.maxFields) {
        context.reportError(
          new GraphQLError(
            `${name} selects ${fields} fields; the limit is ${limits.maxFields}`,
            { nodes: [operation] },
          ),
        );
      }
    },
  });
}

function measure(
  selectionSet: SelectionSetNode | undefined,
  context: ValidationContext,
  depth: number,
  // Fragments on the current path; a cycle is reported by graphql's own NoFragmentCycles rule
  visiting: Set<string>,
): Measure {
  const result: Measure = { depth, fields: 0 };
  for (const selection of selectionSet?.selections ?? []) {
    let child: Measure;
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value.startsWith('__')) continue;
      child = measure(selection.selectionSet, context, depth + 1, visiting);
      child.fields += 1;
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      child = measure(selection.selectionSet, context, depth, visiting);
    } else {
      const name = selection.name.value;
      const fragment = context.getFragment(name);
      if (!fragment || visiting.has(name)) continue;
      visiting.add(name);
      child = measure(fragment.selectionSet, context, depth, visiting);
      visiting.delete(name);
    }
    result.depth = Math.max(result.depth, child.depth);
    result.fields += child.fields;
  }
  return result;
}
