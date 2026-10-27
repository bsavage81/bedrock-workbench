const test=require('node:test'),assert=require('node:assert/strict'),{tga,image}=require('../src/preview-images.cjs'),{convert}=require('../src/preview-geometry.cjs'),{PNG}=require('pngjs');
function header({type=2,width=2,height=1,bits=32,descriptor=40}={}){const b=Buffer.alloc(18);b[2]=type;b.writeUInt16LE(width,12);b.writeUInt16LE(height,14);b[16]=bits;b[17]=descriptor;return b;}
test('TGA BGRA, top/bottom/right origins, grayscale and opaque 24-bit decoding',()=>{
 let bytes=Buffer.concat([header(),Buffer.from([0,0,255,255,255,0,0,0])]);let decoded=tga(bytes);assert.deepEqual([...decoded.data],[255,0,0,255,0,0,255,0]);assert.deepEqual([...PNG.sync.read(Buffer.from(image(bytes,'pattern.tga').uri.split(',')[1],'base64')).data],[...decoded.data]);assert.equal(image(bytes,'pattern.tga').transparent,false);
 bytes[17]=56;assert.deepEqual([...tga(bytes).data],[0,0,255,0,255,0,0,255]);
 bytes=Buffer.concat([header({width:1,height:2,descriptor:8}),Buffer.from([0,0,255,255,255,0,0,0])]);assert.deepEqual([...tga(bytes).data],[0,0,255,0,255,0,0,255]);
 assert.deepEqual([...tga(Buffer.concat([header({width:1,bits:24}),Buffer.from([3,2,1])])).data],[1,2,3,255]);
 assert.deepEqual([...tga(Buffer.concat([header({width:1,type:3,bits:16}),Buffer.from([42,0])])).data],[42,42,42,0]);
});
test('TGA RLE packets, transparent layers and malformed/oversized inputs are bounded',()=>{
 const bytes=Buffer.concat([header({type:10}),Buffer.from([129,20,30,40,0])]);assert.deepEqual([...tga(bytes).data],[40,30,20,0,40,30,20,0]);assert.equal(image(bytes,'none.tga').transparent,true);
 assert.throws(()=>tga(bytes.subarray(0,20)),/Truncated/);bytes[18]=130;assert.throws(()=>tga(bytes),/bounds/);assert.throws(()=>tga(header({width:5000})),/dimensions/);assert.throws(()=>tga(header({type:1})),/Unsupported/);
});
test('fractional pellet and horn box UV dimensions use whole texels without changing geometry',()=>{
 const make=size=>({description:{texture_width:8,texture_height:8},bones:[{name:'pellet',cubes:[{origin:[0,0,0],size,uv:[0,0]}]}]});
 let mesh=convert(make([1.3,1.3,1.3]));assert.deepEqual(mesh.faces.find(f=>f.name==='south').uv.map(v=>v.map(n=>n*8)),[[3,1],[4,1],[4,2],[3,2]]);assert.ok(mesh.faces.some(f=>f.positions.some(v=>v.includes(1.3))));
 mesh=convert(make([2.75,1.5,1.75]));assert.deepEqual(mesh.faces.find(f=>f.name==='north').uv.map(v=>v.map(n=>n*8)),[[1,1],[3,1],[3,2],[1,2]]);
 const explicit=make([1.3,1.3,1.3]);explicit.bones[0].cubes[0].uv={north:{uv:[0,0],uv_size:[1.3,1.3]}};assert.equal(convert(explicit).faces[0].uv[2][0],1.3/8);
});
