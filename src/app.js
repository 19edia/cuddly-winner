import {memberData,identityChanged,bothDivisions} from './identity.js';

import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {token,hash,passwordHash,passwordMatches,allowed,text,division,snowflake,generateIFJ,digestIFJ} from './security.js';
import {tx,audit,enqueue} from './db.js';
const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createApp(pool,config,bot){
 const app=express();app.disable('x-powered-by');if(config.production)app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{'script-src':["'self'"],'style-src':["'self'"],'img-src':["'self'",'data:'],'connect-src':["'self'"],'form-action':["'self'"],'upgrade-insecure-requests':config.production?[]:null}}}));
 app.use(express.json({limit:'24kb'}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas solicitações. Aguarde um minuto.'}}));
 app.use('/api',async(req,res,next)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==config.origin)return res.status(403).json({error:'Origem não autorizada.'});
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ifj_session='))?.slice(12);
  if(cookie && /^[a-f0-9]{64}$/.test(cookie)){
   const result=await pool.query('SELECT s.*,u.username,u.role,u.active FROM sessions s JOIN staff u ON u.id=s.staff_id WHERE token_hash=$1 AND expires_at>now()',[hash(cookie,config.secret)]);
   if(result.rows[0]?.active)req.auth=result.rows[0];
  }
  next();
 });
 const auth=(req,res,next)=>req.auth?next():res.status(401).json({error:'Entre na sua conta.'});
 const permit=operation=>(req,res,next)=>allowed(req.auth.role,operation)?next():res.status(403).json({error:'Sua patente não permite esta ação.'});
 const csrf=(req,res,next)=>req.get('x-csrf-token')===req.auth.csrf?next():res.status(403).json({error:'Sessão inválida. Recarregue a página.'});
 const cookieOptions={httpOnly:true,secure:config.production,sameSite:'strict',path:'/',maxAge:8*3600000};
 let dummyHash;
 app.post('/api/auth/login',rateLimit({windowMs:15*60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas tentativas. Aguarde 15 minutos.'}}),async(req,res)=>{
  const username=text(req.body.username,'Usuário',64,3).toLowerCase();const password=text(req.body.password,'Senha',128);
  const user=(await pool.query('SELECT * FROM staff WHERE username=$1',[username])).rows[0];
  dummyHash ||= await passwordHash(token());
  const valid=await passwordMatches(password,user?.password_hash||dummyHash);
  if(!user?.active||!valid)throw fail('Usuário ou senha inválidos.',401);
  const value=token();await pool.query('INSERT INTO sessions(token_hash,staff_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hash(value,config.secret),user.id,token(),new Date(Date.now()+8*3600000)]);
  res.cookie('ifj_session',value,cookieOptions).json({authenticated:true});
 });
 app.get('/api/me',auth,(req,res)=>res.json({id:req.auth.staff_id,username:req.auth.username,role:req.auth.role,csrf:req.auth.csrf,divisions:config.divisions.map(d=>({id:d.id,name:d.name}))}));
 app.use('/api',auth);
 app.use('/api',(req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():csrf(req,res,next));
 app.post('/api/auth/logout',async(req,res)=>{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.auth.token_hash]);res.clearCookie('ifj_session',{path:'/'}).json({ok:true});});
 app.post('/api/auth/password',async(req,res)=>{
  const current=text(req.body.current,'Senha atual',128);const next=text(req.body.password,'Nova senha',128,12);
  const user=(await pool.query('SELECT password_hash FROM staff WHERE id=$1',[req.auth.staff_id])).rows[0];
  if(!await passwordMatches(current,user.password_hash))throw fail('Senha atual incorreta.',403);
  await tx(pool,async c=>{await c.query('UPDATE staff SET password_hash=$1 WHERE id=$2',[await passwordHash(next),req.auth.staff_id]);await c.query('DELETE FROM sessions WHERE staff_id=$1',[req.auth.staff_id]);});
  res.clearCookie('ifj_session',{path:'/'}).json({ok:true});
 });
 app.get('/api/members',permit('createIFJ'),async(req,res)=>{
  const values=[];let where='';
  if(req.auth.role==='recrutador'){values.push(req.auth.staff_id);where=' WHERE created_by=$1';}
  res.json((await pool.query('SELECT * FROM members'+where+' ORDER BY created_at DESC LIMIT 1000',values)).rows.map(m=>({...m,access_both:bothDivisions(m)})));
 });
 app.post('/api/members',permit('createIFJ'),async(req,res)=>{
  if(req.auth.role==='recrutador'&&req.body.member_rank!==undefined)throw fail('Somente administradores e moderadores configuram a patente do membro.',403);
  const b=memberData(req.body);const values=[b.name,b.game_nick,b.roblox_username,b.discord_id,b.division,req.auth.staff_id,b.account_kind,b.allied_gang,b.member_rank];
  const member=await tx(pool,async c=>{
   let code;
   for(let tries=0;tries<10;tries++){code=generateIFJ();const inserted=await c.query('INSERT INTO used_ifjs(digest) VALUES($1) ON CONFLICT DO NOTHING RETURNING digest',[digestIFJ(code)]);if(inserted.rowCount)break;code=null;}
   if(!code)throw fail('Não foi possível gerar um código. Tente novamente.',503);
   const m=(await c.query('INSERT INTO members(ifj,name,game_nick,roblox_username,discord_id,division,created_by,account_kind,allied_gang,member_rank) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[code,...values])).rows[0];
   await audit(c,req.auth.staff_id,'IFJ criado',{memberId:m.id,division:m.division});return m;
  });res.status(201).json(member);
 });
 app.patch('/api/members/:id',permit('editIFJ'),async(req,res)=>{
  const result=await tx(pool,async c=>{
   const old=(await c.query('SELECT * FROM members WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old)throw fail('IFJ não encontrado.',404);
   if(!Number.isInteger(req.body.identity_version)||req.body.identity_version!==old.identity_version)throw fail('O cadastro foi atualizado. Recarregue os dados antes de editar.',409);
   const b=memberData({...old,...req.body});const reset=identityChanged(old,b)||bothDivisions(old)!==bothDivisions(b);
   const m=(await c.query('UPDATE members SET name=$1,game_nick=$2,roblox_username=$3,discord_id=$4,division=$5,account_kind=$6,allied_gang=$7,member_rank=$8,verified=$9,identity_version=identity_version+1,updated_at=now() WHERE id=$10 RETURNING *',[b.name,b.game_nick,b.roblox_username,b.discord_id,b.division,b.account_kind,b.allied_gang,b.member_rank,reset?false:old.verified,old.id])).rows[0];
   await c.query('DELETE FROM confirmations WHERE member_id=$1',[old.id]);
   if(reset)for(const discordId of new Set([old.discord_id,b.discord_id]))await enqueue(c,'sync-role',{discordId});
   await audit(c,req.auth.staff_id,'Cadastro IFJ atualizado',{memberId:old.id,version:m.identity_version,verificationReset:reset});
   return {member:m,message:reset?'Cadastro atualizado. Verificação reiniciada; retirada dos cargos na fila. O membro deve verificar novamente.':'Patente atualizada. Gere uma nova carteira PNG.'};
  });res.json(result);
 });
 app.get('/api/members/:id/card.png',permit('issueCard'),rateLimit({windowMs:60000,limit:20,message:{error:'Aguarde um minuto para gerar mais carteiras.'}}),async(req,res)=>{
  const m=(await pool.query('SELECT * FROM members WHERE id=$1',[req.params.id])).rows[0];if(!m)throw fail('IFJ não encontrado.',404);
  const buffer=await (await import('./cards.js')).renderCard(m,config.divisions.find(d=>d.id===m.division)?.name||`${m.division}ª divisão`);
  res.set('Content-Type','image/png').set('Content-Disposition',`attachment; filename="ROKUHARA-${m.account_kind}-${m.ifj}-v${m.identity_version}.png"`).send(buffer);
 });
 app.delete('/api/members/:id',permit('deleteIFJ'),async(req,res)=>{
  const reason=text(req.body.reason,'Motivo',1000);const announce=req.body.announce===true;
  if(announce&&!allowed(req.auth.role,'admin'))throw fail('Somente administradores podem anunciar cancelamentos.',403);
  await tx(pool,async c=>{
   const member=(await c.query('DELETE FROM members WHERE id=$1 RETURNING *',[req.params.id])).rows[0];if(!member)throw fail('IFJ não encontrado.',404);
   await enqueue(c,'sync-role',{discordId:member.discord_id});
   if(announce)await enqueue(c,'announcement',{division:member.division,title:'IFJ CANCELADO',nick:member.game_nick,reason,description:'Identificação cancelada pela administração.'});
   await audit(c,req.auth.staff_id,'IFJ excluído',{memberId:member.id,nick:member.game_nick,reason});
  });res.json({ok:true,message:'IFJ excluído. Remoção de acesso colocada na fila do bot.'});
 });
 app.get('/api/staff',permit('admin'),async(req,res)=>res.json((await pool.query('SELECT id,username,role,active,created_at FROM staff ORDER BY id')).rows));
 app.post('/api/staff',permit('admin'),async(req,res)=>{
  const username=text(req.body.username,'Usuário',64,3).toLowerCase();if(!/^[a-z0-9_.-]+$/.test(username))throw fail('Usuário: use letras, números, ponto, hífen ou sublinhado.');
  if(!['admin','moderador','recrutador'].includes(req.body.role))throw fail('Patente inválida.');
  const p=await passwordHash(text(req.body.password,'Senha',128,12));
  const user=await tx(pool,async c=>{const r=await c.query('INSERT INTO staff(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,active',[username,p,req.body.role]);await audit(c,req.auth.staff_id,'Login criado',{staffId:r.rows[0].id,role:req.body.role});return r.rows[0];});res.status(201).json(user);
 });
 app.patch('/api/staff/:id',permit('admin'),async(req,res)=>{
  const id=Number(req.params.id);if(id===req.auth.staff_id)throw fail('Use Minha conta para alterar sua senha. Sua própria patente não pode ser alterada aqui.');
  const role=req.body.role;if(!['admin','moderador','recrutador'].includes(role)||typeof req.body.active!=='boolean')throw fail('Informe patente e situação válidas.');
  await tx(pool,async c=>{
   await c.query('LOCK TABLE staff IN SHARE ROW EXCLUSIVE MODE');
   const actor=(await c.query('SELECT role,active FROM staff WHERE id=$1',[req.auth.staff_id])).rows[0];
   if(!actor?.active||actor.role!=='admin')throw fail('Sua permissão foi alterada. Entre novamente.',403);
   const target=(await c.query('SELECT role,active FROM staff WHERE id=$1',[id])).rows[0];
   if(!target)throw fail('Login não encontrado.',404);
   if(target.role==='admin'&&target.active&&(role!=='admin'||!req.body.active)){
    const total=(await c.query("SELECT count(*) AS total FROM staff WHERE role='admin' AND active=TRUE")).rows[0];
    if(Number(total.total)<=1)throw fail('Mantenha pelo menos um administrador ativo.');
   }
   const u=await c.query('UPDATE staff SET role=$1,active=$2 WHERE id=$3 RETURNING id',[role,req.body.active,id]);if(!u.rowCount)throw fail('Login não encontrado.',404);
   if(req.body.password)await c.query('UPDATE staff SET password_hash=$1 WHERE id=$2',[await passwordHash(text(req.body.password,'Senha',128,12)),id]);
   await c.query('DELETE FROM sessions WHERE staff_id=$1',[id]);await audit(c,req.auth.staff_id,'Login atualizado',{staffId:id,role,active:req.body.active});
  });res.json({ok:true});
 });
 app.post('/api/announcements',permit('admin'),async(req,res)=>{
  const id=await enqueue(pool,'announcement',{division:division(req.body.division),title:'VIVO OU MORTO',nick:text(req.body.nick,'Nick',64),reason:text(req.body.reason,'Motivo',1000),description:text(req.body.description,'Descrição',2000)});
  await audit(pool,req.auth.staff_id,'Caçado anunciado',{jobId:id});res.status(202).json({ok:true,id,message:'Anúncio na fila de envio.'});
 });
 app.get('/api/reports',permit('admin'),async(req,res)=>res.json((await pool.query('SELECT r.*,m.ifj,m.game_nick,m.roblox_username,m.discord_id FROM reports r LEFT JOIN members m ON m.id=r.member_id ORDER BY r.created_at DESC LIMIT 1000')).rows));
 app.post('/api/reports/:id/resolve',permit('admin'),async(req,res)=>{
  await tx(pool,async c=>{
   const report=(await c.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!report)throw fail('Denúncia não encontrada.',404);
   if(report.member_id)await c.query('SELECT id FROM members WHERE id=$1 FOR UPDATE',[report.member_id]);
   await c.query("UPDATE reports SET status='resolvida',resolution=$1,reviewed_by=$2 WHERE id=$3",[text(req.body.resolution,'Resultado da análise',2000),req.auth.staff_id,report.id]);
   if(report.member_id)await c.query("UPDATE members SET suspect=EXISTS(SELECT 1 FROM reports WHERE member_id=$1 AND status='pendente') WHERE id=$1",[report.member_id]);
   await audit(c,req.auth.staff_id,'Denúncia analisada',{reportId:report.id});
  });res.json({ok:true});
 });
 app.get('/api/tickets',permit('admin'),async(req,res)=>res.json((await pool.query('SELECT * FROM tickets ORDER BY created_at DESC LIMIT 500')).rows));
 app.post('/api/tickets/:id/close',permit('admin'),async(req,res)=>{await bot.closeTicket(Number(req.params.id),`painel:${req.auth.staff_id}`);res.json({ok:true});});
 app.get('/api/operations',permit('admin'),async(req,res)=>res.json({ready:bot.ready(),jobs:(await pool.query('SELECT * FROM jobs ORDER BY id DESC LIMIT 100')).rows,audit:(await pool.query('SELECT * FROM audit ORDER BY id DESC LIMIT 100')).rows}));
 app.post('/api/jobs/:id/retry',permit('admin'),async(req,res)=>{await pool.query("UPDATE jobs SET status='pending',attempts=0,next_at=now(),error=NULL WHERE id=$1 AND status='failed'",[req.params.id]);res.json({ok:true});});
 app.post('/api/bot/setup',permit('admin'),async(req,res)=>{if(!bot.ready())throw fail('Bot desconectado. Verifique as variáveis e os logs no Render.',503);await bot.setup();await audit(pool,req.auth.staff_id,'Painéis Discord publicados');res.json({ok:true});});
 app.use('/api',(_req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
 app.get('/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true});}catch{res.status(503).json({ok:false});}});
 app.get('/painel',(_req,res)=>res.sendFile(path.join(publicDir,'panel.html')));
 app.use(express.static(publicDir,{index:'index.html'}));
 app.use((err,_req,res,_next)=>{const status=err.status||(['23505','23503','22P02'].includes(err.code)?400:500);if(status===500)console.error('Erro da API:',err.code||err.name);res.status(status).json({error:err.code==='23505'?'Já existe cadastro com esse usuário Roblox, Discord ou login.':status===500?'Erro interno. Consulte os logs e tente novamente.':err.message});});
 return app;
}
