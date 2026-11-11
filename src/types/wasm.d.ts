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

/** Precompiled WASM modules injected by scripts/patch-opennext-worker-wasm.mjs. */
declare global {
  var __HEAVIX_WASM_MODULES__:
    | {
        JPEG_DEC_WASM: WebAssembly.Module;
        PNG_WASM: WebAssembly.Module;
        WEBP_DEC_WASM: WebAssembly.Module;
        WEBP_ENC_WASM: WebAssembly.Module;
        RESIZE_WASM: WebAssembly.Module;
      }
    | undefined;
}
export {};
