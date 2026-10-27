const fs = require('node:fs/promises');
const path = require('node:path');
const { unzipSync } = require('fflate');
const { compareVersions } = require('./releases.cjs');
const core = require('./core.cjs');
const documentation = require('./documentation.cjs');
const API = 'https://api.github.com/repos/Mojang/bedrock-samples/releases?per_page=100';
function engine(tag) { return /^v(\d+\.\d+\.\d+)\.\d+(?:-preview)?$/.exec(tag)?.[1]; }
function chooseRelease(list, target, channel = 'release') {
  return list.filter(r => !r.draft && (channel === 'preview' || !r.prerelease) && engine(r.tag_name) && compareVersions(engine(r.tag_name), target) <= 0)
    .sort((a, b) => compareVersions(engine(b.tag_name), engine(a.tag_name)) || parseInt(b.tag_name.split('.').at(-1), 10) - parseInt(a.tag_name.split('.').at(-1), 10))[0];
}
function descriptionText(value) {
  const parts=Array.isArray(value)?value:[value];
  return parts.filter(part=>typeof part==='string'&&part.trim()&&!/^[+-]?\d+$/.test(part.trim())).join('\n\n');
}
function cleanDescriptions(index) {
  for(const components of Object.values(index?.components||{}))for(const value of Object.values(components)){
    value.description=descriptionText(value.description);
    for(const field of Object.values(value.fields||{}))field.description=descriptionText(field.description);
  }
  return index;
}
function buildIndex(bytes, tag) {
  const vanilla=require('./vanilla.cjs').collector();
  let expanded = 0;
  const files = unzipSync(bytes, { filter: entry => {
    const pack=/^(behavior_pack|resource_pack)\/(.*)$/.exec(entry.name);
    if(pack && /\.(?:png|tga|jpe?g|mcfunction)$/i.test(pack[2])) { vanilla.file(pack[1]==='behavior_pack'?'behavior':'resource',pack[2]);return false; }
    if (!/^resource_pack\/materials\/.*\.material$/.test(entry.name) && !/^resource_pack\/texts\/[^/]+\.lang$/.test(entry.name) && !/^metadata\/(doc_modules|json_schemas|command_modules|vanilladata_modules)\/.*\.json$/.test(entry.name) && !/^(?:behavior_pack\/(?:blocks|items|entities|loot_tables|recipes|trading|animations|animation_controllers)|resource_pack\/(?:models|entity|attachables|animations|animation_controllers|render_controllers|particles|sounds|textures))\/.*\.json$/.test(entry.name)) return false;
    expanded += entry.originalSize;
    if (entry.originalSize > 8 * 1024 * 1024 || expanded > 96 * 1024 * 1024) throw new Error('Mojang reference archive exceeds expanded size limit');
    return true;
  } });
  const read = name => files[name] && JSON.parse(Buffer.from(files[name]).toString('utf8'));
  const result = { tag, engine: engine(tag), source: `https://github.com/Mojang/bedrock-samples/tree/${tag}`, components: { block: {}, entity: {}, item: {} } };
  const text = descriptionText;
  result.intelligenceVersion = 12;
  result.vanilla = {};result.formatVersions={};result.languages=[];result.vanillaNames={item:{},block:{}};result.previewGeometry=[];result.previewOwners=[];result.previewControllers=[];
  for (const [file, kind] of Object.entries({ items: 'item', blocks: 'block', entities: 'entity', effects: 'effect', enchantments: 'enchantment', biomes: 'biome', dimensions: 'dimension' })) {
    result.vanilla[kind] = [...new Set((read(`metadata/vanilladata_modules/mojang-${file}.json`)?.data_items || []).map(value => value.command_name || value.name).filter(value => typeof value === 'string'))];
  }
  for(const [file,kind]of [['items','item'],['blocks','block']])for(const value of read('metadata/vanilladata_modules/mojang-'+file+'.json')?.data_items||[]){const id=value.command_name||value.name,key=value.serialization_id;if(typeof id==='string'&&typeof key==='string')result.vanillaNames[kind][id]=[key+'.name',key];}
  result.commands = read('metadata/command_modules/mojang-commands.json') || { commands: [], command_enums: [] };
  for (const kind of ['terrain_texture', 'item_texture']) {
    const bytes = files[`resource_pack/textures/${kind}.json`];
    result.vanilla[kind] = bytes ? Object.keys(require('jsonc-parser').parse(Buffer.from(bytes).toString('utf8'))?.texture_data || {}) : [];
  }
  for(const [file,bytes]of Object.entries(files)) {
    if(/^resource_pack\/texts\/[^/]+\.lang$/.test(file)){result.languages.push(require('./localization.cjs').vanillaDocument(Buffer.from(bytes).toString('utf8'),file));continue;}
    const match=/^(behavior_pack|resource_pack)\/(.*)$/.exec(file);if(!match)continue;
    const errors=[],data=require('jsonc-parser').parse(Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/,''),errors,{allowTrailingComma:true});
    if(!errors.length){const side=match[1]==='behavior_pack'?'behavior':'resource';vanilla.file(side,match[2],data);if(side==='resource'&&match[2].startsWith('models/')&&(Array.isArray(data?.['minecraft:geometry'])||Object.keys(data||{}).some(k=>k.startsWith('geometry.'))))result.previewGeometry.push({relative:match[2],data});if(side==='resource'&&(data?.['minecraft:client_entity']||data?.['minecraft:attachable']))result.previewOwners.push({relative:match[2],data});if(side==='resource'&&data?.render_controllers)result.previewControllers.push({relative:match[2],data});if(require('./format-versions.cjs').version(data?.format_version)){const family=side+':'+match[2].split('/')[0];const values=result.formatVersions[family]||=[];if(!values.includes(data.format_version))values.push(data.format_version);}}
  }
  for(const [kind,ids]of Object.entries(vanilla.finish()))result.vanilla[kind]=[...new Set([...(result.vanilla[kind]||[]),...ids])];
  result.vanillaBySide=vanilla.bySide();result.vanillaReferences=vanilla.references();for(const kind of ['item','block'])for(const [id,keys]of Object.entries(vanilla.names()[kind]))result.vanillaNames[kind][id]=[...new Set([...keys,...(result.vanillaNames[kind][id]||[])])];
  function documented(node) {
    return { description: text(node.description), type: node.type, default: node.default,
      fields: Object.fromEntries((node.nodes || []).filter(n => n.name && !n.name.includes(' ')).map(n => [n.name, { description: text(n.description), type: n.type, default: n.default }])) };
  }
  function walk(node, kind, active = false) {
    active ||= kind === 'block' ? node.name === 'Block Components' : ['Components', 'AI Goals', 'Attributes', 'Properties', 'Triggers'].includes(node.name);
    if (active && /^minecraft:/.test(node.name || '')) {
      const previous=result.components[kind][node.name], next=documented(node);
      if(kind==='entity'&&node.name.startsWith('minecraft:behavior.')&&!next.fields.priority)next.fields.priority={description:'AI goal scheduling priority. Lower numbers are considered before higher numbers.',type:'Integer',default:0};
      // Hidden duplicate nodes are cross-references, sometimes containing an
      // internal numeric ID instead of prose. Never replace a full declaration.
      if(!previous)result.components[kind][node.name]=next;
      else if(node.show_in_index!==false){
        result.components[kind][node.name]={...previous,...next,description:next.description||previous.description,fields:{...previous.fields,...next.fields}};
      }
    }
    for (const child of node.nodes || []) walk(child, kind, active);
  }
  const blocks = read('metadata/doc_modules/blocks.json');
  if (blocks) walk(blocks, 'block');
  const entities = read('metadata/doc_modules/entities.json');
  function findServer(n) { if (n.name === 'Server Entity Documentation') walk(n, 'entity'); else for (const c of n.nodes || []) findServer(c); }
  if (entities) {findServer(entities);result.filters=require('./filters.cjs').extract(entities);}
  const catalogs = Object.keys(files).filter(n => /^metadata\/json_schemas\/server\/item\/\d+\.\d+\.\d+\/Item Components.json$/.test(n))
    .filter(n => compareVersions(n.split('/')[4], result.engine) <= 0).sort((a, b) => compareVersions(a.split('/')[4], b.split('/')[4]));
  function resolve(schema, file, depth = 0) {
    if (!schema || depth > 8) return {};
    if (!schema.$ref || schema.$ref.includes('#')) return schema;
    const relative = decodeURIComponent(schema.$ref);
    const next = relative.startsWith('/') ? 'metadata/json_schemas' + relative : path.posix.normalize(path.posix.join(path.posix.dirname(file), relative));
    if (!next.startsWith('metadata/json_schemas/') || next.includes('/beta/')) return schema;
    return { ...resolve(read(next), next, depth + 1), ...Object.fromEntries(Object.entries(schema).filter(([k]) => k !== '$ref')) };
  }
  for (const file of catalogs) for (const [name, raw] of Object.entries(read(file).properties || {})) {
    const schema = resolve(raw, file);
    result.components.item[name] = { description: text(schema.description), type: schema.type,
      fields: Object.fromEntries(Object.entries(schema.properties || {}).map(([key, value]) => { const field = resolve(value, file); return [key, { description: text(field.description), type: field.type, default: field.default }]; })) };
  }
  if (!Object.values(result.components).every(c => Object.keys(c).length)) throw new Error('Mojang reference archive is missing component documentation');
  return result;
}
async function loadReference(root, target, { force = false, fetchImpl = globalThis.fetch, includePreviewGeometry = false, channel = 'release' } = {}) {
  const published = require('./authoring-data.cjs').reference;
  if (published && published.engine && compareVersions(published.engine, target) <= 0 && (!includePreviewGeometry || Array.isArray(published.previewGeometry))) return { ...published, target };
  const file = await core.local(root, '.bedrock/reference/components.json');
  const cached = await fs.readFile(file, 'utf8').then(JSON.parse).then(cleanDescriptions).catch(() => null);
  const channelMatch = (cached?.requestedChannel || 'release') === channel;
  if (!force && channelMatch && cached?.intelligenceVersion === 12 && cached?.target === target && cached.tag && Date.now() - cached.updated < 86400000 && (!includePreviewGeometry||Array.isArray(cached.previewGeometry)&&Array.isArray(cached.previewOwners)&&Array.isArray(cached.previewControllers))) return cached;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
  async function get(url, limit) {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { 'User-Agent': 'Bedrock-Workbench', Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`Mojang reference download returned HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > limit) throw new Error('Mojang reference download exceeds size limit');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > limit) { controller.abort(); throw new Error('Mojang reference download exceeds size limit'); } chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  try {
    const list = JSON.parse((await get(API, 4 * 1024 * 1024)).toString());
    const release = chooseRelease(list, target, channel);
    if (!release) throw new Error(`No released Mojang samples found at or below engine ${target}`);
    if (!force && channelMatch && cached?.intelligenceVersion === 12 && cached?.tag === release.tag_name && (!includePreviewGeometry||Array.isArray(cached.previewGeometry)&&Array.isArray(cached.previewOwners)&&Array.isArray(cached.previewControllers))) { cached.target = target; cached.updated = Date.now(); await core.writeJson(file, cached); return cached; }
    const asset = release.assets?.find(a => a.name === `bedrock-samples-${release.tag_name}-min.zip`);
    const expected = `https://github.com/Mojang/bedrock-samples/releases/download/${release.tag_name}/${asset?.name}`;
    if (!asset || asset.browser_download_url !== expected) throw new Error('Mojang release is missing its text reference archive');
    const index = buildIndex(await get(expected, 40 * 1024 * 1024), release.tag_name);
    index.target = target; index.updated = Date.now(); index.requestedChannel = channel; index.sourceChannel = release.prerelease ? 'preview' : 'stable';
    await core.writeJson(file, index);
    return index;
  } catch (error) {
    if (!force && channelMatch && cached?.engine && compareVersions(cached.engine, target) <= 0) return cached;
    throw error;
  } finally { clearTimeout(timer); }
}
function closest(name, names) {
  function distance(a, b) { let row = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] !== b[j - 1])); row = next; } return row[b.length]; }
  return names.map(value => ({ value, distance: distance(name, value) })).filter(v => v.distance <= 2).sort((a, b) => a.distance - b.distance).slice(0, 3).map(v => v.value);
}
function componentSchema(index, kind, { omit = [], supplement } = {}) {
  function valueSchema(value, component, root=false, sourceTag=value.sourceTag || index.tag) {
    const description=root?documentation.componentDescription(kind,component,descriptionText(value.description)):descriptionText(value.description);
    const result = { description };
    result.markdownDescription = [description, value.type ? `Type: ${value.type}` : '', `Reference data: Mojang ${sourceTag}${sourceTag !== index.tag ? ' (Stable documentation; confirmed in Preview samples)' : ''}.`, documentation.componentLink(kind, component)].filter(Boolean).join('\n\n');
    // HTML type labels with alternatives or legacy names are intentionally
    // advisory. Only unambiguous primitive types become validation rules.
    const type = { String: 'string', string: 'string', Boolean: 'boolean', boolean: 'boolean', Integer: 'integer', integer: 'integer', number: 'number', object: 'object', array: 'array' }[value.type];
    if (type) result.type = type;
    if (value.fields && Object.keys(value.fields).length) result.properties = Object.fromEntries(Object.entries(value.fields).map(([name, field]) => [name, valueSchema(field, component, false, sourceTag)]));
    return result;
  }
  const components = { type: 'object', additionalProperties: true, properties: Object.fromEntries(Object.entries(index.components[kind]).filter(([name]) => !omit.includes(name)).map(([name, value]) => [name, valueSchema(value,name,true)])) };
  if(supplement){
    const names=(node,seen=new Set())=>{if(!node||typeof node!=='object')return [];if(node.$ref?.startsWith('#/definitions/')){const name=node.$ref.slice(14);if(seen.has(name))return [];seen.add(name);return names(supplement.definitions?.[name],seen);}return [...Object.keys(node.properties||{}),...['anyOf','oneOf','allOf'].flatMap(key=>(node[key]||[]).flatMap(child=>names(child,new Set(seen))))];};
    for(const id of omit){const owned=supplement.definitions?.components?.properties?.[id],known=new Set(names(owned)),fields=Object.entries(index.components[kind][id]?.fields||{}).filter(([field])=>!known.has(field));if(!fields.length)continue;
      components.properties[id]={doNotSuggest:true,properties:Object.fromEntries(fields.map(([field,value])=>{const next=valueSchema(value,id,false,index.components[kind][id]?.sourceTag || index.tag);delete next.type;return [field,next];}))};
    }
  }
  return require('./format-versions.cjs').apply({ $schema: 'http://json-schema.org/draft-07/schema#', title: `Mojang ${index.tag} ${kind} reference`, type: 'object', properties: {
    [`minecraft:${kind}`]: { type: 'object', properties: { components, ...(kind==='entity'?{component_groups: { type: 'object', additionalProperties: components }}:{}), ...(kind==='block'?{permutations: { type: 'array', items: { type: 'object', properties: { components } } }}:{}) } }
  } },kind,index.target);
}
module.exports = { engine, descriptionText, buildIndex, chooseRelease, loadReference, closest, componentSchema };
