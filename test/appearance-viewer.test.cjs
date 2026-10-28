// Browser contract checks with a small DOM/WebGL adapter. These verify event and
// plan authority, not native rendering or browser layout fidelity.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{convert}=require('../src/preview-geometry.cjs');
function browser(){
 const sent=[],events={},elements=new Map();let document;
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.style={};this.value='';this.hidden=false;this.offsetHeight=180;this.clientHeight=420;this.clientWidth=320;}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
  prepend(...children){for(const child of children)child.parentElement=this;this.children.unshift(...children);}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return this.attributes[name];}
  get childElementCount(){return this.children.length;}
  focus(){document.activeElement=this;}
  checkValidity(){return true;}
  getContext(){return gl;}
 }
 const gl=new Proxy({getShaderParameter:()=>true,getParameter:()=>4096,getAttribLocation:()=>0,createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({})},{get:(target,key)=>key in target?target[key]:/^[A-Z_0-9]+$/.test(key)?1:()=>{}});
 const header=new Element('header'),body=new Element('body');body.append(header);
 for(const id of ['models','textures','status','appearanceControls','layersPanel','inspectPanel','owners','ownerLabel','identity','appearanceMode','layersMode','inspectMode','reset']){const el=new Element(/Mode$|reset/.test(id)?'button':/models|textures|owners/.test(id)?'select':'section');el.id=id;elements.set(id,el);if(['models','textures'].includes(id)){const label=new Element('label');label.append(el);header.append(label);}else header.append(el);}
 document={activeElement:null,createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element('text'),{textContent:text}),getElementById:id=>elements.get(id),querySelector:selector=>selector==='header'?header:undefined,body};
 const context={document,window:{addEventListener:(name,fn)=>events[name]=fn},innerWidth:320,innerHeight:600,devicePixelRatio:1,acquireVsCodeApi:()=>({postMessage:m=>sent.push(m)}),Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},Image:class{async decode(){}},convert,Float32Array,Uint8Array,Set,Map};
 vm.runInNewContext(fs.readFileSync(require.resolve('../media/preview-renderer.js'),'utf8'),context);
 return {elements,document,sent,body,send:data=>events.message({data}),all:()=>{const visit=element=>[element,...element.children.flatMap(visit)];return visit(body);}};
}
const geometry={description:{identifier:'geometry.test'},bones:[{name:'root',cubes:[{origin:[0,0,0],size:[1,1,1],uv:[0,0]}]}]};
function appearancePlan(){const layers=['base','clothing'].map((controller,order)=>({id:controller,controller,order,status:'resolved',geometryId:'geometry.test',textures:[{alias:controller,id:'textures/'+controller}],visibility:{root:true}}));return {entity:{identifier:'test:entity'},controllers:layers.map(layer=>({controller:layer.controller,status:'resolved',sources:[]})),layers,renderPasses:layers.map(layer=>({layerId:layer.id,controller:layer.controller,geometry,textureAlias:layer.controller,visibility:{root:true}}))};}
test('three viewer modes render the shared plan and layer debugging stays local',async()=>{
 const ui=browser(),p=appearancePlan();await ui.send({type:'choices',viewMode:'appearance',manual:false,selection:{model:0,texture:0},models:[{owner:'test:entity',ownerKey:'owner',label:'geometry.test',textures:['base']}]});
 assert.equal(ui.elements.get('inspectPanel').hidden,true);assert.equal(ui.elements.get('models').parentElement.hidden,true);
 await ui.send({type:'model',appearancePlan:p,passes:[],properties:{},warning:''});assert.equal(ui.sent.at(-1).passes.length,2,'Renderer consumes plan passes even when legacy payload disagrees');
 ui.elements.get('layersMode').onclick();assert.equal(ui.elements.get('layersPanel').hidden,false);const toggles=()=>ui.all().filter(e=>e.tagName==='INPUT'&&e.getAttribute('aria-label')?.startsWith('Show '));
 let toggle=toggles()[1];toggle.checked=false;toggle.onchange();assert.equal(ui.sent.at(-1).passes.length,1);
 ui.all().find(e=>e.textContent==='Restore all passes').onclick();assert.equal(ui.sent.at(-1).passes.length,2);assert.ok(toggles().every(e=>e.checked));
 ui.all().find(e=>e.textContent==='Isolate clothing').onclick();assert.equal(ui.sent.at(-1).passes[0].controller,'clothing');assert.equal(ui.sent.at(-1).passes.length,1);
 ui.elements.get('inspectMode').onclick();assert.equal(ui.elements.get('inspectPanel').hidden,false);assert.equal(ui.sent.at(-1).type,'viewMode');assert.equal(ui.sent.at(-1).mode,'inspect');
 ui.elements.get('appearanceMode').onclick();await ui.send({type:'model',appearancePlan:p,properties:{},warning:''});assert.equal(ui.sent.at(-1).passes.length,2);assert.equal(ui.sent.at(-1).viewMode,'appearance');
 assert.ok(ui.sent.filter(m=>m.type!=='rendered'&&m.type!=='ready').every(m=>m.type==='viewMode'),'Layer toggles never request source writes');assert.equal(ui.sent.at(-1).canvasHeight,420);
});
test('query edits use the host input contract and preserve pending field focus during refresh',async()=>{
 const ui=browser(),field={name:'query.variant',type:'int',range:[0,65535],group:'Preview queries'};await ui.send({type:'propertyControls',fields:[field],values:{},variants:[]});let input=ui.all().find(e=>e.getAttribute('aria-label')==='query.variant');input.focus();input.value='5';input.onchange();assert.equal(ui.sent.at(-1).type,'properties');assert.equal(ui.sent.at(-1).values['query.variant'],5);
 await ui.send({type:'propertyControls',fields:[field],values:{'query.variant':5},variants:[]});assert.equal(ui.document.activeElement.getAttribute('aria-label'),'query.variant');assert.equal(ui.document.activeElement.value,'5');
 ui.document.activeElement.value='';ui.document.activeElement.onchange();assert.equal(ui.sent.at(-1).values['query.variant'],null);
});

test('packaged browser asset matches the shared geometry and tested viewer sources',()=>{const normalized=file=>fs.readFileSync(require.resolve(file),'utf8').replace(/\r\n/g,'\n');assert.equal(normalized('../media/model-preview.js'),normalized('../src/preview-geometry.cjs')+'\n'+normalized('../media/preview-renderer.js'));});
