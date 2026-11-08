declare module "bs58" {
  export function encode(buf: Uint8Array): string;
  export function decode(str: string): Uint8Array;
  const m: { encode: typeof encode; decode: typeof decode };
  export default m;
}
