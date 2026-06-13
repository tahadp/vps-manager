const fs = require('fs');
const path = require('path');

const rootProto = path.resolve(__dirname, '..', '..', 'proto', 'vps.proto');
const serverProto = path.resolve(__dirname, '..', 'proto', 'vps.proto');

if (!fs.existsSync(rootProto)) {
  console.error('[sync-proto] Root proto not found at', rootProto, '- skipping (Coolify build with server/ context)');
  process.exit(0);
}

const rootContent = fs.readFileSync(rootProto, 'utf8');
let serverContent = '';
try {
  serverContent = fs.readFileSync(serverProto, 'utf8');
} catch (_) {}

if (rootContent === serverContent) {
  console.log('[sync-proto] server/proto/vps.proto is in sync');
  process.exit(0);
}

fs.mkdirSync(path.dirname(serverProto), { recursive: true });
fs.writeFileSync(serverProto, rootContent);
console.log('[sync-proto] server/proto/vps.proto updated from root proto/');
