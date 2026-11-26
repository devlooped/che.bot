// The imports of card.ts that Vite resolves: a WebAssembly module, and a font as a data URL.
declare module "*.wasm?module" {
  const module: WebAssembly.Module;
  export default module;
}
declare module "*.ttf?inline" {
  const dataUrl: string;
  export default dataUrl;
}
