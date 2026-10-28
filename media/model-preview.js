// Renderer space is right-handed: reflect Bedrock X, including pivots.
// Bedrock Euler angles become [-X, -Y, Z]; apply X, then Y, then Z.
// Keep this conversion at the boundary, rather than mixing UV/rotation fixes.
const scenePoint=([x=0,y=0,z=0]=[])=>[-x,y,z];
const sceneRotation=([x=0,y=0,z=0]=[])=>[-x,-y,z];
function rotate(point,pivot=[0,0,0],rotation=[0,0,0]) {
  let [x,y,z]=point.map((v,i)=>v-pivot[i]);
  for(let axis=0;axis<3;axis++) {const a=(rotation[axis]||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);if(axis===0)[y,z]=[y*c-z*s,y*s+z*c];if(axis===1)[x,z]=[x*c+z*s,-x*s+z*c];if(axis===2)[x,y]=[x*c-y*s,x*s+y*c];}
  return [x+pivot[0],y+pivot[1],z+pivot[2]];
}
function convert(model,visibility={}) {
  if(!model)throw Error('Geometry definition is missing.');
  const width=model.description?.texture_width||64,height=model.description?.texture_height||64;
  if(!(width>0&&height>0))throw Error('Invalid geometry texture dimensions.');
  const faces=[],warnings=new Set(),bones=new Map((model.bones||[]).map(b=>[b.name,b]));
  let cubes=0;
  for(const bone of bones.values()) {
    if(visibility[bone.name]===false)continue;
    if(bone.poly_mesh||bone.texture_meshes)warnings.add('Polygon and texture meshes are unsupported.');
    const chain=[];let b=bone;while(b){if(chain.includes(b))throw Error('Cyclic bone hierarchy.');chain.push(b);if(b.parent&&!bones.has(b.parent))warnings.add(`Missing parent bone: ${b.parent}`);b=bones.get(b.parent);}
    for(const cube of bone.cubes||[]) {
      if(++cubes>20000)throw Error('Preview exceeds 20,000 cubes.');
      const o=cube.origin||[0,0,0],s=cube.size||[0,0,0],inflate=cube.inflate??bone.inflate??0;
      if(![...o,...s,inflate].every(Number.isFinite))throw Error('Cube coordinates must be finite numbers.');
      const x=-o[0]-s[0]-inflate,X=-o[0]+inflate,y=o[1]-inflate,Y=o[1]+s[1]+inflate,z=o[2]-inflate,Z=o[2]+s[2]+inflate;
      const points={north:[[X,Y,z],[x,Y,z],[x,y,z],[X,y,z]],south:[[x,Y,Z],[X,Y,Z],[X,y,Z],[x,y,Z]],west:[[x,Y,z],[x,Y,Z],[x,y,Z],[x,y,z]],east:[[X,Y,Z],[X,Y,z],[X,y,z],[X,y,Z]],up:[[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z]],down:[[x,y,Z],[X,y,Z],[X,y,z],[x,y,z]]};
      // Box UV dimensions occupy whole texels; geometry retains fractional size.
      const [w,h,d]=s.map(n=>Math.floor(n+1e-7)),[u,v]=Array.isArray(cube.uv)?cube.uv:[0,0];
      const box={east:[u,v+d,d,h],north:[u+d,v+d,w,h],west:[u+d+w,v+d,d,h],south:[u+2*d+w,v+d,w,h],up:[u+d+w,v+d,-w,-d],down:[u+d+2*w,v,-w,d]};
      const mirror=cube.mirror??bone.mirror??false;
      if(cube.uv===undefined)warnings.add('Cubes without UVs use a default box UV at [0,0].');
      for(const [name,vertices]of Object.entries(points)) {
        let rect;
        if(Array.isArray(cube.uv)||!cube.uv)rect=box[mirror?({west:'east',east:'west'}[name]||name):name];
        else {const f=cube.uv[name];if(!f)continue;const size=f.uv_size||(['up','down'].includes(name)?[s[0],s[2]]:['east','west'].includes(name)?[s[2],s[1]]:[s[0],s[1]]);rect=[...f.uv,...size];if(name==='up'||name==='down')rect=[rect[0]+rect[2],rect[1]+rect[3],-rect[2],-rect[3]];if(f.uv_rotation)warnings.add('Per-face uv_rotation is unsupported.');if(f.material_instance)warnings.add('Per-face material instances use the selected texture.');}
        let [a,b,c,e]=rect;
        let uv=[[a,b],[a+c,b],[a+c,b+e],[a,b+e]].map(([U,V])=>[U/width,V/height]);
        if(mirror&&Array.isArray(cube.uv)){uv=uv.map(([U,V])=>[(2*a+c)/width-U,V]);}
        const transformed=vertices.map(p=>{p=rotate(p,scenePoint(cube.pivot),sceneRotation(cube.rotation));for(const parent of chain)p=rotate(p,scenePoint(parent.pivot),sceneRotation(parent.rotation||parent.bind_pose_rotation));return p;});
        faces.push({name,bone:bone.name,positions:transformed,uv});
      }
    }
  }
  if(!faces.length)warnings.add('No supported cube faces found.');
  return {faces,warnings:[...warnings],width,height};
}
if(typeof module!=='undefined')module.exports={rotate,convert};

