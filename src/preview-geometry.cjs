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
