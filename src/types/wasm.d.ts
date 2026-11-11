declare module "*.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}

declare module "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
declare module "@jsquash/png/codec/pkg/squoosh_png_bg.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
declare module "@jsquash/webp/codec/dec/webp_dec.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
declare module "@jsquash/webp/codec/enc/webp_enc.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
declare module "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}

/** Cloudflare Wrangler [wasm_modules] globals injected into the Worker bundle. */
declare const JPEG_DEC_WASM: WebAssembly.Module;
declare const PNG_WASM: WebAssembly.Module;
declare const WEBP_DEC_WASM: WebAssembly.Module;
declare const WEBP_ENC_WASM: WebAssembly.Module;
declare const RESIZE_WASM: WebAssembly.Module;
