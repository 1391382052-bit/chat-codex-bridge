export class DemoAdapter {
  mode = 'demo';
  records = [];
  calls = 0;
  async probe() { return true; }
  async send({threadId,sourceChatId,text}) {
    this.calls++;
    const id = text.split('\n')[0].slice('BRIDGE_TASK:'.length);
    this.records.push({kind:'inbound',threadId,sourceChatId,text,messageId:`demo-in-${this.calls}`});
    this.records.push({kind:'assistant-visible',threadId,text:`BRIDGE_ACK:${id}`,messageId:`demo-ack-${this.calls}`});
  }
  async snapshot() { return this.records; }
  complete(id, threadId, text='Demo result only; no desktop task was executed.') {
    this.records.push({kind:'assistant-visible',threadId,text:`BRIDGE_RESULT:${id}\n${text}`,messageId:`demo-result-${this.calls}`});
  }
}
