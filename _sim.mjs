import { ChannelType } from 'discord.js';
process.env.DATA_DIR = process.argv[2];
const { eventos } = await import('./src/config.js'); eventos.registroId='reg';
const cmd = (await import('./src/commands/mensajewhitelist.js')).default;
const mw = await import('./src/features/mensajeWhitelist.js');
cmd.data.toJSON(); console.log('opciones:', cmd.data.toJSON().options.map(o=>o.name).join(', '));
const EV='900000000000000001';
const ins=(nt,uid,acept,ev=EV)=>({embeds:[{footer:{text:(acept?'Aceptado':'Pendiente de revisión')+' · evento:'+ev},fields:[{name:'👤 Usuario de Discord',value:'<@'+uid+'>\n`u` · `'+uid+'`'},{name:'⛏️ Usuario Minecraft',value:'`'+nt+'`'}]}]});
const msgs=[ins('Steve','111111111111111111',true),ins('Alex','222222222222222222',true),ins('Pend','333333333333333333',false),ins('Otro','444444444444444444',true,'900000000000000009')];
const reg={id:'reg',type:ChannelType.GuildForum,threads:{fetchActive:async()=>({threads:new Map(msgs.map((m,k)=>[k,{parentId:'reg',createdTimestamp:Date.now(),fetchStarterMessage:async()=>m}]))}),fetchArchived:async()=>({threads:new Map()})}};
const guild={ownerId:'own',channels:{fetch:async()=>reg},scheduledEvents:{fetch:async()=>({name:'Skywars'})}};
const client={users:{fetch:async(id)=>({send:async(p)=>{ if(id.startsWith('2')) throw new Error('cerrado'); console.log(`   📩 MD a ${id}:\n${p.content.split('\n').map(l=>'      '+l).join('\n')}\n      [adjuntos: ${p.files.map(f=>f.name).join(', ')}]`);}})}};
const base={guild,client,user:{id:'own'},member:{id:'own',guild,roles:{cache:new Map()}}};
let modalId;
await cmd.execute({...base,id:'int1',options:{getString:(n)=>n==='evento'?EV:'aceptados',getAttachment:(n)=>n==='archivo1'?{name:'mapa.png',url:'https://cdn/x.png',size:1000}:null},
  showModal:async(m)=>{modalId=m.toJSON().custom_id; console.log('modal:',modalId);}, reply:async(r)=>console.log(r)});
let botones;
await mw.modalMensajeWhitelist({...base,customId:modalId,fields:{getTextInputValue:()=>'¡Hola!\nMañana a las **18:00** empieza el evento.\nTraed los mods instalados.'},
  deferReply:async()=>{}, editReply:async(r)=>console.log(typeof r==='string'?r:r.content), reply:async(r)=>console.log(r.content),
  followUp:async(r)=>{ if(r.components){botones=r.components[0].toJSON().components; console.log('  ',r.content,botones.map(b=>b.label).join(' | '));} else console.log(r.content.split('\n').map(l=>'   │ '+l).join('\n'), '\n   │ [adjuntos:',r.files.map(f=>f.name).join(','),']'); }});

await mw.botonMensajeWhitelist({...base,customId:botones[0].custom_id,update:async(r)=>console.log(r.content),editReply:async(r)=>{const e=r.embeds[0].toJSON(); console.log(e.title, e.fields.map(f=>f.name+'='+f.value).join(' ; '));}});
