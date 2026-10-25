const {test}=require('node:test'),assert=require('node:assert/strict');const coverage=require('../tools/audit-component-hovers.cjs');

test('projectile example has nested hovers, completions and legacy-compatible shapes',()=>{
 const schema=require('../schemas/entity.schema.json'),component=schema.definitions.components.properties['minecraft:projectile'],example=require('./projectile-fixture.cjs');
 const validate=new(require('ajv'))({strict:false}).compile(schema);
 assert.ok(validate({format_version:'1.26.50','minecraft:entity':{components:{'minecraft:projectile':example}}}),JSON.stringify(validate.errors));
 function inspect(value,node){for(const [key,child]of Object.entries(value)){const field=node.properties[key];assert.match(field.markdownDescription,/minecraftcomponent_projectile/,key);if(child&&typeof child==='object'&&!Array.isArray(child)){const branch=field.properties?field:field.anyOf?.find(option=>option.properties);inspect(child,branch);}}}
 inspect(example,component);
 assert.ok(component.properties.anchor.anyOf[0].enum.includes('eye_height'));assert.ok(component.properties.should_bounce.anyOf[0].enum.includes('if_invulnerable'));
 assert.ok(component.properties.on_hit.properties.particle_on_hit.properties.particle_type.anyOf[0].enum.includes('fallingdust'));
 assert.ok(validate({format_version:'1.10.0','minecraft:entity':{components:{'minecraft:projectile':{on_hit:{impact_damage:null}}}}}),JSON.stringify(validate.errors));
 for(const [anchor,should_bounce]of [[1,true],['eye_height','if_no_damage_dealt']])assert.ok(validate({format_version:'1.26.0','minecraft:entity':{components:{'minecraft:projectile':{anchor,should_bounce,on_hit:{impact_damage:{damage:10}}}}}}),JSON.stringify(validate.errors));
});

test('pickup-items parameters include Learn hovers, defaults and version requirements',()=>{
 const schema=require('../schemas/entity.schema.json'),fields=schema.definitions.components.properties['minecraft:behavior.pickup_items'].properties;
 for(const name of ['search_height','pickup_same_items_as_in_hand','can_pickup_any_item','can_pickup_to_hand_or_equipment','priority','goal_radius','max_dist','pickup_based_on_chance','speed_multiplier'])assert.match(fields[name].markdownDescription,/minecraftbehavior_pickup_items/);
 assert.equal(fields.search_height.type,'integer');assert.equal(fields.search_height.default,1);
 assert.equal(fields.pickup_same_items_as_in_hand.type,'boolean');assert.equal(fields.pickup_same_items_as_in_hand.default,false);
 const validate=new(require('ajv'))({strict:false}).compile(require('../src/format-versions.cjs').apply(schema,'entity','1.26.50'));
 const document={format_version:'1.26.0','minecraft:entity':{components:{'minecraft:behavior.pickup_items':{search_height:32,pickup_same_items_as_in_hand:true}}}};
 assert.ok(validate(document),JSON.stringify(validate.errors));
 const versions=require('../src/format-versions.cjs');
 assert.equal(versions.supported('entity','minecraft:behavior.pickup_items','1.26.0','1.26.50','stop_if_holding_item'),false);
 assert.equal(versions.supported('entity','minecraft:behavior.pickup_items','1.26.30','1.26.50','stop_if_holding_item'),true);
});
test('every named parameter in owned component schemas has a hover provider and Learn link',()=>{for(const [kind,report]of Object.entries(coverage.all())){assert.deepEqual(report.missing,[],kind+' missing parameter hovers');assert.ok(report.namedParameters>100);assert.equal(report.schemaHovers+report.filterHovers,report.namedParameters);}});
test('coverage audit does not let a documented union alternative hide an undocumented parameter',()=>{const schema={definitions:{components:{properties:{'minecraft:test':{properties:{missing:{anyOf:[{type:'number'},{type:'object',description:'Object form.',markdownDescription:'Object form. https://learn.microsoft.com/'}]}}}}}}};assert.deepEqual(coverage.audit(schema).missing,['minecraft:test/missing']);});
test('swimming goal parameters and flocking rules validate the reported examples',()=>{
 const schema=require('../schemas/entity.schema.json'),components=schema.definitions.components.properties,validate=new(require('ajv'))({strict:false}).compile(schema);
 const examples={'minecraft:behavior.random_swim':{priority:3,speed_multiplier:1,xz_dist:18,y_dist:5,interval:0},'minecraft:behavior.swim_wander':{priority:4,interval:0.08,look_ahead:3,speed_multiplier:0.018,wander_time:5},'minecraft:behavior.swim_idle':{priority:5,idle_time:5,success_rate:0.1},'minecraft:flocking':Object.fromEntries(Object.entries(components['minecraft:flocking'].properties).map(([key,field])=>[key,field.default]))};
 for(const [id,value]of Object.entries(examples)){assert.ok(validate({format_version:'1.26.50','minecraft:entity':{components:{[id]:value}}}),JSON.stringify(validate.errors));for(const name of Object.keys(value)){const field=components[id].properties[name];assert.ok(field?.description,id+'.'+name);assert.match(field.markdownDescription,/learn.microsoft.com/);}}
 assert.equal(Object.keys(components['minecraft:flocking'].properties).length,18);assert.ok(components['minecraft:flocking'].properties.innner_cohesion_threshold);assert.ok(!components['minecraft:flocking'].properties.inner_cohesion_threshold);
});
