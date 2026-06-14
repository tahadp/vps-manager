#!/usr/bin/env node
/*
 * sync-proto.js
 * ----------------------------------------------------------------------------
 * Ensures the canonical proto contract at /proto/vps.proto (source of truth,
 * shared with the Go agent) is mirrored into /server/proto/vps.proto before
 * the server build runs `tsc` and the proto loader is invoked at runtime.
 *
 * The server copy is what `@grpc/proto-loader` reads during gRPC bootstrap;
 * if it is missing or stale, the gRPC server crashes on boot.
 *
 * Modes:
 *   default   : copy root -> server if they differ (sha256). Exit 0 on success.
 *   --check   : compare only, do not write. Exit 1 if drift detected.
 *
 * Failure policy:
 *   - If the root proto is missing, exit 1. Builds must fail loudly rather
 *     than ship a server with an unverified/stale proto.
 *   - If the server copy is missing on first sync, it is created.
 *
 * Bypassing this step is not supported; if you need a divergent server-only
 * proto, the contract should be split, not shadowed here.
 * ----------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_PROTO = path.resolve(__dirname, '..', '..', 'proto', 'vps.proto');
const SERVER_PROTO = path.resolve(__dirname, '..', 'proto', 'vps.proto');
const CHECK_ONLY = process.argv.includes('--check');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const fail = (reason) => {
  console.error(`proto sync: FAILED: ${reason}`);
  process.exit(1);
};

const main = () => {
  if (!fs.existsSync(ROOT_PROTO)) {
    fail(`root proto not found at ${ROOT_PROTO}`);
  }

  const rootBuf = fs.readFileSync(ROOT_PROTO);
  const rootHash = sha256(rootBuf);

  let serverHash = null;
  if (fs.existsSync(SERVER_PROTO)) {
    serverHash = sha256(fs.readFileSync(SERVER_PROTO));
  }

  if (serverHash === rootHash) {
    console.log('proto sync: up-to-date');
    process.exit(0);
  }

  if (CHECK_ONLY) {
    fail(`drift detected (root sha256=${rootHash.slice(0, 12)}, server ${serverHash ? `sha256=${serverHash.slice(0, 12)}` : 'missing'})`);
  }

  fs.mkdirSync(path.dirname(SERVER_PROTO), { recursive: true });
  fs.writeFileSync(SERVER_PROTO, rootBuf);
  console.log(`proto sync: copied (root sha256=${rootHash.slice(0, 12)} -> ${SERVER_PROTO})`);
};

try {
  main();
} catch (err) {
  fail(err && err.message ? err.message : String(err));
}
