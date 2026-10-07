import test from 'node:test';
import assert from 'node:assert/strict';
import { isQueuedClientCreation } from './offlineQueue.js';

test('matches only the queued creation request for the selected local client', () => {
  const clientId = 'client-pending-one';
  const matching = {
    request: {
      path: '/clients',
      method: 'PUT',
      metadata: { clientId },
    },
  };

  assert.equal(isQueuedClientCreation(matching, clientId), true);
  assert.equal(isQueuedClientCreation(matching, 'client-pending-two'), false);
  assert.equal(isQueuedClientCreation({ ...matching, request: { ...matching.request, method: 'DELETE' } }, clientId), false);
  assert.equal(isQueuedClientCreation({ ...matching, request: { ...matching.request, path: '/projects/client-pending-one' } }, clientId), false);
  assert.equal(isQueuedClientCreation(null, clientId), false);
});
