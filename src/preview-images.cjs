// Local TGA support. Decode only bounded true-color/grayscale images, no scripts.
const {PNG}=require('pngjs');
function tga(bytes){
 if(bytes.length<18)throw Error('Truncated TGA header.');
 const type=bytes[2],width=bytes.readUInt16LE(12),height=bytes.readUInt16LE(14),bits=bytes[16],descriptor=bytes[17],rle=type===10||type===11,gray=type===3||type===11;
 if(bytes[1]!==0||![2,3,10,11].includes(type)||!(gray?[8,16].includes(bits):[24,32].includes(bits)))throw Error('Unsupported TGA encoding; expected true-color or grayscale, raw or RLE.');
 if(!width||!height||width>4096||height>4096||width*height>16*1024*1024||descriptor&192)throw Error('Unsupported TGA dimensions or interleaving.');
 const data=Buffer.alloc(width*height*4),stride=bits/8;let offset=18+bytes[0],pixel=0;
 function read(){if(offset+stride>bytes.length)throw Error('Truncated TGA pixels.');const b=bytes.subarray(offset,offset+stride);offset+=stride;return gray?[b[0],b[0],b[0],stride===2?b[1]:255]:[b[2],b[1],b[0],stride===4&&descriptor&15?b[3]:255];}
 function write(color){const x=pixel%width,y=Math.floor(pixel/width),dest=((descriptor&32?y:height-1-y)*width+(descriptor&16?width-1-x:x))*4;data.set(color,dest);pixel++;}
 while(pixel<width*height){if(!rle){write(read());continue;}if(offset>=bytes.length)throw Error('Truncated TGA RLE packet.');const packet=bytes[offset++],count=(packet&127)+1;if(pixel+count>width*height)throw Error('TGA RLE packet exceeds image bounds.');if(packet&128){const color=read();for(let i=0;i<count;i++)write(color);}else for(let i=0;i<count;i++)write(read());}
 return {width,height,data};
}
function image(bytes,file){
 if(/\.tga$/i.test(file)){const decoded=tga(bytes);return {uri:'data:image/png;base64,'+PNG.sync.write(decoded).toString('base64'),transparent:decoded.data.every((v,i)=>i%4!==3||v===0),width:decoded.width,height:decoded.height};}
 if(!/\.(png|jpe?g)$/i.test(file))throw Error('Unsupported preview image format.');
 return {uri:`data:image/${/\.png$/i.test(file)?'png':'jpeg'};base64,${bytes.toString('base64')}`};
}
module.exports={tga,image};
