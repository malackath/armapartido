// Prueba de persistencia de la demo: reserva, refresco, cierre de sesión, reinicio.
const {chromium}=require('playwright');
// Uso: node scripts/verify-demo.cjs <url> <contraseña o - para entrar con un toque> [carpeta-capturas]. En la Mac usa Chrome instalado (CHANNEL=chrome).
const URL=process.argv[2], PW=process.argv[3], OUT=process.argv[4]||'.';
const NAMES={jugador:'Martín Silva',jugadora:'Lucía Pérez',mostrador:'Diego Fernández',dueno:'Sofía Rodríguez',plataforma:'Equipo Armá Partido'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function login(p,who){await p.goto(URL);await p.waitForSelector('text=/Probá la demo|Entrá a tu club/',{timeout:30000});
 if(!PW||PW==='-'){await p.getByRole('button',{name:new RegExp(NAMES[who])}).click();}
 else{await p.fill('input[type=email]',who+'@demo.armapartido.com');await p.fill('input[type=password]',PW);await p.keyboard.press('Enter');}
 await p.waitForSelector('text=/¡Hola/',{timeout:30000});await sleep(2500);}
async function misReservas(p){await p.locator('nav').last().getByText('Reservar',{exact:true}).click();await sleep(2500);
 const sec=p.locator('section').filter({has:p.getByRole('heading',{name:/Mis reservas/})}).first();
 return (await sec.innerText()).replace(/\s+/g,' ');}
async function logout(p){await p.locator('header button').last().click();await sleep(600);await p.getByText('Cerrar sesión').click();await p.waitForSelector('text=/Probá la demo|Entrá a tu club/',{timeout:20000});}
(async()=>{const b=await chromium.launch(process.env.CHANNEL?{channel:process.env.CHANNEL}:{});const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();
p.on('dialog',d=>d.accept());const errs=[];p.on('pageerror',e=>errs.push(e.message));
await login(p,'jugador');
let before=await misReservas(p);
// elegir el 4to día y el primer horario libre
await p.locator('main button').filter({hasText:/^(Lun|Mar|Mié|Jue|Vie|Sáb|Dom)\s*\d+$/}).nth(2).click();await sleep(1500);
const slot=p.locator('main button:not([disabled])').filter({hasText:/^\d\d:\d\d\s*\$/}).first();
const slotText=(await slot.innerText()).split('\n')[0];await slot.click();await sleep(800);
await p.getByText('Confirmar y pagar en el club').click();await sleep(4000);
await p.screenshot({path:OUT+'/p1-reservado.png'});
const after=await misReservas(p);
const n=s=>(s.match(/Estado:/g)||[]).length;
console.log('1) Reserva nueva a las',slotText,'| reservas antes:',n(before),'después:',n(after));
await p.reload();await p.waitForSelector('text=/¡Hola/',{timeout:30000});await sleep(2500);
const afterReload=await misReservas(p);console.log('2) Después de refrescar:',n(afterReload),afterReload.includes(slotText)?'(la reserva sigue)':'(NO aparece)');
await logout(p);await login(p,'jugador');const afterRelogin=await misReservas(p);
console.log('3) Después de cerrar sesión y volver a entrar:',n(afterRelogin),afterRelogin.includes(slotText)?'(la reserva sigue)':'(NO aparece)');
await p.screenshot({path:OUT+'/p2-tras-volver-a-entrar.png'});
await logout(p);await login(p,'dueno');
await p.locator('header button').last().click();await sleep(600);await p.getByText('Reiniciar demo').click();await sleep(20000);
await logout(p).catch(()=>{});await login(p,'jugador');const afterReset=await misReservas(p);
console.log('4) Después de Reiniciar demo:',n(afterReset),'(debería volver a',n(before)+')');
console.log('Errores de página:',errs.length?errs:'ninguno');await b.close();})().catch(e=>{console.error('FALLÓ:',e.message);process.exit(1)});
