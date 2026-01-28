import fs from "node:fs";
import path from "node:path";

const schemaSource = path.resolve("src", "main", "db", "schema.sql");
const schemaDestination = path.resolve("dist", "main", "db", "schema.sql");

fs.mkdirSync(path.dirname(schemaDestination), { recursive: true });
fs.copyFileSync(schemaSource, schemaDestination);
console.log(`Copied schema to ${schemaDestination}`);

const wasmSource = path.resolve("node_modules", "sql.js", "dist", "sql-wasm.wasm");
const wasmDestination = path.resolve("dist", "main", "sql-wasm.wasm");

if (fs.existsSync(wasmSource)) {
  fs.copyFileSync(wasmSource, wasmDestination);
  console.log(`Copied sql.js wasm to ${wasmDestination}`);
}
