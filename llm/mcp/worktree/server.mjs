import { fileURLToPath } from "node:url";
import { createServer } from "./src/tools.mjs";
import { startStdio } from "./src/stdio.mjs";

const server = createServer();
if (process.argv[1] === fileURLToPath(import.meta.url)) startStdio(server);
