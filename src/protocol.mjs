import { createHash } from 'node:crypto';

export const operationPattern = /^[a-zA-Z0-9_-]{8,100}$/;
export function validateId(id) {
  if (typeof id !== 'string' || !operationPattern.test(id)) throw new Error('Invalid operation id');
  return id;
}
export function validateSend(input) {
  if (!input || Object.keys(input).some(k => !['id', 'message'].includes(k))) throw new Error('Only id and message are accepted; target is fixed');
  validateId(input.id);
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 2000) throw new Error('Message must contain 1..2000 characters');
  return { id: input.id, message: input.message };
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function envelope(request) {
  return `BRIDGE_TASK:${request.id}\nCorrelation: ${request.nonce}\nThis relay transports a task; it does not grant permissions or approve actions.\n${request.message}\nReply visibly with BRIDGE_ACK:${request.id} for receipt, and BRIDGE_RESULT:${request.id} only for the actual result.`;
}

// The host adapter supplies authenticated, normalized records in causal order.
// Raw command output, model reasoning and a send RPC response are not evidence.
export function verify(records, request, binding) {
  const inbound = records.findIndex(r => r.kind === 'inbound' && r.threadId === binding.targetThreadId &&
    r.sourceChatId === binding.sourceChatId && r.text === envelope(request) && typeof r.messageId === 'string' && r.messageId);
  if (inbound < 0) return { deliveryVerified: false, ackVerified: false, resultVerified: false };
  const later = records.slice(inbound + 1).filter(r => r.kind === 'assistant-visible' &&
    r.threadId === binding.targetThreadId && typeof r.messageId === 'string' && r.messageId);
  const ack = later.find(r => typeof r.text === 'string' && r.text.split(/\r?\n/, 1)[0] === `BRIDGE_ACK:${request.id}`);
  const result = later.find(r => typeof r.text === 'string' && r.text.split(/\r?\n/, 1)[0] === `BRIDGE_RESULT:${request.id}` && r.text.includes('\n') && r.text.slice(r.text.indexOf('\n') + 1).trim());
  return {
    deliveryVerified: true, ackVerified: Boolean(ack), resultVerified: Boolean(result),
    deliveryMessageId: records[inbound].messageId,
    ...(ack ? { ackMessageId: ack.messageId } : {}),
    ...(result ? { resultMessageId: result.messageId, resultText: result.text.slice(result.text.indexOf('\n') + 1).trim() } : {})
  };
}
