import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {Bridge} from '../src/bridge.mjs';
import {bootstrap,discover,tool} from '../src/discovery.mjs';
import {DemoAdapter} from '../examples/demo-adapter.mjs';

const demo=process.env.BRIDGE_DEMO==='true';
const binding={sourceChatId:process.env.BRIDGE_SOURCE_CHAT_ID||(demo?'demo-source':null),targetThreadId:process.env.BRIDGE_TARGET_THREAD_ID||(demo?'demo-target':null)};
let adapter=demo?new DemoAdapter():undefined;
if(process.env.BRIDGE_ADAPTER_MODULE) {
  if(demo)throw Error('Choose either demo or a live adapter');
  const module=await import(pathToFileURL(path.resolve(process.env.BRIDGE_ADAPTER_MODULE)).href);
  adapter=await module.createAdapter(binding);
}
const bridge=new Bridge({directory:process.env.BRIDGE_STATE_DIR||'.bridge-state',...binding,adapter});
await bridge.init();
const discoveryTool={name:'discover_tools',description:'Category map first; request only the matching group schema.',inputSchema:{type:'object',properties:{group:{type:'string',enum:['messages','files']}},additionalProperties:false}};
async function handle(method,params={}) {
  if(method==='initialize')return {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'chat-codex-bridge',version:'0.1.0'}};
  if(method==='ping')return {};
  if(method==='tools/list')return {tools:[discoveryTool,tool]};
  if(method!=='tools/call')throw Error('Unsupported method');
  let result;
  const input=params.arguments||{};
  if(params.name==='discover_tools') {
    if(Object.keys(input).some(k=>k!=='group'))throw Error('Unknown discovery argument');
    result=input.group?discover(input.group):bootstrap();
  } else if(params.name==='send_to_codex') {
    if(Object.keys(input).some(k=>!['action','id','message'].includes(k)))throw Error('Unexpected argument; target is fixed');
    if(input.action==='status')result=await bridge.status();
    else if(input.action==='result') {
      // Read-only with respect to dispatch: polling never sends a task.
      result=await bridge.result(input.id);
      if(adapter&&result.status!=='not-submitted') {
        try {result=await bridge.refresh(input.id);} catch {result={...result,refreshFailed:true};}
      }
    } else if(input.action==='send') {
      await bridge.send({id:input.id,message:input.message});
      result=await bridge.dispatch(input.id);
    } else throw Error('Invalid action');
  } else throw Error('Unknown tool');
  return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:result.status==='unknown-do-not-replay'};
}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
let queue=Promise.resolve();
const worker=setInterval(()=>{
  queue=queue.then(()=>bridge.drain()).catch(()=>{});
},1000);
worker.unref();
for await(const line of lines) {
  queue=queue.then(async()=>{
    if(Buffer.byteLength(line)>65536)return;
    let message;
    try {message=JSON.parse(line);} catch {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}})+'\n');return;}
    if(message.id===undefined)return;
    try { const result=await handle(message.method,message.params);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result})+'\n'); }
    catch {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Invalid request or unavailable host. Inspect private operator diagnostics; never replay an uncertain send.'}})+'\n');}
  });
}
clearInterval(worker);
await queue;
