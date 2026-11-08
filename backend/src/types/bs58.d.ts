declare module "bs58" {
  export function encode(buffer: Uint8Array): string;
  export function decode(str: string): Uint8Array;
  const bs58: { encode: typeof encode; decode: typeof decode };
  export default bs58;
}
