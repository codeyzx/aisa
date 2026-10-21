// BAD: a tooling script that shells out to a raw destructive remove — the exact
// mis-aimable delete the house rule forbids (use trash or a scoped node:fs call).
import { execSync } from 'node:child_process'

export function clean(dir: string): void {
  execSync(`rm -rf ${dir}`)
}
