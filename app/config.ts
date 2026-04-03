export const VERSION = "0.1.0";

export const OP_TYPE_EVALUATE = "EVALUATE_RISK";
export const OP_COMMAND_DEFAULT = "";

export const FLARE_CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
export const FLR_USD_FEED_ID = "0x01464c522f55534400000000000000000000000000";

export const POLICY_REGISTRY_ADDR = process.env.POLICY_REGISTRY_ADDR || "";
export const AUDIT_LOG_ADDR = process.env.AUDIT_LOG_ADDR || "";
export const FLARE_RPC_URL = process.env.FLARE_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
export const EXPLORER_API_URL = process.env.EXPLORER_API_URL || "https://coston2-explorer.flare.network/api";
export const ERC7730_REGISTRY_BASE =
  "https://raw.githubusercontent.com/LedgerHQ/clear-signing-erc7730-registry/master/registry";
export const SIGN_PORT = parseInt(process.env.SIGN_PORT || "6661", 10);
