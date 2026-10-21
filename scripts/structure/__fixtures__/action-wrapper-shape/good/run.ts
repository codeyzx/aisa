export function runAction<T>(
  capability: string,
  fn: () => Promise<T>,
): Promise<T> {
  void capability
  return fn()
}
