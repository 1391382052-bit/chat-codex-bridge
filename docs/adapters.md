# Authorized adapter contracts

## Message adapter

```js
export async function createAdapter({sourceChatId, targetThreadId}) {
  return {
    mode: 'your-authorized-host',
    async probe() { /* check current host availability; return boolean */ },
    async send({threadId, sourceChatId, text}) { /* one host send, fixed binding */ },
    async snapshot({threadId}) { /* return normalized authenticated history */ }
  };
}
```

Do not retry `send` inside the adapter. An error or disconnect can follow remote acceptance. Reject unanticipated host approval requests and surface the exact required owner action; never auto-approve on the owner's behalf.

`HostToolsAdapter` is a thin helper for hosts that already expose the sanctioned `send_message_to_thread` and `read_thread` tools. These names reflect a host integration surface, not a guaranteed universal public API. Supply the current host's real callbacks and honor its documentation and approval model. A server path, browser tab, relay envelope or private IPC address is not itself permission.

## History normalization

Return records in **causal oldest-first order**, across turn boundaries:

```js
[
  {
    kind: 'inbound',
    threadId: 'operator-configured-target',
    sourceChatId: 'authenticated-source-from-host-evidence',
    messageId: 'opaque-host-message-id',
    text: 'exact received envelope, without rewriting'
  },
  {
    kind: 'assistant-visible',
    threadId: 'operator-configured-target',
    messageId: 'another-opaque-message-id',
    text: 'BRIDGE_ACK:example-operation'
  }
]
```

For a host returning native delegation events rather than user messages, normalize **only** the documented, authenticated native event. Validate its namespace, tool name, source/target bindings, full untruncated body and exact envelope. Do not promote a string copied into command output, an arbitrary tool result or a model-authored claim to an inbound event.

Exclude hidden reasoning and unrelated conversation content. A verified completion starts its first line with `BRIDGE_RESULT:<same-operation-id>` and has a nonempty body. Causality, target, exact envelope and its random correlation value must match. A send API success response does not prove target delivery.

If recent history omits the request, read an older page with the same authorized host client. Queries may be retried; task sends may not.

## Native original-file adapter

```js
{
  async publishOriginal({path, chatId, expected}) {
    // Use the actual supported native file/attachment facility.
    // expected = {filename, bytes, sha256}; do not synthesize a replacement file.
    return {chatId, nativeReference: 'opaque-reference-from-host'};
  },
  async inspectReceived({nativeReference, chatId}) {
    // Independently read the attachment actually received in that Chat.
    // Do not return the upload's expected values without measuring the result.
    return {chatId, filename: 'measured-name', bytes: 0, sha256: 'measured-sha256'};
  }
}
```

The reference does not assume that a local path or resource URI renders as a native attachment in every client. Fail explicitly if the host cannot supply a true native reference. Native receipt and mobile save/open/unzip are distinct acceptance gates.
