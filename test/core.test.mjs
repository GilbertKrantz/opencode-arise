import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Model, Provider } from '@opencode/plugin';
import { schema } from '../dist/config.js';
import { selectModel, matches } from '../dist/router.js';
import plugin from '../dist/index.js';
import { editPlugins } from '../dist/cli.js';

const model=(id,price=1,extra={})=>({...Model.Info.default(Provider.ID.make('test'),Model.ID.make(id)),cost:[{input:price,output:price,cache:{read:0,write:0}}],...extra});
const config=(extra={})=>schema.parse(extra);
const tick=()=>new Promise(r=>setImmediate(r));
function harness(models=[model('cheap',1),model('strong',10)]) {
  const storage=new Map(), sessions=new Map(), completions=new Map(), hooks={}, tools=new Map(),agents=new Map();
  sessions.set('parent',{id:'parent',model:{providerID:'test',id:'strong'},agent:'monarch',location:{directory:process.cwd()},permissions:[{action:'*',resource:'*',effect:'ask'}]});
  let n=0,notifications=[];
  const ctx={options:{show_banner:false},location:{directory:process.cwd()},app:{version:'2.0.24'},
    storage:{set:async(k,v)=>storage.set(k,structuredClone(v)),get:async(k)=>storage.get(k),remove:async k=>storage.delete(k),scan:async()=>({entries:[...storage].map(([key,value])=>({key,value}))})},
    agent:{transform:async cb=>cb({update:(id,fn)=>{let a={id,name:id,request:{settings:{},headers:{},body:{}},permissions:[]};fn(a);agents.set(id,a)},default:id=>agents.default=id})},
    tool:{transform:async cb=>cb({add:t=>tools.set(t.name,t)}),hook:async(name,fn)=>{hooks[`tool.${name}`]=fn}},
    model:{list:async()=>({data:models,location:{directory:process.cwd()}})},
    session:{
      get:async({sessionID})=>sessions.get(sessionID),
      create:async input=>{const s={...input,id:`child-${++n}`};sessions.set(s.id,s);return s},
      prompt:async({sessionID,text})=>{sessions.get(sessionID).prompt=text},
      wait:async({sessionID},{signal}={})=>{await new Promise((resolve,reject)=>{completions.set(sessionID,resolve);signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});if(signal?.aborted)reject(signal.reason)})},
      context:async({sessionID})=>[{type:'assistant',content:[{type:'text',text:`result ${sessionID}`}]}],
      interrupt:async({sessionID})=>{const s=sessions.get(sessionID);if(s)s.outcome='interrupted';completions.get(sessionID)?.()},
      synthetic:async input=>notifications.push(input),
      switchModel:async({sessionID,model})=>sessions.get(sessionID).model=model,
      hook:async(name,fn)=>{hooks[name]=fn},
    },
    event:{subscribe:async function*({signal}){if(!signal.aborted)await new Promise(r=>signal.addEventListener('abort',r,{once:true}))}},
  };
  return {ctx,storage,sessions,completions,hooks,tools,agents,notifications,models,finish(id){sessions.get(id).outcome='succeeded';completions.get(id)?.()}};
}

