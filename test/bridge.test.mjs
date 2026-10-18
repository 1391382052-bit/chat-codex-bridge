import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Bridge} from '../src/bridge.mjs';
import {verify,envelope,validateSend} from '../src/protocol.mjs';
import {DemoAdapter} from '../examples/demo-adapter.mjs';
import {ArtifactBridge} from '../src/artifacts.mjs';
import {bootstrap,discover} from '../src/discovery.mjs';
import {HostToolsAdapter} from '../src/host-adapter.mjs';

const binding={sourceChatId:'fixture-source',targetThreadId:'fixture-target'};
const task={id:'operation-fixture-01',message:'A harmless fixture task.'};
async function fixture(fn) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'bridge-test-'));
  try {
    const adapter=new DemoAdapter();
    const bridge=new Bridge({directory,...binding,adapter});await bridge.init();
    await fn({bridge,adapter,directory});
  } finally {
    assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('bridge-test-'));
    await rm(directory,{recursive:true,force:true});
  }
}
test('polling an unused id is read-only and allows first submission',()=>fixture(async({bridge,directory})=>{
  assert.equal((await bridge.result(task.id)).canSubmit,true);
  assert.equal((await bridge.result(task.id)).status,'not-submitted');
  await assert.rejects(stat(path.join(directory,task.id)),{code:'ENOENT'});
  assert.equal((await bridge.send(task)).status,'pending');
}));
test('concurrent registration and dispatch send exactly once',()=>fixture(async({bridge,adapter})=>{
  await Promise.all(Array.from({length:8},()=>bridge.send(task)));
  await Promise.all(Array.from({length:8},()=>bridge.dispatch(task.id)));
  assert.equal(adapter.calls,1);
  const result=await bridge.result(task.id);
  assert.equal(result.deliveryVerified,true);assert.equal(result.ackVerified,true);assert.equal(result.resultVerified,false);
  assert.equal(result.status,'acknowledged-awaiting-result');
}));
test('same id with different content is rejected; target cannot be overridden',()=>fixture(async({bridge})=>{
  await bridge.send(task);
  await assert.rejects(bridge.send({...task,message:'Changed content'}),/conflicts/);
  assert.throws(()=>validateSend({...task,targetThreadId:'elsewhere'}));
  assert.throws(()=>validateSend({...task,id:'../escape'}));
}));
test('a transport timeout remains unknown across restart and is never replayed',()=>fixture(async({bridge,adapter,directory})=>{
  adapter.send=async()=>{adapter.calls++;throw Error('Timeout after possible acceptance');};
  await bridge.send(task);assert.equal((await bridge.dispatch(task.id)).status,'unknown-do-not-replay');
  const restarted=new Bridge({directory,...binding,adapter});
  await restarted.send(task);await restarted.dispatch(task.id);
  await restarted.drain();
  assert.equal(adapter.calls,1);assert.equal((await restarted.result(task.id)).canSubmit,false);
}));
test('a queued task waits for host recovery, then the worker sends only its first attempt',()=>fixture(async({bridge,adapter})=>{
  let online=false;adapter.probe=async()=>online;
  await bridge.send(task);await bridge.dispatch(task.id);
  assert.equal(adapter.calls,0);assert.equal((await bridge.result(task.id)).status,'pending');
  online=true;await bridge.drain();await bridge.drain();
  assert.equal(adapter.calls,1);assert.equal((await bridge.result(task.id)).ackVerified,true);
}));
test('a crash while reserving an operation cannot make it reusable',()=>fixture(async({bridge,directory})=>{
  await mkdir(path.join(directory,task.id));
  assert.equal((await bridge.result(task.id)).status,'unknown-do-not-replay');
  assert.equal((await bridge.send(task)).canSubmit,false);
}));
test('partial/empty claim is a permanent no-replay fence',()=>fixture(async({bridge,adapter,directory})=>{
  await bridge.send(task);await writeFile(path.join(directory,task.id,'claim.json'),'');
  await bridge.dispatch(task.id);assert.equal(adapter.calls,0);
}));
test('ACK and causal visible result are independent; old output and reasoning are ignored',()=>fixture(async({bridge,adapter,directory})=>{
  await bridge.send(task);
  const request=JSON.parse(await readFile(path.join(directory,task.id,'request.json'),'utf8'));
  const input={kind:'inbound',threadId:binding.targetThreadId,sourceChatId:binding.sourceChatId,text:envelope(request),messageId:'inbound-one'};
  const result={kind:'assistant-visible',threadId:binding.targetThreadId,text:`BRIDGE_RESULT:${task.id}\nDone`,messageId:'result-one'};
  assert.equal(verify([result,input],request,binding).resultVerified,false);
  assert.equal(verify([{...input,sourceChatId:'different'},result],request,binding).deliveryVerified,false);
  assert.equal(verify([input,{...result,kind:'reasoning'}],request,binding).resultVerified,false);
  assert.equal(verify([input,{...result,text:`BRIDGE_RESULT:wrong-id\nDone`}],request,binding).resultVerified,false);
  const proof=verify([input,result],request,binding);
  assert.equal(proof.ackVerified,false);assert.equal(proof.resultVerified,true);
  await bridge.dispatch(task.id);adapter.complete(task.id,binding.targetThreadId,'Verified fixture result');
  assert.equal((await bridge.refresh(task.id)).status,'completed');
  adapter.records=[];
  assert.equal((await bridge.refresh(task.id)).status,'completed');
}));
test('stored requests cannot be reused under another binding',()=>fixture(async({bridge,directory,adapter})=>{
  await bridge.send(task);
  const wrong=new Bridge({directory,sourceChatId:'other-source',targetThreadId:'other-target',adapter});
  await assert.rejects(wrong.result(task.id),/binding/);
  await assert.rejects(wrong.dispatch(task.id),/binding/);
}));
test('an adapter must actually probe online; construction is not readiness',()=>fixture(async({directory})=>{
  const b=new Bridge({directory,...binding,adapter:{probe:async()=>{throw Error('offline');}}});
  assert.equal((await b.status()).online,false);
}));
test('file paths alone do not prove attachments; matching receipt and receive-side verification are required',()=>fixture(async({directory})=>{
  await writeFile(path.join(directory,'fixture.txt'),'Original fixture bytes');
  const absent=new ArtifactBridge({root:directory,destinationChatId:'fixture-chat'});
  await assert.rejects(absent.deliver('fixture.txt'),/not a Chat attachment/);
  let expected;
  const adapter={publishOriginal:async input=>{expected=input.expected;return {nativeReference:'fixture-native-reference',chatId:input.chatId};},inspectReceived:async()=>({...expected,chatId:'fixture-chat'})};
  const files=new ArtifactBridge({root:directory,destinationChatId:'fixture-chat',adapter});
  assert.equal((await files.deliver('fixture.txt')).attachmentVerified,true);
  adapter.inspectReceived=async()=>({...expected,sha256:'wrong',chatId:'fixture-chat'});
  await assert.rejects(files.deliver('fixture.txt'),/does not match/);
  await assert.rejects(files.deliver('../package.json'));
}));
test('bootstrap is a category map; schemas are loaded only for the selected group',()=>{
  assert.equal(JSON.stringify(bootstrap()).includes('inputSchema'),false);
  assert.equal(discover('messages').tools[0].name,'send_to_codex');
  assert.equal(discover('files').online,false);
  assert.equal(discover('unknown').tools.length,0);
});
test('host tool adapter binds target and does not interpret send RPC as ACK',async()=>{
  const calls=[];
  const adapter=new HostToolsAdapter({...binding,listTools:async()=>[{name:'send_message_to_thread'},{name:'read_thread'}],callTool:async(name,args)=>{calls.push({name,args});return {};},normalizeSnapshot:()=>[]});
  assert.equal(await adapter.probe(),true);
  calls.length=0;
  await assert.rejects(adapter.send({threadId:'different',sourceChatId:binding.sourceChatId,text:'task'}),/binding/);
  await adapter.send({...binding,threadId:binding.targetThreadId,text:'task'});
  assert.deepEqual(Object.keys(calls[0].args).sort(),['prompt','threadId']);
  assert.deepEqual(await adapter.snapshot({threadId:binding.targetThreadId}),[]);
});
