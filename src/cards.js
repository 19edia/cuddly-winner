import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {fileURLToPath} from 'node:url';
import {ALLIANCE_CARD_NOTICE,bothDivisions} from './identity.js';
let fontsReady=false;
function loadFonts(){if(fontsReady)return;for(const [file,name]of [['DejaVuSans.ttf','IFJRegular'],['DejaVuSans-Bold.ttf','IFJBold']])if(!GlobalFonts.registerFromPath(fileURLToPath(new URL(`../assets/fonts/${file}`,import.meta.url)),name))throw new Error('Fonte da carteira não encontrada.');fontsReady=true;}
// All strings are drawn as text. No HTML, remote images or external fonts are loaded.
function splitLines(ctx,value,maxWidth){const lines=[];let line='';for(const char of String(value).replace(/\s+/g,' ').trim()){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line.trimEnd());line=char.trimStart();}else line+=char;}if(line)lines.push(line);return lines;}
function fitText(ctx,value,x,y,width,height,{size=34,min=16,bold=false,color='#edf8f0'}={}){let lines=[];for(;size>=min;size--){ctx.font=`${size}px ${bold?'IFJBold':'IFJRegular'}`;lines=splitLines(ctx,value,width);if(lines.length*size*1.3<=height)break;}if(size<min)throw new Error('Texto excede o espaço da carteira.');ctx.fillStyle=color;lines.forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.3));}
export function cardFields(member,divisionName){return [{label:'NOME',value:member.name},{label:member.account_kind==='aliado'?'GANGUE ALIADA':'PATENTE',value:member.account_kind==='aliado'?member.allied_gang:member.member_rank},{label:'DIVISÃO AUTORIZADA',value:bothDivisions(member)?'1ª e 2ª divisões':divisionName},{label:'NOME NO JOGO',value:member.game_nick},{label:'USUÁRIO ROBLOX',value:member.roblox_username},{label:'DISCORD ID',value:member.discord_id},{label:'IFJ',value:member.ifj}];}
export async function renderCard(member,divisionName,{issuedAt=new Date()}={}){
 loadFonts();const canvas=createCanvas(1600,1100),c=canvas.getContext('2d');const ally=member.account_kind==='aliado';
 c.fillStyle='#081311';c.fillRect(0,0,1600,1100);c.fillStyle='#a6f06b';c.fillRect(0,0,1600,12);c.strokeStyle='#304536';c.lineWidth=2;c.strokeRect(32,32,1536,1036);
 c.font='bold 42px IFJBold';c.fillStyle='#bdf485';c.fillText('ROKUHARA',70,97);c.font='20px IFJRegular';c.fillStyle='#a8bbaa';c.fillText('IDENTIFICAÇÃO DE ROLEPLAY • '+(ally?'ALIANÇA':'MEMBRO'),70,135);
 c.font='20px IFJRegular';c.textAlign='right';c.fillText(`REGISTRO ${member.id} / V${member.identity_version??1}`,1530,85);c.textAlign='left';
 const fields=cardFields(member,divisionName);
 function field(label,value,x,y,w,h=80,size=34){c.font='19px IFJRegular';c.fillStyle='#9cb19f';c.fillText(label,x,y);fitText(c,value,x,y+43,w,h,{size,bold:true});}
 field('NOME',member.name,70,196,1440,100,48);
 let y=370;
 if(ally){c.fillStyle='#153021';c.fillRect(60,330,1480,112);fitText(c,ALLIANCE_CARD_NOTICE,82,369,1430,84,{size:30,min:22,bold:true,color:'#bdf485'});y=490;}
 field(fields[1].label,fields[1].value,70,y,890,86,36);field(bothDivisions(member)?'DIVISÕES AUTORIZADAS':'DIVISÃO AUTORIZADA',bothDivisions(member)?'1ª e 2ª divisões':divisionName,1030,y,500,86,32);
 y+=ally?138:160;
 field('NOME NO JOGO',member.game_nick,70,y,880,82,32);field('USUÁRIO ROBLOX',member.roblox_username,1030,y,500,82,30);
 y+=135;
 field('DISCORD ID',member.discord_id,70,y,630,55,30);
 const status=member.suspect?'SUSPEITO • EM ANÁLISE':member.verified?'VERIFICADO':'AGUARDANDO VERIFICAÇÃO';
 field('SITUAÇÃO NA EMISSÃO',status,800,y,730,55,25);
 if(ally)fitText(c,`PATENTE: ${member.member_rank}`,70,866,1440,28,{size:20,min:16});
 c.font='18px IFJRegular';c.fillStyle='#91a894';const date=issuedAt.toLocaleString('pt-BR',{timeZone:'UTC'});c.fillText(`Emitida em ${date} UTC • Cadastro: ${new Date(member.created_at).toLocaleDateString('pt-BR',{timeZone:'UTC'})}`,70,902);
 c.fillText('Uso no jogo. A imagem não substitui a verificação atual do cadastro pelo bot.',70,932);
 c.strokeStyle='#42663a';c.beginPath();c.moveTo(70,954);c.lineTo(1530,954);c.stroke();
 c.font='20px IFJBold';c.fillStyle='#a6f06b';c.fillText('IFJ',70,998);c.font='52px IFJBold';c.fillStyle='#efffe4';c.fillText(member.ifj,70,1053);
 return canvas.encode('png');
}
