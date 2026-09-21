import {validateEnvironment} from './config-rules.js';
export class ConfigurationError extends Error{constructor(checks){super('Configuração inválida. Corrija as variáveis indicadas.');this.name='ConfigurationError';this.checks=checks;}}
export function readConfig(env=process.env,report=()=>{}){
 const checks=validateEnvironment(env);checks.forEach(report);if(checks.some(c=>!c.ok))throw new ConfigurationError(checks);
 const botEnabled=env.BOT_ENABLED!=='false';
 const divisions=[1,2].map(n=>{const get=s=>env[`DIV_${n}_${s}`]||'';return {id:n,name:get('NAME')||`${n}ª divisão`,guild:get('GUILD_ID'),memberRole:get('MEMBER_ROLE_ID'),adminRole:get('ADMIN_ROLE_ID'),verification:get('VERIFICATION_CHANNEL_ID'),wanted:get('WANTED_CHANNEL_ID'),tickets:get('TICKETS_CHANNEL_ID'),reports:get('REPORTS_CHANNEL_ID'),category:get('TICKET_CATEGORY_ID'),staffChannel:get('STAFF_CHANNEL_ID')};});
 return {production:env.NODE_ENV==='production',origin:env.APP_ORIGIN.replace(/\/$/,''),secret:env.SESSION_SECRET,database:env.DATABASE_URL,botEnabled,token:botEnabled?env.DISCORD_TOKEN:'',divisions,port:Number(env.PORT||3000)};
}
