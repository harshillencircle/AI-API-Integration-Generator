/** Orders items so each item's dependencies (within the same set) come first. Tolerates cycles. */
export function topoSort<T extends string>(items: T[], depsOf: (item: T) => T[]): T[] {
  const itemSet = new Set(items);
  const ordered: T[] = [];
  const done = new Set<T>();

  const visit = (item: T, stack: Set<T>) => {
    if (done.has(item) || stack.has(item)) return;
    stack.add(item);
    for (const dep of depsOf(item)) {
      if (itemSet.has(dep)) visit(dep, stack);
    }
    stack.delete(item);
    if (!done.has(item)) {
      done.add(item);
      ordered.push(item);
    }
  };

  for (const item of items) visit(item, new Set());
  return ordered;
}
