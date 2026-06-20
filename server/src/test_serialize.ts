import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

const PROTO_PATH = path.join(__dirname, '../proto/vps.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const ServerMessage = protoDescriptor.vps.ServerMessage;

// Test Case 1: flattened (no nested body)
try {
  const msg1 = {
    request_id: 'req-1',
    shell_open: {
      session_id: 'sess-1',
      vps_id: 'vps-1',
      shell: 'bash'
    }
  };
  const serialized1 = ServerMessage.serialize(msg1);
  const deserialized1 = ServerMessage.deserialize(serialized1);
  console.log('TEST 1 (flattened) DESERIALIZED:', JSON.stringify(deserialized1, null, 2));
} catch (e: any) {
  console.error('TEST 1 FAILED:', e.message);
}

// Test Case 2: nested under body
try {
  const msg2 = {
    request_id: 'req-2',
    body: {
      shell_open: {
        session_id: 'sess-2',
        vps_id: 'vps-2',
        shell: 'bash'
      }
    }
  };
  const serialized2 = ServerMessage.serialize(msg2);
  const deserialized2 = ServerMessage.deserialize(serialized2);
  console.log('TEST 2 (nested body) DESERIALIZED:', JSON.stringify(deserialized2, null, 2));
} catch (e: any) {
  console.error('TEST 2 FAILED:', e.message);
}

// Test Case 3: nested with oneof key
try {
  const msg3 = {
    request_id: 'req-3',
    body: 'shell_open',
    shell_open: {
      session_id: 'sess-3',
      vps_id: 'vps-3',
      shell: 'bash'
    }
  };
  const serialized3 = ServerMessage.serialize(msg3);
  const deserialized3 = ServerMessage.deserialize(serialized3);
  console.log('TEST 3 (oneof key + flattened) DESERIALIZED:', JSON.stringify(deserialized3, null, 2));
} catch (e: any) {
  console.error('TEST 3 FAILED:', e.message);
}
