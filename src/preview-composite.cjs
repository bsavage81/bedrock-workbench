const {PNG}=require('pngjs'),{tga}=require('./preview-images.cjs');
const palette=['f9fffe','f9801d','c74ebd','3ab3da','fed83d','80c71f','f38baa','474f52','9d9d97','169c9c','8932b8','3c44aa','835432','5e7c16','b02e26','1d1d21'].map(s=>[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255));
function decode(bytes,file){
 if(/\.tga$/i.test(file))return tga(bytes);
 // Check PNG dimensions before pngjs allocates/inflates the pixel buffer.
 if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Material composition requires PNG or TGA images.');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>4096||height>4096)throw Error('Material image exceeds dimensions limit');
 return PNG.sync.read(bytes);
}
function compose(base,overlay,material,values={}){
 const a=base,b=overlay,out={width:a.width,height:a.height,data:Buffer.from(a.data)},c=palette[values['query.color']]||[1,1,1],c2=palette[values['query.color2']]||[1,1,1];
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const i=(y*a.width+x)*4,j=b?(Math.floor(y*b.height/a.height)*b.width+Math.floor(x*b.width/a.width))*4:0,alpha=a.data[i+3]/255,mask=b?b.data[j+3]/255:0;
  for(let k=0;k<3;k++){let v=a.data[i+k]/255;if(material.colorMask)v*=1-alpha+alpha*c[k];if(b){const v2=b.data[j+k]/255;if(material.multiplicative)v*=1-mask+mask*v2*c2[k];else v=v*(1-mask)+v2*mask;}out.data[i+k]=Math.round(v*255);}
  if(material.colorMask||material.opaque)out.data[i+3]=255;
 }return 'data:image/png;base64,'+PNG.sync.write(out).toString('base64');
}
module.exports={compose,decode,palette};
