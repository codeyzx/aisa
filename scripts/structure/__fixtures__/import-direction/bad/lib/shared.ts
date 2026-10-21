// BAD: shared (`lib/`) reaches DOWN into a feature — inverts the layering seam.
import { thing } from '../features/thing.ts'

export const shared = thing