test('routing filters disabled, deprecated, incapable, unknown-price and policy exclusions',()=>{
  const models=[model('disabled',0,{enabled:false}),model('deprecated',0,{status:'deprecated'}),model('no-tools',0,{capabilities:{tools:false,input:['text']}}),model('tiny',0,{limit:{context:100,output:10}}),model('unknown',0,{cost:[]}),model('valid',2)];
  assert.equal(selectModel(models,config({routing:{max_output_price:3}}),'beru').model.id,'valid');
  assert.throws(()=>selectModel(models,config({routing:{allow:['other/*']}}),'beru'),/No enabled/);
  assert.ok(matches('test/a.b*','test/a.b-large'));assert.ok(!matches('test/a.b*','test/axb'));
});
test('routing uses preferences, explicit variants, quality scores and live changes',()=>{
  const small=model('small',1,{capabilities:{tools:true,input:['text']}}),strong=model('strong',10,{variants:[{id:'high'}]});
  assert.equal(selectModel([strong,small],config(),'beru').model.id,'small');
  assert.equal(selectModel([strong,small],config({agents:{beru:{preferred:['test/strong']}}}),'beru').model.id,'strong');
  assert.equal(selectModel([strong,small],config({routing:{strategy:'quality',quality:{'test/small':90}}}),'igris').model.id,'small');
  assert.equal(selectModel([strong,small],config(),'igris',undefined,'test/strong#high').model.variant,'high');
  assert.throws(()=>selectModel([small],config(),'igris',undefined,'test/missing'),/unavailable/);
  assert.equal(selectModel([small],config({agents:{igris:{model:'test/missing'}}}),'igris').model.id,'small');
  assert.throws(()=>selectModel([small],config({agents:{igris:{model:'test/missing'}},routing:{fallback_on_unavailable:false}}),'igris'),/unavailable/);
  assert.equal(selectModel([small,model('cheaper',0)],config(),'beru').model.id,'cheaper');
  assert.throws(()=>selectModel([small],config(),'tusk',undefined,undefined,['image']),/No enabled/);
});
test('strict config rejects typos and permits partial per-agent configuration',()=>{
  assert.equal(config({agents:{beru:{strategy:'cheap'}}}).agents.beru.strategy,'cheap');
  assert.throws(()=>config({routing:{strategy:'magic'}}));assert.throws(()=>config({disabled_shadows:['typo']}));assert.throws(()=>config({typo:true}));
});
test('plugin registers seven agents, native delegation and model inspector and compaction context; removes recursive delegation',async()=>{
  const h=harness();const cleanup=await plugin.setup(h.ctx);
  assert.equal(h.agents.size,7);assert.equal(h.agents.default,'monarch');assert.equal(h.tools.size,1);
  const context={agent:'igris',sessionID:'parent',tools:{arise_summon:{},task:{},subagent:{},read:{}},system:[]};await h.hooks.context(context);assert.deepEqual(Object.keys(context.tools),['read']);
  const compaction={agent:'monarch',sessionID:'parent',system:[]};await h.hooks.compaction(compaction);assert.match(compaction.system[0].text,/TODO/);
  const result=await h.tools.get('arise_models').execute({shadow:'beru',required_inputs:[]},{sessionID:'parent'});assert.equal(JSON.parse(result.content).selection,'test/cheap');
  h.models.push(model('new-cheap',0));const fresh=await h.tools.get('arise_models').execute({shadow:'beru',required_inputs:[]},{sessionID:'parent'});assert.equal(JSON.parse(fresh.content).selection,'test/new-cheap');
  await cleanup?.();
});
test('primary routing is opt-in and updates the session through the supported API',async()=>{
  const h=harness();h.ctx.options={show_banner:false,routing:{route_primary:true},agents:{monarch:{preferred:['test/cheap']}}};
  const cleanup=await plugin.setup(h.ctx);await h.hooks.prompt({sessionID:'parent',prompt:{text:'hello'}});assert.equal(h.sessions.get('parent').model.id,'cheap');await cleanup?.();
});
test('installer preserves JSONC comments and other plugins, is idempotent and rejects corrupt config',async()=>{
  const text='{// keep this\n"plugins":["another"],"model":"test/a",}';
  const installed=editPlugins(text,true);assert.match(installed,/keep this/);assert.match(installed,/another/);assert.equal(editPlugins(installed,true),installed);
  assert.match(editPlugins(installed,false),/another/);assert.throws(()=>editPlugins('{broken',true),/Invalid/);
  const dir=await mkdtemp(join(tmpdir(),'arise-install-'));const path=join(dir,'opencode.jsonc');await writeFile(path,text);
  const install=spawnSync(process.execPath,['dist/cli.js','install','--project',dir],{encoding:'utf8'});assert.equal(install.status,0,install.stderr);
  const doctor=spawnSync(process.execPath,['dist/cli.js','doctor','--project',dir],{encoding:'utf8'});assert.equal(doctor.status,0,doctor.stderr);
  const uninstall=spawnSync(process.execPath,['dist/cli.js','uninstall','--project',dir],{encoding:'utf8'});assert.equal(uninstall.status,0,uninstall.stderr);
  assert.match(await readFile(path,'utf8'),/another/);
});

test('OpenCode host resolves the local-directory entrypoint',async()=>{
  const {Host}=await import('@opencode/plugin/host');
  const resolved=Host.resolve({directory:process.cwd()});
  assert.ok(resolved.server?.endsWith('/index.js'));
  const loaded=await Host.load(resolved.server);
  assert.equal(loaded.default.id,'opencode-arise-v2');
});

test('installer respects v2 migration of v1-schema configs and rejects mixed plugin fields',()=>{
  const text=JSON.stringify({provider:{custom:{}},plugin:['other-plugin']});
  const result=JSON.parse(editPlugins(text,true));
  assert.equal(result.plugin.length,2);assert.ok(!('plugins' in result));assert.deepEqual(result.provider,{custom:{}});
  assert.throws(()=>editPlugins('{"provider":{},"plugins":[]}',true),/mixes v1 and v2/);
});

test('native subagent hook routes foreground/background live without creating jobs or sessions',async()=>{
  const h=harness();await plugin.setup(h.ctx);
  for(const background of [false,true]) {
    const e={tool:'subagent',sessionID:'parent',input:{agent:'beru',description:'Explore code',prompt:'find files',background}};
    await h.hooks['tool.execute.before'](e);
    assert.equal(e.input.model,'test/cheap');assert.equal(e.input.background,background);assert.equal(e.input.prompt,'find files');
  }
  h.models.push(model('new',0));
  const e={tool:'subagent',sessionID:'parent',input:{agent:'beru',prompt:'fresh'}};
  await h.hooks['tool.execute.before'](e);assert.equal(e.input.model,'test/new');
  assert.equal(h.sessions.size,1);assert.equal(h.storage.size,0);
  assert.ok(h.agents.get('beru').permissions.some(p=>p.action==='subagent'&&p.effect==='deny'));
});
test('native resume preserves model; overrides are validated; unrelated agents remain untouched',async()=>{
  const h=harness();await plugin.setup(h.ctx);
  for(const input of [{agent:'beru',sessionID:'existing'},{agent:'general'},{agent:'monarch'}]) {
    const e={tool:'subagent',sessionID:'parent',input};await h.hooks['tool.execute.before'](e);assert.strictEqual(e.input,input);
  }
  const e={tool:'subagent',sessionID:'parent',input:{agent:'igris',model:'test/cheap',sessionID:'existing'}};
  await h.hooks['tool.execute.before'](e);assert.equal(e.input.model,'test/cheap');
  await assert.rejects(()=>h.hooks['tool.execute.before']({...e,input:{agent:'igris',model:'test/missing'}}),/unavailable/);
});
