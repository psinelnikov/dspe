import http from "http";
import { Action, DataFixed, ActionResult, HandlerFn, HandlerRegistration, StateReportFn, Framework } from "./types.js";
import { hexToBytes, bytes32ToString, bytesToHex, stringToBytes32 } from "./utils.js";

const VERSION = "0.1.0";

let appState: unknown = null;
const handlers: HandlerRegistration[] = [];
let stateReportFn: StateReportFn = () => ({});

const framework: Framework = {
  setState(state: unknown) {
    appState = state;
  },
  handle(opType: string, opCommand: string, handler: HandlerFn) {
    handlers.push({ opType, opCommand, handler });
  },
  getState() {
    return appState;
  },
};

function findHandler(opType: string, opCommand: string): HandlerFn | null {
  const opTypeBytes32 = stringToBytes32(opType);
  const opCmdBytes32 = stringToBytes32(opCommand);

  for (const h of handlers) {
    const hType = stringToBytes32(h.opType);
    const hCmd = stringToBytes32(h.opCommand);
    if (hType === opTypeBytes32 && (h.opCommand === "" || hCmd === opCmdBytes32)) {
      return h.handler;
    }
  }
  for (const h of handlers) {
    const hType = stringToBytes32(h.opType);
    if (hType === opTypeBytes32 && h.opCommand === "") {
      return h.handler;
    }
  }
  return null;
}

function parseDataFixed(rawHex: string): DataFixed | null {
  try {
    const bytes = hexToBytes(rawHex);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    return {
      opType: typeof parsed.opType === "string" ? bytes32ToString(parsed.opType) : "",
      opCommand: typeof parsed.opCommand === "string" ? bytes32ToString(parsed.opCommand) : "",
      originalMessage: parsed.originalMessage || "",
    };
  } catch {
    return null;
  }
}

function buildActionResult(
  action: Action,
  dataFixed: DataFixed | null,
  data: string | null,
  status: number,
  err: string | null
): ActionResult {
  return {
    data,
    status,
    log: err,
    version: stringToBytes32(VERSION),
    opType: dataFixed ? stringToBytes32(dataFixed.opType) : stringToBytes32(""),
    opCommand: dataFixed ? stringToBytes32(dataFixed.opCommand) : stringToBytes32(""),
  };
}

async function handleAction(body: string): Promise<ActionResult> {
  let action: Action;
  try {
    action = JSON.parse(body);
  } catch {
    return buildActionResult({ data: { message: "" } }, null, null, 0, "Invalid JSON");
  }

  const messageHex = action.data?.message;
  if (!messageHex) {
    return buildActionResult(action, null, null, 0, "Missing message");
  }

  const dataFixed = parseDataFixed(messageHex);
  if (!dataFixed) {
    return buildActionResult(action, null, null, 0, "Failed to parse DataFixed");
  }

  const handler = findHandler(dataFixed.opType, dataFixed.opCommand);
  if (!handler) {
    return buildActionResult(
      action,
      dataFixed,
      null,
      0,
      `Unsupported op type: ${dataFixed.opType}`
    );
  }

  try {
    const [data, status, err] = await handler(appState, dataFixed.originalMessage);
    return buildActionResult(action, dataFixed, data, status, err);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return buildActionResult(action, dataFixed, null, 0, msg);
  }
}

function handleState(): unknown {
  return {
    stateVersion: stringToBytes32(VERSION),
    state: stateReportFn(appState),
  };
}

export function startServer(
  registerFn: (fw: Framework) => void,
  reportStateFn: (state: unknown) => unknown
) {
  stateReportFn = reportStateFn;
  registerFn(framework);

  const port = parseInt(process.env.EXTENSION_PORT || "6662", 10);

  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/action") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        const result = await handleAction(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } else if (req.method === "GET" && req.url === "/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(handleState()));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    console.log(`TEE extension listening on port ${port}`);
  });
}
