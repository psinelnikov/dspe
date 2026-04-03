import { startServer } from "./server.js";
import { register, reportState } from "../app/index.js";

startServer(register, reportState);
