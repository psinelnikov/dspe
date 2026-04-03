import { getEthCode } from "../rpc.js";
import { hexToBytes } from "../../base/utils.js";

export function analyzeBytecode(bytecode: string): [boolean, number] {
  if (!bytecode || bytecode === "0x" || bytecode.length <= 2) {
    return [false, 70];
  }

  const bytes = hexToBytes(bytecode);
  let hasDelegateCall = false;
  let hasSelfDestruct = false;

  let i = 0;
  while (i < bytes.length) {
    const op = bytes[i];
    if (op >= 0x60 && op <= 0x7f) {
      i += op - 0x60 + 2;
      continue;
    }
    if (op === 0xf4) hasDelegateCall = true;
    if (op === 0xff) hasSelfDestruct = true;
    i += 1;
  }

  if (hasDelegateCall && hasSelfDestruct) return [false, 80];
  if (hasDelegateCall) return [false, 65];
  if (hasSelfDestruct) return [false, 70];
  if (bytes.length < 100) return [true, 30];
  return [true, 5];
}

export async function checkBytecode(target: `0x${string}`): Promise<[boolean, number]> {
  const code = await getEthCode(target);
  return analyzeBytecode(code);
}
