import { createHash } from "crypto";

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0) return new Uint8Array(0);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function keccak256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha3-256").update(data).digest());
}

export function stringToBytes32(str: string): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  const sliced = encoded.length > 32 ? encoded.slice(0, 32) : encoded;
  const padded = new Uint8Array(32);
  padded.set(sliced);
  return bytesToHex(padded);
}

export function bytes32ToString(hex: string): string {
  const bytes = hexToBytes(hex);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return new TextDecoder().decode(bytes.slice(0, end));
}

export function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

export function toBytes(v: string | Uint8Array): Uint8Array {
  if (typeof v === "string") return hexToBytes(v);
  return v;
}
