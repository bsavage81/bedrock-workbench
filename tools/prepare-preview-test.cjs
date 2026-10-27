const fs=require('node:fs/promises'),path=require('node:path'),core=require('../src/core.cjs'),{PNG}=require('pngjs');
(async()=>{
 const root=path.resolve('.test-temp/preview-project');for(const p of ['BP','RP/models','RP/entity','RP/textures'])await fs.mkdir(path.join(root,p),{recursive:true});
 for(const [side,type]of [['BP','data'],['RP','resources']])await core.writeJson(path.join(root,side,'manifest.json'),{format_version:2,header:{name:'Preview fixture',description:'Isolated static preview tests',uuid:require('node:crypto').randomUUID(),version:[1,0,0],min_engine_version:[1,21,0]},modules:[{type,uuid:require('node:crypto').randomUUID(),version:[1,0,0]}]});
 await core.initialize(root);
 const faces={};for(const [i,name]of ['north','south','west','east','up','down'].entries())faces[name]={uv:[i*8,0],uv_size:[8,8]};
 await core.writeJson(path.join(root,'RP/models/uv.geo.json'),{format_version:'1.12.0','minecraft:geometry':[{description:{identifier:'geometry.uv',texture_width:48,texture_height:8},bones:[{name:'root',cubes:[{origin:[-4,0,-4],size:[8,8,8],uv:faces}]}]}]});
 await core.writeJson(path.join(root,'RP/entity/uv.json'),{'minecraft:client_entity':{description:{identifier:'test:uv',geometry:{default:'geometry.uv'},textures:{default:'textures/uv'}}}});
 const png=new PNG({width:48,height:8}),colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255]];
 for(let y=0;y<8;y++)for(let x=0;x<48;x++){const i=(y*48+x)*4;png.data.set([...colors[Math.floor(x/8)],x%8===y?0:255],i);}await fs.writeFile(path.join(root,'RP/textures/uv.png'),PNG.sync.write(png));
 console.log(root);
})();
