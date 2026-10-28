const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),json=require('jsonc-parser');
const props=require('../src/preview-properties.cjs'),{infer}=require('../src/preview-render-bindings.cjs'),{plan}=require('../src/preview-plan.cjs');
const root=path.join(__dirname,'fixtures/appearance'),read=name=>json.parse(fs.readFileSync(path.join(root,name),'utf8'));
function fixture(){const owner={file:'/RP/entity/villager_v2.entity.json',relative:'entity/villager_v2.entity.json',side:'resource',data:read('villager_v2.entity.json')},controller={file:'/RP/render_controllers/villager_v3.render_controllers.json',relative:'render_controllers/villager_v3.render_controllers.json',side:'resource',data:read('villager_v3.render_controllers.json')};return {owner,index:{documents:new Map([[owner.file,owner],[controller.file,controller]])}};}
function appearance(values){const {owner,index}=fixture(),d=owner.data['minecraft:client_entity'].description;return plan(Object.entries(d.geometry).map(([alias,id])=>({alias,id,ownerFile:owner.file,geometryFile:'/RP/models/'+alias+'.json',textures:Object.entries(d.textures).map(([alias,id])=>({alias,id,file:'/RP/'+id+'.png'})),inference:infer(index,{ownerFile:owner.file,alias},values)})));}
test('copied Mojang appearance fixtures retain exact source bytes',()=>{for(const [file,source]of Object.entries(read('provenance.json').files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),source.sha256);});
test('real villager v3 passes recompute biome, profession, geometry and material from explicit state',()=>{
 const state={'query.is_baby':false,'query.skin_id':0,'query.variant':1,'query.mark_variant':0,'query.trade_tier':0};
 let p=appearance(state);assert.equal(p.passes.length,3);assert.deepEqual(p.passes.map(p=>p.texture.alias),['base','plains','level_stone']);assert.equal(p.passes[1].secondary.alias,'farmer');assert.equal(p.passes[1].materials[0]['*'],'Material.masked');assert.ok(p.outcomes.every(o=>o.status==='resolved'));
 p=appearance({...state,'query.variant':5,'query.mark_variant':1,'query.trade_tier':2});assert.equal(p.passes[1].texture.alias,'desert');assert.equal(p.passes[1].secondary.alias,'librarian');assert.equal(p.passes[2].texture.alias,'level_gold');
 const level=p.passes[2];assert.equal(props.evaluate(level.rules[0]['*'],{...state,'query.variant':5}).value,true);
 p=appearance({...state,'query.is_baby':true});assert.equal(p.passes[0].model.alias,'baby');assert.equal(p.passes[0].texture.alias,'baby_base');assert.equal(p.passes[1].texture.alias,'baby_plains');assert.equal(p.passes[1].materials[0]['*'],'Material.default');assert.equal(props.evaluate(p.passes[2].rules[0]['*'],{...state,'query.is_baby':true}).value,false);
 for(const key of Object.keys(state))assert.ok(p.references.has(key),key);
 assert.equal(appearance({}).passes.length,0,'No runtime defaults are invented');
});
test('bounded boolean evaluation preserves unknowns, precedence and ternary branches',()=>{
 const evaluate=s=>props.evaluate(s,{});
 for(const [s,value]of [['0 && q.is_baby',false],['1 || q.is_baby',true],['1 || 0 && 0',true],['!0 && 2 > 1',true],['!1 == 0',true],['!(1 == 0)',true],['1 ? 0 || 1 : 0',true]])assert.equal(evaluate(s).value,value,s);
 for(const s of ['1 && q.is_baby','0 || q.is_baby','q.is_baby == 0','math.random(0,1)','v.a = 1'])assert.equal(evaluate(s).status,'unknown',s);
 assert.equal(props.evaluate('('.repeat(1100)+'1'+')'.repeat(1100)).status,'unknown');
});
test('inactive controller activation remains an input dependency',()=>{const {owner,index}=fixture();owner.data['minecraft:client_entity'].description.render_controllers=[{'controller.render.villager_v3_base':"q.property('enabled')"}];const r=infer(index,{ownerFile:owner.file,alias:'default'},{enabled:false});assert.ok(r.references.includes('enabled'));assert.equal(r.passes.length,0);});
test('secondary texture duplication or missing asset cannot win by ordering',()=>{const m={alias:'default',textures:[{alias:'base',file:'/base'},{alias:'overlay',file:'/a'},{alias:'overlay',file:'/b'}],inference:{active:true,passes:[{controller:'test',order:0,selections:[['base'],['overlay']]}]}};let p=plan([m]);assert.equal(p.passes.length,0);assert.equal(p.outcomes[0].status,'unknown');assert.match(p.warnings.join(),/missing or ambiguous/);m.textures=m.textures.slice(0,1);assert.equal(plan([m]).passes.length,0);});
