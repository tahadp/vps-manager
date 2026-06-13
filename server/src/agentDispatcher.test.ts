import { describe, it, expect } from 'vitest';
import { requestAgent, isAgentOnline } from './agentDispatcher';

describe('agentDispatcher.requestAgent', () => {
  it('rejects when no stream is registered for the vpsId', async () => {
    const vpsId = '00000000-0000-0000-0000-000000000000';
    expect(isAgentOnline(vpsId)).toBe(false);

    await expect(
      requestAgent(vpsId, (requestId) => ({ request_id: requestId })),
    ).rejects.toThrow(`Agent for vps=${vpsId} is not connected`);
  });
});
