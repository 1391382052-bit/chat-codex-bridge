// Inject an already authenticated, authorized host tool client. No private IPC,
// credential extraction, automatic consent, desktop injector or permission bypass.
export class HostToolsAdapter {
  mode = 'host-tools';
  constructor({callTool,listTools,normalizeSnapshot,targetThreadId,sourceChatId}) {
    for(const fn of [callTool,listTools,normalizeSnapshot])if(typeof fn!=='function')throw Error('Host callbacks are required');
    Object.assign(this,{callTool,listTools,normalizeSnapshot,targetThreadId,sourceChatId});
  }
  async probe() {
    const tools=await this.listTools();
    if(!['send_message_to_thread','read_thread'].every(name=>tools.some(t=>t.name===name)))return false;
    const read=await this.callTool('read_thread',{threadId:this.targetThreadId,turnLimit:1,includeOutputs:false,maxOutputCharsPerItem:1000});
    if(read?.isError)return false;
    return Array.isArray(this.normalizeSnapshot(read));
  }
  async send({threadId,sourceChatId,text}) {
    if(threadId!==this.targetThreadId||sourceChatId!==this.sourceChatId)throw Error('Target binding mismatch');
    const r=await this.callTool('send_message_to_thread',{threadId:this.targetThreadId,prompt:text});
    if(r?.isError)throw Error('Host send failed; delivery may be uncertain');
  }
  async snapshot({threadId}) {
    if(threadId!==this.targetThreadId)throw Error('Target binding mismatch');
    const r=await this.callTool('read_thread',{threadId,turnLimit:10,includeOutputs:true,maxOutputCharsPerItem:8000});
    if(r?.isError)throw Error('Host read failed');
    return this.normalizeSnapshot(r);
  }
}
