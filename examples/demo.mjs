import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Bridge} from '../src/bridge.mjs';
import {DemoAdapter} from './demo-adapter.mjs';
const directory=await mkdtemp(path.join(os.tmpdir(),'bridge-demo-'));
try {
  const adapter=new DemoAdapter();
  const bridge=new Bridge({directory,sourceChatId:'demo-source',targetThreadId:'demo-target',adapter});
  await bridge.init();
  const id='demo-operation-001';
  console.log('DEMO ONLY: no live Chat or desktop is controlled.');
  console.log(await bridge.result(id));
  console.log(await bridge.send({id,message:'Demonstrate a reliable handoff.'}));
  console.log(await bridge.dispatch(id));
  console.log('ACK is not completion. Repeating the same id does not send again.');
  await bridge.send({id,message:'Demonstrate a reliable handoff.'});
  await bridge.dispatch(id);
  adapter.complete(id,'demo-target');
  console.log(await bridge.refresh(id));
  console.log({transportSendCalls:adapter.calls});
} finally {
  if(path.dirname(directory)!==os.tmpdir() || !path.basename(directory).startsWith('bridge-demo-'))throw Error('Unsafe cleanup target');
  await rm(directory,{recursive:true,force:true});
}
