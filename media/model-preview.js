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
const propertyPanel=document.createElement('details'),propertySummary=document.createElement('summary'),propertyFields=document.createElement('div');propertySummary.textContent='Controller appearance';propertyPanel.append(propertySummary,propertyFields);propertyPanel.hidden=true;propertyPanel.open=true;document.querySelector('header').insertBefore(propertyPanel,status);
const modeLabel=document.createElement('label'),modeToggle=document.createElement('input');modeToggle.type='checkbox';modeLabel.append(modeToggle,document.createTextNode(' Manual geometry / texture inspection'));document.querySelector('header').insertBefore(modeLabel,propertyPanel);modeToggle.onchange=()=>api.postMessage({type:'mode',manual:modeToggle.checked});
function propertyControls(fields,values,variants=[]){
 propertyPanel.hidden=!fields.length&&!variants.length;propertyFields.replaceChildren();const controls=[];
 const submit=()=>{const values={};for(const {field,input}of controls){if(input.value==='')continue;values[field.name]=field.values?field.values[Number(input.value)]:Number(input.value);}api.postMessage({type:'properties',values});};
 for(const field of fields){const label=document.createElement('label');label.textContent=field.name+' ';let input;
  if(field.values){input=document.createElement('select');if(field.default===undefined)input.append(new Option('Unresolved / no literal default',''));for(const [i,v]of field.values.entries())input.append(new Option(String(v),String(i)));const selected=field.values.indexOf(values[field.name]);input.value=selected<0?'':String(selected);}
  else{input=document.createElement('input');input.type='number';input.min=String(field.range[0]);input.max=String(field.range[1]);input.step=field.type==='int'?'1':'any';input.value=values[field.name]===undefined?'':String(values[field.name]);input.placeholder='Unresolved';}
  input.setAttribute('aria-label',field.name);input.onchange=()=>{if(input.checkValidity())submit();};label.append(input);propertyFields.append(label,document.createElement('br'));controls.push({field,input});
 }
 for(const variant of variants){const label=document.createElement('label');label.textContent=variant.controller+' ';const input=document.createElement('select');input.append(new Option('Choose reachable controller variant',''));for(const option of variant.options)input.append(new Option(option.label,option.key));input.value=variant.selected||'';input.onchange=()=>api.postMessage({type:'controllerChoice',controller:variant.controller,choice:input.value});label.append(input);propertyFields.append(label,document.createElement('br'));}
 const reset=document.createElement('button');reset.textContent='Reset properties';reset.onclick=()=>api.postMessage({type:'properties',reset:true,values:{}});propertyFields.append(reset);
}
const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','3D model preview. Drag to rotate, right drag to pan, wheel to zoom.');document.body.append(canvas);
const gl=canvas.getContext('webgl',{alpha:false,antialias:false});
if(!gl){status.textContent='WebGL is unavailable in this VS Code host.';return;}
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec2 uv;uniform mat4 camera;varying vec2 tex;void main(){gl_Position=camera*vec4(p,1.0);tex=uv;}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 tex;uniform sampler2D image;void main(){vec4 c=texture2D(image,tex);if(c.a<0.1)discard;gl_FragColor=c;}'));gl.linkProgram(program);gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(const [name,size,offset]of [['p',3,0],['uv',2,12]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,20,offset);}
const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
let choices=[],mesh,renderPasses=[],center=[0,0,0],radius=16,yaw=-0.6,pitch=-0.3,zoom=1,pan=[0,0],generation=0;
function reset(){yaw=-0.6;pitch=-0.3;zoom=1;pan=[0,0];draw();}document.getElementById('reset').onclick=reset;
function draw(){
 canvas.width=Math.max(1,innerWidth*devicePixelRatio);canvas.height=Math.max(1,(innerHeight-document.querySelector('header').offsetHeight)*devicePixelRatio);canvas.style.width=innerWidth+'px';canvas.style.height=canvas.height/devicePixelRatio+'px';gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.14,.15,.17,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(!mesh)return;
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),scale=0.8*zoom/radius,aspect=canvas.height/canvas.width;
 const rows=[[cy*scale*aspect,0,-sy*scale*aspect],[-sy*sp*scale,cp*scale,-cy*sp*scale],[sy*cp/(radius*10),sp/(radius*10),cy*cp/(radius*10)]];
 const matrix=new Float32Array(16);for(let r=0;r<3;r++){for(let c=0;c<3;c++)matrix[c*4+r]=rows[r][c];matrix[12+r]=-rows[r].reduce((n,v,i)=>n+v*center[i],0)+(r<2?pan[r]:0);}matrix[15]=1;
 gl.uniformMatrix4fv(gl.getUniformLocation(program,'camera'),false,matrix);
 // Back-to-front face order for fractional alpha; depth still handles opaque intersections.
 for(const pass of renderPasses){gl.bindTexture(gl.TEXTURE_2D,pass.texture);const sorted=[...pass.mesh.faces].sort((a,b)=>{const depth=f=>f.positions.reduce((n,p)=>n+rows[2].reduce((v,k,i)=>v+k*p[i],0),0);return depth(b)-depth(a);});
 const data=[];for(const f of sorted)for(const i of [0,1,2,0,2,3])data.push(...f.positions[i],...f.uv[i]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/5);}
}
function options(select,labels,placeholder){select.replaceChildren(new Option(placeholder,'-1'),...labels.map((label,i)=>new Option(label,String(i))));}
function select(manual){api.postMessage({type:'select',manual,model:Number(models.value),texture:Number(textures.value)});}
models.onchange=()=>{options(textures,choices[models.value]?.textures||[],'Choose texture / neutral');textures.value=String(choices[models.value]?.defaultTexture??-1);select(false);};textures.onchange=()=>select(true);
window.addEventListener('message',async({data})=>{
 if(data.type==='propertyControls'){propertyControls(data.fields,data.values,data.variants);draw();}
 if(data.type==='choices'){choices=data.models;mesh=undefined;generation++;draw();modeToggle.checked=!!data.manual;textures.parentElement.hidden=!data.manual;models.parentElement.firstChild.textContent=data.manual?'Model / owner ':'Owner ';models.replaceChildren(new Option('Choose owner / model','-1'));const seen=new Map();for(const [i,m]of choices.entries()){if(!data.manual&&seen.has(m.ownerKey))continue;seen.set(m.ownerKey,i);models.append(new Option(data.manual?m.label:m.owner,String(i)));}const selected=data.manual?data.selection.model:seen.get(choices[data.selection.model]?.ownerKey)??-1;models.value=String(selected);options(textures,choices[selected]?.textures||[],'Choose texture / neutral');textures.value=String(data.selection.texture);if(selected<0)status.textContent='Choose an owner. Multiple resource bindings are possible.';}
 if(data.type==='error'){status.textContent=data.message;mesh=undefined;draw();}
 if(data.type==='model'){const token=++generation,created=[];try{
  const sources=data.passes||[data];for(const source of sources){const pass={source,mesh:convert(source.geometry,source.visibility),texture:gl.createTexture()};created.push(pass);gl.bindTexture(gl.TEXTURE_2D,pass.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(source.texture){const image=new Image();image.src=source.texture;await image.decode();if(token!==generation){for(const p of created)gl.deleteTexture(p.texture);return;}if(image.width>gl.getParameter(gl.MAX_TEXTURE_SIZE)||image.height>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('Texture exceeds GPU limits.');gl.bindTexture(gl.TEXTURE_2D,pass.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([195,195,195,255]));}
  for(const pass of renderPasses)gl.deleteTexture(pass.texture);renderPasses=created;mesh={faces:created.flatMap(p=>p.mesh.faces),warnings:created.flatMap(p=>p.mesh.warnings)};const points=mesh.faces.flatMap(f=>f.positions);center=[0,1,2].map(i=>{let lo=Infinity,hi=-Infinity;for(const p of points){lo=Math.min(lo,p[i]);hi=Math.max(hi,p[i]);}return points.length?(lo+hi)/2:0;});radius=1;for(const p of points)radius=Math.max(radius,Math.hypot(...p.map((v,i)=>v-center[i])));status.textContent=[data.warning,...new Set(mesh.warnings)].join('\n');draw();api.postMessage({type:'rendered',geometryId:data.geometryId,textureAlias:data.textureAlias,textureId:data.textureId,passes:created.map(p=>({controller:p.source.controller,geometryId:p.source.geometryId,textureAlias:p.source.textureAlias,faces:p.mesh.faces.length})),faces:mesh.faces.length,hiddenBones:data.hiddenBones,properties:data.properties,textured:created.some(p=>!!p.source.texture),uvWidth:created[0]?.mesh.width,uvHeight:created[0]?.mesh.height,canvasHeight:canvas.height,warning:data.warning});
 }catch(e){for(const p of created)gl.deleteTexture(p.texture);status.textContent=e.message;api.postMessage({type:'renderError',message:e.message});}}
});
let drag;canvas.oncontextmenu=e=>e.preventDefault();canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,pan:e.button!==0};canvas.setPointerCapture(e.pointerId);};canvas.onpointerup=()=>drag=undefined;canvas.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(drag.pan){pan[0]+=dx*2/canvas.clientWidth;pan[1]-=dy*2/canvas.clientHeight;}else{yaw+=dx*.01;pitch=Math.max(-1.55,Math.min(1.55,pitch+dy*.01));}drag.x=e.clientX;drag.y=e.clientY;draw();};canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.05,Math.min(100,zoom*Math.exp(-e.deltaY*.001)));draw();};window.onresize=draw;draw();api.postMessage({type:'ready'});
})();
