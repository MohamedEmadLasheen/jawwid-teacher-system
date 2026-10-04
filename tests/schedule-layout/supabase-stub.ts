/**
 * Layout-test stub for `@/lib/supabase`. The layout tests render real
 * scheduling components with fixture data seeded directly into React Query,
 * so no query ever needs to reach the network — and the test suite can never
 * touch the real database.
 */
function chain(): any {
  const settled = Promise.resolve({ data: [], error: null });
  const proxy: any = new Proxy(settled, {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return (target as any)[prop].bind(target);
      }
      return () => proxy;
    },
  });
  return proxy;
}

export const supabase: any = { from: () => chain(), rpc: () => chain(), auth: {} };
export const supabaseAdmin: any = supabase;
export async function fetchAllRows<T>(): Promise<T[]> { return []; }
