import {
  createMultiParser,
  type MultiParserBuilder,
  type SingleParserBuilder,
} from 'nuqs/server'

/**
 * Wrap a scalar nuqs parser so repeated query keys are invalid rather than
 * silently selecting the first value. Nuqs otherwise follows URLSearchParams.get.
 */
export function parseAsStrictSingle<T>(
  parser: SingleParserBuilder<T>,
): MultiParserBuilder<T> {
  return createMultiParser({
    parse(values) {
      return values.length === 1 ? parser.parse(values[0]) : null
    },
    serialize(value) {
      return [parser.serialize(value)]
    },
    eq: parser.eq,
  })
}