/* Local WebGL renderer. No network, eval, project scripts or runtime Molang. */
(() => {
const api=acquireVsCodeApi(),models=document.getElementById('models'),textures=document.getElementById('textures'),status=document.getElementById('status');
const appearanceControls=document.getElementById('appearanceControls'),layersPanel=document.getElementById('layersPanel'),inspectPanel=document.getElementById('inspectPanel'),owners=document.getElementById('owners');
let viewMode='appearance',lastData,hiddenLayers=new Set(),soloLayer;
const propertyPanel=document.createElement('details'),propertySummary=document.createElement('summary'),propertyFields=document.createElement('div'),branchFields=document.createElement('div');propertySummary.textContent='Appearance inputs';propertyPanel.append(propertySummary,propertyFields);propertyPanel.open=true;appearanceControls.append(propertyPanel);inspectPanel.append(branchFields);
const modeLabel=document.createElement('label'),modeToggle=document.createElement('input');modeToggle.type='checkbox';modeToggle.setAttribute('aria-label','Manual geometry and texture inspection');modeLabel.append(modeToggle,document.createTextNode(' Manual geometry / texture inspection'));inspectPanel.prepend(modeLabel);modeToggle.onchange=()=>api.postMessage({type:'mode',manual:modeToggle.checked});
const automatic=document.createElement('button');automatic.textContent='Return to automatic resolution';automatic.onclick=()=>changeMode('appearance');inspectPanel.append(automatic);
const diagnostics=document.createElement('details'),diagnosticTitle=document.createElement('summary'),diagnosticText=document.createElement('pre');diagnosticTitle.textContent='Plan, expressions and provenance';diagnostics.append(diagnosticTitle,diagnosticText);inspectPanel.append(diagnostics);
function setMode(mode){viewMode=mode;layersPanel.hidden=mode!=='layers';inspectPanel.hidden=mode!=='inspect';propertyPanel.hidden=mode==='layers'||!propertyFields.childElementCount;for(const name of ['appearance','layers','inspect'])document.getElementById(name+'Mode').setAttribute('aria-pressed',String(name===mode));}
function changeMode(mode){if(mode==='appearance'){hiddenLayers.clear();soloLayer=undefined;}setMode(mode);api.postMessage({type:'viewMode',mode});draw();}
for(const mode of ['appearance','layers','inspect'])document.getElementById(mode+'Mode').onclick=()=>changeMode(mode);
function button(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=fn;return b;}
function textLine(parent,text){const d=document.createElement('div');d.textContent=text;parent.append(d);}
function sourceButton(parent,source){if(!source?.file)return;parent.append(button('Open '+(source.label||source.file),()=>api.postMessage({type:'openSource',file:source.file})));}
function planControls(plan){
 const identity=document.getElementById('identity');identity.replaceChildren();textLine(identity,plan.entity?.identifier||'Unbound resource');sourceButton(identity,plan.entity?.source);
 layersPanel.replaceChildren(button('Restore all passes',()=>{hiddenLayers.clear();soloLayer=undefined;if(lastData?.appearancePlan)planControls(lastData.appearancePlan);draw();emitRendered();}));
 for(const controller of plan.controllers||[]){const section=document.createElement('div');section.className='layer';textLine(section,(Number.isInteger(controller.order)?String(controller.order+1)+'. ':'')+controller.controller+' · '+controller.status);if(controller.activation)textLine(section,'Activation: '+controller.activation.status+(controller.activation.value!==undefined?' ('+String(controller.activation.value)+')':''));if(controller.reason)textLine(section,controller.reason);const controllerSources=document.createElement('details'),sourceTitle=document.createElement('summary');sourceTitle.textContent='Controller source';controllerSources.append(sourceTitle);for(const source of controller.sources||[])sourceButton(controllerSources,source);section.append(controllerSources);
  const layers=(plan.layers||[]).filter(l=>l.controller===controller.controller);for(const layer of layers)layerControls(section,layer);layersPanel.append(section);
 }
 if(!plan.controllers?.length)for(const layer of plan.layers||[]){const section=document.createElement('div');section.className='layer';layerControls(section,layer);layersPanel.append(section);}
 diagnosticText.textContent=JSON.stringify({...plan,renderPasses:(plan.renderPasses||[]).map(p=>({id:p.id,layerId:p.layerId,geometryId:p.geometryId,textureAlias:p.textureAlias,secondaryTextureAlias:p.secondaryTextureAlias,hiddenBones:p.hiddenBones}))},null,2);
}
function layerControls(section,layer){
 textLine(section,layer.geometryId+' · '+layer.status+(layer.override?' · manual override':''));textLine(section,'Textures: '+(layer.textures||[]).map(t=>t.alias+': '+t.id).join(' + '));
 const materials=[...new Set(Object.values(layer.materials||{}).map(m=>m.id||'(unresolved)'))];textLine(section,'Materials: '+materials.join(', '));const hidden=Object.entries(layer.visibility||{}).filter(([,visible])=>visible===false).length;textLine(section,'Hidden bones: '+hidden+(layer.reason?' · '+layer.reason:''));
 const sources=document.createElement('details'),title=document.createElement('summary');title.textContent='Geometry and texture sources';sources.append(title);sourceButton(sources,layer.sources?.geometry);for(const texture of layer.textures||[])sourceButton(sources,texture.source||texture);section.append(sources);
 if(layer.status!=='inactive'){const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!hiddenLayers.has(layer.id);toggle.setAttribute('aria-label','Show '+layer.controller);toggle.onchange=()=>{if(toggle.checked)hiddenLayers.delete(layer.id);else hiddenLayers.add(layer.id);draw();emitRendered();};label.append(toggle,document.createTextNode('Show pass'));section.append(label,button('Isolate '+layer.controller,()=>{hiddenLayers=new Set((lastData?.appearancePlan?.layers||[]).filter(other=>other.id!==layer.id).map(other=>other.id));soloLayer=undefined;if(lastData?.appearancePlan)planControls(lastData.appearancePlan);draw();emitRendered();}));}
 for(const warning of layer.warnings||[])textLine(section,warning);
}
function propertyControls(fields,values,variants=[]){
 const active=document.activeElement,focused=active?.getAttribute('aria-label'),draft=active?.value;let restoreFocus;propertyFields.replaceChildren();branchFields.replaceChildren();const groups=new Map();
 for(const field of fields){const group=field.group||'Synced entity properties';if(!groups.has(group)){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=group;details.append(summary);details.open=true;propertyFields.append(details);groups.set(group,details);}const label=document.createElement('label');label.textContent=(field.label||field.name)+' ';if(field.source)label.title=field.source;let input;
  if(field.values){input=document.createElement('select');if(field.default===undefined)input.append(new Option('Unresolved / supply preview value',''));for(const [i,v]of field.values.entries())input.append(new Option(String(v),String(i)));const selected=field.values.indexOf(values[field.name]);input.value=selected<0?'':String(selected);}
  else{input=document.createElement('input');input.type='number';input.min=String(field.range[0]);input.max=String(field.range[1]);input.step=field.type==='int'?'1':'any';input.value=values[field.name]===undefined?'':String(values[field.name]);input.placeholder='Unresolved';}
  input.setAttribute('aria-label',field.name);input.onchange=()=>{if(!input.checkValidity())return;api.postMessage({type:'properties',values:{[field.name]:input.value===''?null:field.values?field.values[Number(input.value)]:Number(input.value)}});};label.append(input);groups.get(group).append(label,document.createElement('br'));if(focused===field.name){input.value=draft;restoreFocus=input;}
 }
 for(const variant of variants){const label=document.createElement('label');label.textContent=variant.controller+' ';const input=document.createElement('select');input.setAttribute('aria-label','Branch '+variant.controller);input.append(new Option('Unresolved controller branch',''));for(const option of variant.options)input.append(new Option(option.label,option.key));input.value=variant.selected||'';input.onchange=()=>api.postMessage({type:'controllerChoice',controller:variant.controller,choice:input.value});label.append(input);branchFields.append(label,document.createElement('br'));}
 if(fields.length)propertyFields.append(button('Reset appearance inputs',()=>api.postMessage({type:'properties',reset:true,values:{}})));
 propertyPanel.hidden=viewMode==='layers'||!fields.length;if(restoreFocus)restoreFocus.focus({preventScroll:true});
}
const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','3D model preview. Drag to rotate, right drag to pan, wheel to zoom.');document.body.append(canvas);
const gl=canvas.getContext('webgl',{alpha:false,antialias:false});
if(!gl){status.textContent='WebGL is unavailable in this VS Code host.';return;}
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec2 uv;uniform mat4 camera;varying vec2 tex;void main(){gl_Position=camera*vec4(p,1.0);tex=uv;}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 tex;uniform sampler2D image;uniform float opaque;uniform float emission;void main(){vec4 c=texture2D(image,tex);float glow=emission>0.5?1.0-c.a:0.0;if(opaque<0.5&&c.a<0.1)discard;if(opaque>0.5)c.a=1.0;c.rgb*=mix(0.8,1.0,glow);gl_FragColor=c;}'));gl.linkProgram(program);gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(const [name,size,offset]of [['p',3,0],['uv',2,12]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,20,offset);}
const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
let choices=[],mesh,renderPasses=[],center=[0,0,0],radius=16,yaw=-0.6,pitch=-0.3,zoom=1,pan=[0,0],generation=0;
function reset(){yaw=-0.6;pitch=-0.3;zoom=1;pan=[0,0];draw();}document.getElementById('reset').onclick=reset;
function draw(){
 canvas.width=Math.max(1,innerWidth*devicePixelRatio);canvas.height=Math.max(1,(innerHeight-document.querySelector('header').offsetHeight)*devicePixelRatio);canvas.style.width=innerWidth+'px';canvas.style.height=canvas.height/devicePixelRatio+'px';gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.14,.15,.17,1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(!mesh)return;
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),scale=0.8*zoom/radius,aspect=canvas.height/canvas.width;
 const rows=[[cy*scale*aspect,0,-sy*scale*aspect],[-sy*sp*scale,cp*scale,-cy*sp*scale],[sy*cp/(radius*10),sp/(radius*10),cy*cp/(radius*10)]];
 const matrix=new Float32Array(16);for(let r=0;r<3;r++){for(let c=0;c<3;c++)matrix[c*4+r]=rows[r][c];matrix[12+r]=-rows[r].reduce((n,v,i)=>n+v*center[i],0)+(r<2?pan[r]:0);}matrix[15]=1;
 gl.uniformMatrix4fv(gl.getUniformLocation(program,'camera'),false,matrix);
 // Back-to-front face order for fractional alpha; depth still handles opaque intersections.
 for(const pass of renderPasses.filter(passVisible)){gl.bindTexture(gl.TEXTURE_2D,pass.texture);const sorted=[...pass.mesh.faces].sort((a,b)=>{const depth=f=>f.positions.reduce((n,p)=>n+rows[2].reduce((v,k,i)=>v+k*p[i],0),0);return depth(b)-depth(a);});
 for(const f of sorted){const material=pass.source.materials?.[f.bone];gl.depthMask(material?.depthWrite!==undefined?material.depthWrite:!material?.translucent);if(material?.noCull===false){gl.enable(gl.CULL_FACE);gl.frontFace(gl.CW);}else gl.disable(gl.CULL_FACE);gl.depthFunc(material?.depth==='Equal'?gl.EQUAL:material?.depth==='LessEqual'||material?.translucent?gl.LEQUAL:gl.LESS);gl.uniform1f(gl.getUniformLocation(program,'opaque'),material?.opaque?1:0);gl.uniform1f(gl.getUniformLocation(program,'emission'),material?.emissive?1:0);const data=[];for(const i of [0,1,2,0,2,3])data.push(...f.positions[i],...f.uv[i]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/5);}}
}
function options(select,labels,placeholder){select.replaceChildren(new Option(placeholder,'-1'),...labels.map((label,i)=>new Option(label,String(i))));}
function select(manual){api.postMessage({type:'select',manual,model:Number(models.value),texture:Number(textures.value)});}
owners.onchange=()=>{models.value=owners.value;select(false);};
models.onchange=()=>{options(textures,choices[models.value]?.textures||[],'Choose texture / neutral');textures.value=String(choices[models.value]?.defaultTexture??-1);select(false);};textures.onchange=()=>select(true);
window.addEventListener('message',async({data})=>{
 if(data.type==='propertyControls'){propertyControls(data.fields,data.values,data.variants);draw();}
 if(data.type==='choices'){choices=data.models;mesh=undefined;generation++;setMode(data.viewMode||viewMode);draw();modeToggle.checked=!!data.manual;models.parentElement.hidden=!data.manual;textures.parentElement.hidden=!data.manual;models.replaceChildren(new Option('Choose geometry','-1'));owners.replaceChildren(new Option('Choose entity','-1'));const seen=new Set();for(const [i,m]of choices.entries()){models.append(new Option(m.label,String(i)));if(!seen.has(m.ownerKey)){owners.append(new Option(m.owner,String(i)));seen.add(m.ownerKey);}}models.value=String(data.selection.model);owners.value=String(choices.findIndex(m=>m.ownerKey===choices[data.selection.model]?.ownerKey));document.getElementById('ownerLabel').hidden=seen.size<=1;options(textures,choices[data.selection.model]?.textures||[],'Choose texture / neutral');textures.value=String(data.selection.texture);if(data.selection.model<0)status.textContent='Choose an entity. Multiple resource bindings are possible.';}
 if(data.type==='error'){status.textContent=data.message;mesh=undefined;draw();}
 if(data.type==='model'){const token=++generation,created=[];try{
  lastData=data;if(data.appearancePlan)planControls(data.appearancePlan);const sources=data.appearancePlan?.renderPasses||data.passes||[data];for(const source of sources){const pass={source,mesh:convert(source.geometry,source.visibility),texture:gl.createTexture()};created.push(pass);gl.bindTexture(gl.TEXTURE_2D,pass.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(source.texture){const image=new Image();image.src=source.texture;await image.decode();if(token!==generation){for(const p of created)gl.deleteTexture(p.texture);return;}if(image.width>gl.getParameter(gl.MAX_TEXTURE_SIZE)||image.height>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('Texture exceeds GPU limits.');gl.bindTexture(gl.TEXTURE_2D,pass.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([195,195,195,255]));}
  for(const pass of renderPasses)gl.deleteTexture(pass.texture);renderPasses=created;mesh={faces:created.flatMap(p=>p.mesh.faces),warnings:created.flatMap(p=>p.mesh.warnings)};const points=mesh.faces.flatMap(f=>f.positions);center=[0,1,2].map(i=>{let lo=Infinity,hi=-Infinity;for(const p of points){lo=Math.min(lo,p[i]);hi=Math.max(hi,p[i]);}return points.length?(lo+hi)/2:0;});radius=1;for(const p of points)radius=Math.max(radius,Math.hypot(...p.map((v,i)=>v-center[i])));status.textContent=[data.warning,...new Set(mesh.warnings)].filter(Boolean).join('\n').split('\n').slice(0,3).join('\n');draw();emitRendered();
 }catch(e){for(const p of created)gl.deleteTexture(p.texture);status.textContent=e.message;api.postMessage({type:'renderError',message:e.message});}}
});
function passVisible(pass){return !hiddenLayers.has(pass.source.layerId)&&(!soloLayer||pass.source.layerId===soloLayer);}
function emitRendered(){if(!lastData)return;const active=renderPasses.filter(passVisible),data=lastData;api.postMessage({type:'rendered',viewMode,geometryId:data.geometryId,textureAlias:data.textureAlias,textureId:data.textureId,passes:active.map(p=>({controller:p.source.controller,geometryId:p.source.geometryId,textureAlias:p.source.textureAlias,secondaryTextureAlias:p.source.secondaryTextureAlias,faces:p.mesh.faces.length})),faces:active.reduce((n,p)=>n+p.mesh.faces.length,0),hiddenBones:data.hiddenBones,properties:data.properties,textured:active.some(p=>!!p.source.texture),uvWidth:active[0]?.mesh.width,uvHeight:active[0]?.mesh.height,canvasHeight:canvas.height,viewportWidth:canvas.clientWidth,controlsWidth:document.querySelector('header').scrollWidth,controlsClientWidth:document.querySelector('header').clientWidth,warning:data.warning});}
let drag;canvas.oncontextmenu=e=>e.preventDefault();canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,pan:e.button!==0};canvas.setPointerCapture(e.pointerId);};canvas.onpointerup=()=>drag=undefined;canvas.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(drag.pan){pan[0]+=dx*2/canvas.clientWidth;pan[1]-=dy*2/canvas.clientHeight;}else{yaw+=dx*.01;pitch=Math.max(-1.55,Math.min(1.55,pitch+dy*.01));}drag.x=e.clientX;drag.y=e.clientY;draw();};canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.05,Math.min(100,zoom*Math.exp(-e.deltaY*.001)));draw();};window.onresize=draw;draw();api.postMessage({type:'ready'});
})();
