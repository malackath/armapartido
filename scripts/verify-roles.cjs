const {chromium}=require('playwright');const PW=process.argv[3];const OUT=process.argv[4]||'.';
// Uso: node scripts/verify-roles.cjs <url> <contraseña o - para entrar con un toque> [carpeta-capturas]
const NAMES={jugador:'Martín Silva',jugadora:'Lucía Pérez',mostrador:'Diego Fernández',cantina:'Romina Ferreira',dueno:'Sofía Rodríguez',plataforma:'Equipo Armá Partido'};
const URL=process.argv[2]||'http://localhost:4180';
(async()=>{const b=await chromium.launch(process.env.CHANNEL?{channel:process.env.CHANNEL}:{});
for (const who of ['jugador','mostrador','cantina','dueno','plataforma']){
 const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(URL);await p.waitForSelector('text=/Probá la demo|Entrá a tu club/',{timeout:30000});
 await p.screenshot({path:OUT+'/entrada.png'});
 if(!PW||PW==='-'){await p.getByRole('button',{name:new RegExp(NAMES[who])}).click();}
 else{await p.fill('input[type=email]',who+'@demo.armapartido.com');await p.fill('input[type=password]',PW);await p.keyboard.press('Enter');}
 await p.waitForTimeout(7000);await p.screenshot({path:OUT+'/rol-'+who+'.png'});
 const body=(await p.innerText('body')).slice(0,200).replace(/\n+/g,' | ');
 const entra=(await p.locator('main h1').first().innerText().catch(()=>'')).replace(/\s+/g,' ');
 // Cada rol entra directo a su pantalla; para ver el menú del avatar primero se vuelve a la app.
 const back=p.getByText('Volver a la app');if(await back.count()){await back.first().click();await p.waitForTimeout(1500);}
 await p.locator('header button[aria-expanded]').first().click().catch(()=>{});await p.waitForTimeout(800);
 const menu=(await p.innerText('body')).match(/(Mostrador|Cantina|Admin del club|Plataforma|Reiniciar demo|Cerrar sesión)/g);
 console.log(who,'| entra a:',entra,'|',body.slice(0,80),'\n  menu:',[...new Set(menu||[])].join(', '),'errors:',errs.length);
 await c.close();}
await b.close()})()
