// The part of Vite's `import.meta` that the local Worker uses (it does not load vite/client).
interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, T>;
}
