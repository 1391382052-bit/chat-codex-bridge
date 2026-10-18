import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rules=[
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['provider-token',/(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|sk-[a-zA-Z0-9_-]{24,})/],
  ['real-conversation-id',/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['operator-windows-home',/[A-Z]:[\\/]Users[\\/][^\s"'<>]+/i],
  ['operator-unix-home',/\/(?:Users|home)\/[a-zA-Z0-9_.-]+\//],
  ['private-ipc',/\\\\\.\\pipe\\[^\s"']+/],
  ['email-address',/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i]
];
let deny=[];
const at=process.argv.indexOf('--deny-file');
if(at>=0) {
  const file=path.resolve(process.argv[at+1]||'');
  const relative=path.relative(root,file);
  if(relative && !relative.startsWith('..') && !path.isAbsolute(relative))throw Error('Keep private deny lists outside the public checkout');
  deny=JSON.parse(await fs.readFile(file,'utf8'));
  if(!Array.isArray(deny)||deny.some(x=>typeof x!=='string'||!x))throw Error('Expected a nonempty-string array');
}
const hits=[];let files=0;
async function walk(folder) {
  for(const entry of await fs.readdir(folder,{withFileTypes:true})) {
    if(['.git','node_modules','.bridge-state','private'].includes(entry.name))continue;
    const file=path.join(folder,entry.name);
    if(entry.isSymbolicLink())throw Error('Symlinks require separate publication review');
    if(entry.isDirectory()){await walk(file);continue;}
    if(entry.name==='.env'||(entry.name.startsWith('.env.')&&entry.name!=='.env.example')){hits.push({file:path.relative(root,file),rule:'private-env-file'});continue;}
    const text=await fs.readFile(file,'utf8');files++;
    for(const [rule,pattern]of rules)if(pattern.test(text))hits.push({file:path.relative(root,file),rule});
    if(deny.some(value=>text.toLowerCase().includes(value.toLowerCase())))hits.push({file:path.relative(root,file),rule:'private-deny-list'});
  }
}
await walk(root);
console.log(JSON.stringify({files,ruleCount:rules.length,privateDenyListUsed:deny.length>0,hits},null,2));
if(hits.length)process.exitCode=1;
