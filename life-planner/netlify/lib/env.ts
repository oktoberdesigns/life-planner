export function env(name: string): string | undefined {
  const g = globalThis as { Netlify?: { env: { get(k: string): string | undefined } } };
  return g.Netlify?.env.get(name) ?? process.env[name] ?? undefined;
}
