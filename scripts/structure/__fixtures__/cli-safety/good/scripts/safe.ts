// GOOD: shells out only to a non-destructive tool; deletion (if any) goes
// through node:fs or trash elsewhere.
import { execSync } from 'node:child_process'

export function build(): void {
  execSync('pnpm build', { stdio: 'inherit' })
}
