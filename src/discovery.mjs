export const tool = {
  name: 'send_to_codex',
  description: 'Fixed-target dispatch. Query result first; send once only when canSubmit=true. Never replay pending or unknown. ACK is receipt, not completion.',
  inputSchema: { type:'object', additionalProperties:false, required:['action'], properties:{
    action:{type:'string',enum:['status','send','result']},
    id:{type:'string',pattern:'^[a-zA-Z0-9_-]{8,100}$'}, message:{type:'string',minLength:1,maxLength:2000}
  }}
};
export function bootstrap() {
  return { delivery:'category-map-then-group-then-current-schema', groups:[
    {id:'messages',purpose:'Fixed-thread tasks and delivery/ACK/result'},
    {id:'files',purpose:'Original-file delivery via a native host adapter'}
  ], next:'Call discover_tools with the matching group; construction does not prove online status.' };
}
export function discover(group) {
  if(group === 'messages') return {group, tools:[tool]};
  if(group === 'files') return {group, tools:[], interface:'ArtifactBridge', online:false, reason:'A native attachment adapter must be supplied and independently verified.'};
  return {group, tools:[], matched:false};
}
