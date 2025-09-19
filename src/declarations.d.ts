declare module 'ffi-napi' {
  export function Library(library: string, functions: any): any;
}

declare module 'ref-napi' {
  export function alloc(type: any): any;
  export const types: {
    uint32: any;
    ushort: any;
    int32: any;
    uint64: any;
  };
}

declare module 'ref-struct-napi' {
  export default function Struct(definition: any): any;
}

declare module 'chokidar' {
  export interface FSWatcher {
    on(event: string, callback: (path: string) => void): void;
    close(): void;
  }
  
  export function watch(paths: string | string[], options?: any): FSWatcher;
}