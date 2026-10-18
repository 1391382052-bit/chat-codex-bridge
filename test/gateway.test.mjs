import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
test('MCP stdio exposes schema, labels demo, and query never sends',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'bridge-mcp-'));
  try {
    const file=fileURLToPath(new URL('../bin/gateway.mjs',import.meta.url));
    const child=spawn(process.execPath,[file],{env:{...process.env,BRIDGE_DEMO:'true',BRIDGE_STATE_DIR:directory,BRIDGE_ADAPTER_MODULE:'',BRIDGE_SOURCE_CHAT_ID:'fixture-source',BRIDGE_TARGET_THREAD_ID:'fixture-target'},stdio:['pipe','pipe','pipe'],windowsHide:true});
    let output='',errors='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>errors+=x);
    const requests=[
      {method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1'}}},
      {method:'tools/list'},
      {method:'tools/call',params:{name:'send_to_codex',arguments:{action:'status'}}},
      {method:'tools/call',params:{name:'send_to_codex',arguments:{action:'result',id:'gateway-fixture-01'}}},
      {method:'tools/call',params:{name:'send_to_codex',arguments:{action:'send',id:'gateway-fixture-01',message:'Fixture task'}}},
      {method:'tools/call',params:{name:'send_to_codex',arguments:{action:'send',id:'gateway-fixture-01',message:'Fixture task',threadId:'override'}}}
    ];
    const done=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(Error('Gateway test timed out'));},10000);child.on('error',reject);child.on('close',code=>{clearTimeout(timeout);resolve(code);});});
    child.stdin.end(requests.map((r,i)=>JSON.stringify({jsonrpc:'2.0',id:i+1,...r})).join('\n')+'\n');
    assert.equal(await done,0,errors);
    const results=output.trim().split('\n').map(x=>JSON.parse(x));
    assert.equal(results.length,6);assert.equal(results[0].result.serverInfo.name,'chat-codex-bridge');
    assert.equal(results[1].result.tools.length,2);
    assert.equal(results[2].result.structuredContent.mode,'demo');
    assert.equal(results[3].result.structuredContent.status,'not-submitted');
    assert.equal(results[4].result.structuredContent.status,'acknowledged-awaiting-result');
    assert.ok(results[5].error);
  } finally {
    assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('bridge-mcp-'));
    await rm(directory,{recursive:true,force:true});
  }
});
