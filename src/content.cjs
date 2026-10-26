const fs = require('node:fs/promises');
const path = require('node:path');
const json = require('jsonc-parser');
const core = require('./core.cjs');
const scripts = require('./script-components.cjs');
const { molangParser, MOLANG_QUERIES, MOLANG_MATH } = require('./vendor/molang.cjs');
class ContentIndex {
  constructor(project) { this.project = project; this.types = new Map(); this.documents = new Map(); this.issues = []; this.scriptSources = new Map(); this.commandSources = new Map(); this.languages=new Map(); this.customComponents = []; this.scriptsDirty = false; }
  add(type, id, file) {
    if (typeof id !== 'string' || !id) return;
    if (!this.types.has(type)) this.types.set(type, new Map());
    const entries = this.types.get(type); if (!entries.has(id)) entries.set(id, []); entries.get(id).push(file);
  }
  values(type) { return this.types.get(type) || new Map(); }
  remove(file) {
    const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    const matches = candidate => normalize(candidate) === normalize(file) || core.inside(file, candidate);
    for (const candidate of this.documents.keys()) if (matches(candidate)) this.documents.delete(candidate);
    for (const candidate of this.commandSources.keys()) if (matches(candidate)) this.commandSources.delete(candidate);
    for(const candidate of this.languages.keys())if(matches(candidate))this.languages.delete(candidate);
    for (const candidate of this.scriptSources.keys()) if (matches(candidate)) { this.scriptSources.delete(candidate); this.scriptsDirty = true; }
    this.issues = this.issues.filter(issue => !matches(issue.file));
    for (const values of this.types.values()) for (const [id, files] of values) {
      const kept = files.filter(candidate => !matches(candidate)); if (kept.length) values.set(id, kept); else values.delete(id);
    }
  }
}
function fileKind(project, file) {
  for (const side of ['behavior', 'resource']) if (core.inside(project.packs[side], file)) return { side, relative: path.relative(project.packs[side], file).replaceAll(path.sep, '/') };
}
async function scan(project) {
  const index = new ContentIndex(project);
  let batch = [];
  for (const side of ['behavior', 'resource']) for await (const relative of core.files(project.packs[side])) {
    batch.push(() => indexFile(index, side, relative).catch(error => { if (error.code !== 'ENOENT') throw error; }));
    if (batch.length === 8) { await Promise.all(batch.map(run => run())); batch = []; }
  }
  await Promise.all(batch.map(run => run())); refreshScripts(index);
  if (project.config?.targetVersion) try {
    const cached = await core.readJson(await core.local(project.root, '.bedrock/reference/components.json'));
    if (cached.engine && require('./releases.cjs').compareVersions(cached.engine, project.config.targetVersion) <= 0) index.reference = cached;
  } catch { /* Reference data is optional when offline or not yet cached. */ }
  try { index.localReference=await require('./vanilla.cjs').local(project);index.reference=require('./vanilla.cjs').merge(index.reference,index.localReference); }
  catch(error) { index.referenceWarning=error.message; }
  return index;
}
function refreshScripts(index) {
  if (!index.scriptsDirty) return;
  index.customComponents = scripts.analyze(index.scriptSources); index.scriptsDirty = false;
  for (const type of ['block_component', 'item_component']) index.types.delete(type);
  for (const value of index.customComponents) index.add(value.kind + '_component', value.id, value.file);
}
async function indexFile(index, side, relative) {
    const project = index.project;
    const file = await core.local(project.root, path.relative(project.root, path.join(project.packs[side], relative)));
    const rel = relative.replaceAll(path.sep, '/');
    if(side==='resource'&&/^(?:subpacks\/[^/]+\/)?texts\/[^/]+\.lang$/.test(rel)&&(await fs.stat(file)).size<=2*1024*1024){const lang=require('./localization.cjs').parse(await fs.readFile(file,'utf8'),file);index.languages.set(file,lang);for(const entry of lang.entries)index.add('language_key',entry.key,file);return;}
    if (side === 'behavior' && scripts.scriptFile(rel) && (await fs.stat(file)).size <= 2 * 1024 * 1024) {
      index.scriptSources.set(file, await fs.readFile(file, 'utf8')); index.scriptsDirty = true;
    }
    if (side === 'behavior' && /^functions\/.*\.mcfunction$/i.test(rel)) {
      index.add('function', rel.slice(10, -11), file);
      if ((await fs.stat(file)).size <= 2 * 1024 * 1024) {
        const source = await fs.readFile(file, 'utf8');
        index.commandSources.set(file,source);
        for (const line of source.split(/\r?\n/)) {
          if (line.trimStart().startsWith('#')) continue;
          const objective = /(?:^|\brun\s+)\s*scoreboard\s+objectives\s+add\s+([\w.-]+)/.exec(line);
          if (objective) index.add('objective', objective[1], file);
          const tag = /\btag\s+@\w(?:\[[^\]]*\])?\s+add\s+([\w.-]+)/.exec(line);
          if (tag) index.add('tag', tag[1], file);
        }
      }
    }
    if (side === 'resource' && /^textures\/.*\.(png|tga|jpe?g)$/i.test(rel)) index.add('texture', rel.replace(/\.[^.]+$/, ''), file);
    if (side === 'behavior' && /^loot_tables\/.*\.json$/i.test(rel)) index.add('loot_table', rel, file);
    if (!(rel.endsWith('.json')||side==='resource'&&/^materials\/.*\.material$/i.test(rel)) || (await fs.stat(file)).size > 2 * 1024 * 1024) return;
    const text = await fs.readFile(file, 'utf8'), errors = [], tree = json.parseTree(text.replace(/^\uFEFF/, ' '), errors, { allowTrailingComma: true });
    if (errors.length) { index.issues.push({ code:'bedrock.jsonSyntax',file, offset: errors[0].offset, length: errors[0].length, severity: 'error', message: `JSON: ${json.printParseErrorCode(errors[0].error)}` }); return; }
    const data = json.getNodeValue(tree); index.documents.set(file, { file, side, relative: rel, text, tree, data });
    if(side==='resource'&&rel.startsWith('materials/'))for(const [name,value]of Object.entries(data?.materials||{}))if(name!=='version'&&value&&typeof value==='object')index.add('material',name.split(':')[0],file);
    for (const [root, type] of [['minecraft:entity', 'entity'], ['minecraft:item', 'item'], ['minecraft:block', 'block'], ['minecraft:client_entity', 'client_entity'], ['minecraft:attachable', 'attachable']]) {
      if ((side === 'behavior') === ['entity', 'item', 'block'].includes(type)) index.add(type, data?.[root]?.description?.identifier, file);
    }
    if(side==='behavior')for(const name of require('./creative-groups.cjs').definitions(data))index.add('creative_group',name,file);
    const itemTags=data?.['minecraft:item']?.components?.['minecraft:tags']?.tags;
    if(side==='behavior'&&Array.isArray(itemTags))for(const tag of itemTags)index.add('item_tag',tag,file);
    if (side === 'resource') {
      index.add('particle', data?.particle_effect?.description?.identifier, file);
      for (const id of Object.keys(data?.sound_definitions || {})) index.add('sound', id, file);
      for (const geometry of Array.isArray(data?.['minecraft:geometry']) ? data['minecraft:geometry'] : []) index.add('geometry', geometry?.description?.identifier, file);
      for (const id of Object.keys(data || {})) if (id.startsWith('geometry.')) index.add('geometry', id, file);
      if (/^(?:subpacks\/[^/]+\/)?textures\/(?:terrain_texture|item_texture)\.json$/.test(rel)) for (const id of Object.keys(data?.texture_data || {})) index.add(rel.endsWith('terrain_texture.json') ? 'terrain_texture' : 'item_texture', id, file);
    }
    for (const id of Object.keys(data?.animations || {})) index.add('animation', id, file);
    for (const id of Object.keys(data?.animation_controllers || {})) index.add('animation_controller', id, file);
    for (const id of Object.keys(data?.render_controllers || {})) index.add('render_controller', id, file);
}
async function update(index, file) {
  const kind = fileKind(index.project, file); if (!kind) return false;
  await core.local(index.project.root, path.relative(index.project.root, file));
  const stat = await fs.stat(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  index.remove(file);
  if (!stat) { refreshScripts(index); return true; }
  if (stat.isDirectory()) return false;
  await indexFile(index, kind.side, kind.relative); refreshScripts(index); return true;
}
function referenceKind(keys, value, document) {
  const key = keys.at(-1), parent = keys.at(-2), root = keys[0];
  if(document.side==='behavior'&&['minecraft:item','minecraft:block'].includes(root)&&keys.length===4&&keys[1]==='description'&&keys[2]==='menu_category'&&key==='group')return 'creative_group';
  if(document.side==='behavior'&&root==='minecraft:crafting_items_catalog'&&keys[1]==='categories'&&typeof keys[2]==='number'&&keys[3]==='groups'&&typeof keys[4]==='number') {
    if(keys.length===7&&keys[5]==='group_identifier') {if(key==='name')return 'creative_group';if(key==='icon')return 'item';}
    if(keys.length===7&&keys[5]==='items'&&typeof key==='number')return 'item';
  }
  if(document.relative?.startsWith('loot_tables/') && key==='name') {
    const type=json.findNodeAtLocation(document.tree,[...keys.slice(0,-1),'type'])?.value;
    if(type==='item'||type==='minecraft:item')return 'item';
    if(type==='loot_table'||type==='minecraft:loot_table')return 'loot_table';
  }
  if (document.side === 'resource' && ['minecraft:client_entity', 'minecraft:attachable'].includes(root) && keys[1] === 'description') {
    if(root==='minecraft:client_entity'&&keys.length===3&&key==='identifier')return 'entity';
    if(keys.length===3&&['geometry','textures','materials','animations','sound_effects','particle_effects','particle_emitters'].includes(key))return {geometry:'geometry',textures:'texture',materials:'material',animations:value?.startsWith('controller.animation.')?'animation_controller':'animation',sound_effects:'sound',particle_effects:'particle',particle_emitters:'animation'}[key];
    if(keys[2]==='materials'&&keys.length===4)return 'material';
    if(keys[2]==='sound_effects'&&keys.length===4)return 'sound';
    if(keys[2]==='particle_effects'&&keys.length===4)return 'particle';
    if(keys[2]==='particle_emitters'&&keys.length===4)return 'animation';
    if(keys[2]==='spawn_egg'&&keys.length===4&&key==='texture')return 'item_texture';
    if(keys[2]==='animation_controllers'&&keys.length===5&&typeof keys[3]==='number')return 'animation_controller';
    if(keys[2]==='render_controllers'&&keys.length===3&&(!value||value.startsWith('controller.render.')))return 'render_controller';
    if (keys[2] === 'textures' && keys.length === 4) return 'texture';
    if (keys[2] === 'geometry' && keys.length === 4) return 'geometry';
    if (keys[2] === 'animations' && keys.length === 4) return value?.startsWith('controller.animation.') ? 'animation_controller' : 'animation';
    if (keys[2] === 'render_controllers' && (keys.length === 4||keys.length===5&&typeof keys[3]==='number'&&key===value&&(!value||value.startsWith('controller.render.')))) return 'render_controller';
  }
  if(root==='minecraft:entity'&&keys[1]==='description'&&keys[2]==='animations'&&keys.length===4)return value?.startsWith('controller.animation.')?'animation_controller':'animation';
  const depth = root==='minecraft:entity'&&keys[1]==='component_groups'?3:keys[1] === 'components' ? 2 : keys[1] === 'permutations' && typeof keys[2] === 'number' && keys[3] === 'components' ? 4 : 0;
  const component = depth ? keys[depth] : undefined, tail = keys.slice(depth + 1);
  if (root === 'minecraft:block' && depth) {
    if (component === 'minecraft:geometry' && (!tail.length || (tail.length === 1 && key === 'identifier'))) return 'geometry';
    if (component === 'minecraft:material_instances' && tail.length === 2 && key === 'texture') return 'terrain_texture';
    if (component === 'minecraft:destruction_particles' && tail.length === 1 && key === 'texture') return 'terrain_texture';
    if (component === 'minecraft:loot' && !tail.length) return 'loot_table';
    if (component === 'minecraft:placement_filter' && tail[0] === 'conditions' && typeof tail[1] === 'number' && tail[2] === 'block_filter' && typeof tail[3] === 'number' && (tail.length === 4 || (tail.length === 5 && key === 'name'))) return 'block';
    if (component === 'minecraft:destructible_by_mining' && tail[0] === 'item_specific_speeds' && typeof tail[1] === 'number' && tail[2] === 'item' && (tail.length === 3 || (tail.length === 4 && key === 'name'))) return 'item';
    if (['minecraft:item_visual','minecraft:embedded_visual'].includes(component)) {
      if (tail[0] === 'geometry' && (tail.length === 1 || (tail.length === 2 && key === 'identifier'))) return 'geometry';
      if (tail[0] === 'material_instances' && tail.length === 3 && key === 'texture') return 'terrain_texture';
    }
  }
  if(root==='minecraft:entity'&&depth){
    if(component==='minecraft:breathable'&&['breathe_blocks','non_breathe_blocks'].includes(tail[0])&&tail.length===2&&typeof key==='number')return 'block';
    if(component==='minecraft:behavior.move_to_block'&&tail[0]==='target_blocks'&&(tail.length===1||tail.length===2&&typeof key==='number'))return 'block';
    if(['minecraft:loot','minecraft:equipment'].includes(component)&&key==='table')return 'loot_table';
    if(component==='minecraft:breedable'&&['baby_type','mate_type'].includes(key))return 'entity';
    if(component==='minecraft:spawn_entity'&&key==='spawn_entity')return 'entity';
    if(component==='minecraft:transformation'&&key==='into')return 'entity';
    if(['minecraft:breedable','minecraft:tameable','minecraft:ageable','minecraft:behavior.tempt'].includes(component)&&['breed_items','tame_items','feed_items','items','pause_growth_items','reset_growth_items','drop_items'].includes(tail[0])&&(typeof key==='number'||['item','name','result_item','transform_to_item'].includes(key)||tail.length===1))return 'item';
    if(component==='minecraft:interact'&&key==='table'&&(tail.includes('spawn_items')||tail.includes('add_items')))return 'loot_table';
    if(component==='minecraft:interact'&&key==='transform_to_item')return 'item';
    if(component==='minecraft:interact'&&tail.includes('spawn_entities')&&(typeof key==='number'||key==='spawn_entities'))return 'entity';
  }
  if (root === 'minecraft:item' && depth) {
    if(component === 'minecraft:icon' && (!tail.length || (tail.length === 1 && key === 'texture') || (tail.length === 2 && tail[0] === 'textures'))) return 'item_texture';
    const descriptor=(path)=>tail.length===path.length&&path.every((part,index)=>part==='*'?typeof tail[index]==='number':part===tail[index]);
    const blockSelector=prefix=>descriptor(prefix)||descriptor([...prefix,'name']);
    if(component==='minecraft:tags'&&descriptor(['tags','*']))return 'item_tag';
    if(component==='minecraft:block_placer' && (blockSelector(['block'])||blockSelector(['use_on','*'])))return 'block';
    if(component==='minecraft:entity_placer') {
      if(descriptor(['entity']))return 'entity';
      if(blockSelector(['use_on','*'])||blockSelector(['dispense_on','*']))return 'block';
    }
    if(component==='minecraft:digger' && blockSelector(['destroy_speeds','*','block']))return 'block';
    if(component==='minecraft:seed' && (descriptor(['crop_result'])||descriptor(['plant_at'])||descriptor(['plant_at','*'])))return 'block';
    if(component==='minecraft:food' && (descriptor(['using_converts_to'])||descriptor(['using_converts_to','*'])))return 'item';
    if(component==='minecraft:repairable' && (descriptor(['repair_items','*'])||descriptor(['repair_items','*','items'])||descriptor(['repair_items','*','items','name'])||descriptor(['repair_items','*','items','*'])||descriptor(['repair_items','*','items','*','name'])))return 'item';
    if(component==='minecraft:shooter' && (descriptor(['ammunition','*','item'])||descriptor(['ammunition','*','item','*'])))return 'item';
    if(component==='minecraft:storage_item' && (descriptor(['allowed_items'])||descriptor(['allowed_items','*'])||descriptor(['banned_items'])||descriptor(['banned_items','*'])))return 'item';
    if(component==='minecraft:projectile' && descriptor(['projectile_entity']))return 'entity';
    if(component==='minecraft:use_modifiers' && descriptor(['start_sound']))return 'sound';
    if(component==='minecraft:swing_sounds' && tail.length===1&&['attack_critical_hit','attack_hit','attack_miss'].includes(key))return 'sound';
    if(component==='minecraft:durability_sensor' && (descriptor(['sound_event'])||descriptor(['durability_thresholds','*','sound_event'])))return 'sound';
  }
  if (document.side === 'resource') {
    if (document.relative === 'blocks.json' && ((keys.length === 2 && key === 'textures') || (keys.length === 3 && parent === 'textures'))) return 'terrain_texture';
    if (document.relative === 'textures/flipbook_textures.json' && keys.length === 2) {
      if (key === 'atlas_tile') return 'terrain_texture'; if (key === 'flipbook_texture') return 'texture';
    }
    if (root === 'particle_effect' && keys.join('/') === 'particle_effect/description/basic_render_parameters/texture') return 'texture';
    if (['textures/item_texture.json', 'textures/terrain_texture.json'].includes(document.relative) && keys[0] === 'texture_data' && keys[2] === 'textures' && (keys.length === 3 || (keys.length === 4 && (typeof key === 'number' || key === 'path')) || (keys.length === 5 && typeof keys[3] === 'number' && key === 'path'))) return 'texture';
  }
  if (String(root).startsWith('minecraft:recipe_') && ['item', 'result', 'input', 'output', 'reagent', 'base', 'addition', 'template'].includes(key)) return 'item';
  if (root === 'minecraft:entity' && ['entity_type', 'spawn_entity', 'into'].includes(key)) return 'entity';
  if (root === 'minecraft:entity' && keys.includes('minecraft:loot') && key === 'table') return 'loot_table';
}
function builtinGeometries(document, project) {
  const data = document.data || (document.tree && json.getNodeValue(document.tree));
  if (!data?.['minecraft:block']) return [];
  const values = ['minecraft:geometry.full_block', 'minecraft:geometry.cross'];
  const version = value => { const parts = typeof value === 'string' && /^\d+\.\d+(?:\.\d+)?$/.test(value) ? value.split('.').map(Number) : []; return parts.length ? [...parts, 0].slice(0, 3) : [0, 0, 0]; };
  const compare = require('./releases.cjs').compareVersions;
  if (compare(version(data.format_version), [1, 26, 0]) >= 0 && compare(version(project.config?.targetVersion), [1, 26, 0]) >= 0) values.push('minecraft:geometry.full_block_v1');
  return values;
}
function referenceValues(index, kind, document, reference = index.reference) {
  const values = new Map(index.values(kind));
  if(['animation','animation_controller'].includes(kind))for(const [id,files]of values){const same=files.filter(file=>{const side=index.documents?.get(file)?.side||(index.project?.packs&&fileKind(index.project,file)?.side);return !side||side===document.side;});if(files.length&&!same.length)values.delete(id);else values.set(id,same);}
  if(kind==='creative_group') {
    const format=(document.data || (document.tree&&json.getNodeValue(document.tree)))?.format_version;
    const legacy=typeof format==='string'&&require('./releases.cjs').compareVersions(format,'1.21.60')<0;
    for(const name of require('./creative-groups.cjs').vanilla)values.set(legacy?name.slice(10):name,[]);
  }
  if (kind === 'item') for (const entry of index.values('block')) if (!values.has(entry[0])) values.set(...entry);
  if (kind === 'animation') for (const entry of referenceValues(index,'animation_controller',document,reference)) if (!values.has(entry[0])) values.set(...entry);
  const vanilla = reference?.vanillaBySide?.[document.side]?.[kind]||reference?.vanilla?.[kind];
  for (const id of Array.isArray(vanilla) ? vanilla : []) if (typeof id === 'string' && !values.has(id)) values.set(id, []);
  if(document.side==='resource'&&['geometry','texture','material','animation','animation_controller','render_controller','particle','sound','item_texture','terrain_texture'].includes(kind))for(const id of reference?.vanillaReferences?.[kind]||[])if(!values.has(id))values.set(id,[]);
  if (kind === 'geometry') for (const id of builtinGeometries(document, index.project)) if (!values.has(id)) values.set(id, []);
  return values;
}
function referenceDefinitions(index, kind, id, context) {
  if(kind==='texture')id=id.replace(/\.(png|tga|jpe?g)$/i,'');
  return (index.values(kind).get(id) || []).filter(file=>!context||!['animation','animation_controller'].includes(kind)||index.documents.get(file)?.side===context.side).map(file => {
    const document = index.documents.get(file); let node;
    const actor={entity:'minecraft:entity',client_entity:'minecraft:client_entity',item:'minecraft:item',block:'minecraft:block',attachable:'minecraft:attachable'}[kind];if(document&&actor)node=json.findNodeAtLocation(document.tree,[actor,'description','identifier']);
    if(document&&['animation','animation_controller','render_controller','sound'].includes(kind))node=json.findNodeAtLocation(document.tree,[{animation:'animations',animation_controller:'animation_controllers',render_controller:'render_controllers',sound:'sound_definitions'}[kind],id])?.parent?.children[0];
    if(document&&kind==='particle')node=json.findNodeAtLocation(document.tree,['particle_effect','description','identifier']);
    if(document&&kind==='material')node=json.findNodeAtLocation(document.tree,['materials'])?.children?.find(property=>property.children[0].value.split(':')[0]===id)?.children[0];
    if (document && ['terrain_texture', 'item_texture'].includes(kind)) node = json.findNodeAtLocation(document.tree, ['texture_data', id])?.parent?.children[0];
    if (document && kind === 'geometry') {
      const geometries = json.findNodeAtLocation(document.tree, ['minecraft:geometry']);
      node = geometries?.children?.map(g => json.findNodeAtLocation(g, ['description', 'identifier'])).find(n => n?.value === id) || json.findNodeAtLocation(document.tree, [id])?.parent?.children[0];
    }
      if(document&&kind==='creative_group') {
        const visit=n=>{if(n.type==='string'&&n.value===id&&json.getNodePath(n).at(-1)==='name')node=n;for(const child of n.children||[])visit(child);};visit(document.tree);
      }
      if(document&&kind==='item_tag')node=json.findNodeAtLocation(document.tree,['minecraft:item','components','minecraft:tags','tags'])?.children?.find(child=>child.value===id);
    const before = document?.text.slice(0, node?.offset || 0) || '', lines = before.split('\n');
    return { file, line: lines.length - 1, column: lines.at(-1).length };
  });
}
function componentContext(document, offset) {
  if (document.side !== 'behavior') return;
  const location = json.getLocation(document.text, offset), keys = location.path;
  const kind = keys[0] === 'minecraft:block' ? 'block' : keys[0] === 'minecraft:item' ? 'item' : undefined;
  if (!kind) return;
  const depth = keys[1] === 'components' ? 2 : keys[1] === 'permutations' && typeof keys[2] === 'number' && keys[3] === 'components' ? 4 : 0;
  if (!depth) return;
  const node = json.findNodeAtOffset(document.tree, offset, true);
  if (keys.length === depth + 1 && location.isAtPropertyKey) return { kind, mode: 'key', id: keys.at(-1), node, location };
  if (keys.length === depth + 2 && keys[depth] === 'minecraft:custom_components' && !location.isAtPropertyKey) return { kind, mode: 'legacy', id: node?.type === 'string' ? node.value : '', node, location };
}
function customComponentIssues(index, document) {
  const issues = [];
  function check(node) {
    if (node.type === 'string') {
      const state = componentContext(document, node.offset + 1);
      if (state?.id && !state.id.startsWith('minecraft:') && !index.values(state.kind + '_component').has(state.id) && index.values((state.kind === 'block' ? 'item' : 'block') + '_component').has(state.id)) issues.push({ file: document.file, offset: node.offset + 1, length: Math.max(1, node.length - 2), severity: 'information', message: `'${state.id}' is registered for ${state.kind === 'block' ? 'items' : 'blocks'}, but is used in a ${state.kind} definition. A separate registration may be provided elsewhere.` });
    }
  }
  for (const root of ['minecraft:block', 'minecraft:item']) {
    const body = json.findNodeAtLocation(document.tree, [root]); if (!body) continue;
    const containers = [json.findNodeAtLocation(body, ['components']), ...(json.findNodeAtLocation(body, ['permutations'])?.children || []).map(node => json.findNodeAtLocation(node, ['components']))];
    for (const container of containers) for (const property of container?.children || []) {
      check(property.children[0]);
      if (property.children[0].value === 'minecraft:custom_components') for (const child of property.children[1]?.children || []) check(child);
    }
  }
  return issues;
}
function references(document) {
  const result = [];
  function walk(node) {
    if (node.type === 'string' && (!(node.parent?.type === 'property' && node.parent.children[0] === node)||document.side==='resource'&&json.getNodePath(node)[2]==='render_controllers')) {
      const keys = json.getNodePath(node), type = referenceKind(keys, node.value, document);
      if (type) result.push({ type, value: node.value, node, keys });
    }
    for (const child of node.children || []) walk(child);
  }
  if (document.tree) walk(document.tree); return result;
}
function referenceIssues(index, document, {includeIgnored=false}={}) {
  const issues=references(document).filter(ref => {
    if(!ref.value||/[?()[\]{}]/.test(ref.value))return false;
    if(['item_tag','creative_group'].includes(ref.type))return false; // Tags declare names; new custom tags are valid.
    const values=referenceValues(index,ref.type,document), accepted=new Set(index.reference?.vanillaReferences?.[ref.type]||[]);
    const id=ref.type==='entity'?ref.value.replace(/<[^<>]*>$/,''):ref.type==='item'?ref.value.replace(/:\d+$/,''):ref.type==='texture'?ref.value.replace(/\.(png|tga|jpe?g)$/i,''):ref.value;
    const candidates=[id];if(['item','block','entity'].includes(ref.type)&&!id.includes(':'))candidates.push('minecraft:'+id);
    if(candidates.some(id=>values.has(id)||accepted.has(id)))return false;
    if(ref.value.startsWith('minecraft:')&&!index.reference?.vanilla?.[ref.type]?.length)return false;
    return true;
  }).map(ref => ({ code:'bedrock.missingReference',reference:{type:ref.type,value:ref.value},file: document.file, offset: ref.node.offset + 1, length: Math.max(1, ref.node.length - 2), severity: 'information', message: `${ref.type.replaceAll('_', ' ')} '${ref.value}' was not found in this project${index.reference?.vanilla?.[ref.type]?.length?' or the indexed vanilla references':''}. It may be supplied by Minecraft or another pack.` }));
  return includeIgnored?issues:issues.filter(issue=>!require('./validation-ignores.cjs').match(index.project,issue));
}
function molangNodes(document) {
  if (!/^(?:animations|animation_controllers|render_controllers|particles|entity|attachables)\//.test(document.relative)) return [];
  const result = [];
  function walk(node) {
    if (node.type === 'string' && node.value.length <= 16384 && !(node.parent?.type === 'property' && node.parent.children[0] === node) && /\b(?:query|q|variable|v|temp|t|context|c|math)\.|^\s*(?:return|loop|for_each)\b/i.test(node.value)) result.push(node);
    for (const child of node.children || []) walk(child);
  }
  if (document.tree) walk(document.tree); return result;
}
function rawOffsets(text, node) {
  const offsets = []; const raw = text.slice(node.offset + 1, node.offset + node.length - 1); let i = 0;
  while (i < raw.length) { offsets.push(node.offset + 1 + i); i += raw[i] === '\\' ? raw[i + 1] === 'u' ? 6 : 2 : 1; }
  offsets.push(node.offset + node.length - 1); return offsets;
}
function molangIssues(document) {
  return molangNodes(document).flatMap(node => {
    const offsets = rawOffsets(document.text, node);
    return molangParser.parse(node.value).errors.map(error => ({ file: document.file, offset: offsets[error.start] || node.offset + 1, length: Math.max(1, (offsets[error.end] || offsets[error.start] || node.offset + 1) - (offsets[error.start] || node.offset + 1)), severity: 'warning', message: `Molang: ${error.message}` }));
  });
}
module.exports = { ContentIndex, scan, update, fileKind, referenceKind, referenceValues, referenceDefinitions, builtinGeometries, references, referenceIssues, componentContext, customComponentIssues, molangNodes, molangIssues, rawOffsets, MOLANG_QUERIES, MOLANG_MATH, molangParser };
