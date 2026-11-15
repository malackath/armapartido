const {chromium}=require('playwright');const PW=process.argv[3];const OUT=process.argv[4]||'.';
// Uso: node scripts/verify-roles.cjs <url> <contraseña> [carpeta-capturas]
const URL=process.argv[2]||'http://localhost:4180';
(async()=>{const b=await chromium.launch(process.env.CHANNEL?{channel:process.env.CHANNEL}:{});
for (const who of ['jugador','mostrador','dueno','plataforma']){
 const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(URL);await p.waitForSelector('input[type=email]',{timeout:20000});
 await p.fill('input[type=email]',who+'@demo.armapartido.com');await p.fill('input[type=password]',PW);await p.keyboard.press('Enter');
 await p.waitForTimeout(7000);await p.screenshot({path:OUT+'/rol-'+who+'.png'});
 const body=(await p.innerText('body')).slice(0,200).replace(/\n+/g,' | ');
 await p.locator('header button').last().click().catch(()=>{});await p.waitForTimeout(800);
 const menu=(await p.innerText('body')).match(/(Mostrador|Admin del club|Plataforma|Reiniciar demo|Cerrar sesión)/g);
 console.log(who,'|',body.slice(0,120),'\n  menu:',[...new Set(menu||[])].join(', '),'errors:',errs.length);
 await c.close();}
await b.close()})()
