// Uso: node scripts/verify-install-modal.cjs <url> [carpeta-capturas]. Prueba el modal "Instalar la app" en compu y celular.
const {chromium}=require('playwright');
const URL=process.argv[2], OUT=process.argv[3]||'.';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await chromium.launch(process.env.CHANNEL?{channel:process.env.CHANNEL}:{});
for (const [name,opts] of [['compu',{viewport:{width:1440,height:900}}],['compu-baja',{viewport:{width:1280,height:560}}],['celular',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]]){
 const c=await b.newContext(opts);const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(URL);await p.waitForSelector('text=/Probá la demo/',{timeout:30000});
 await p.getByRole('button',{name:/Martín Silva/}).click();await p.waitForSelector('text=/¡Hola/',{timeout:30000});await sleep(1500);
 const res=[];
 for (const how of ['X','Entendido','afuera','Escape']){
  await p.locator('header button[aria-expanded]').click();await sleep(400);
  await p.getByRole('button',{name:/Instalar la app/}).click();await sleep(500);
  const dlg=p.getByRole('dialog');const box=await dlg.boundingBox();const vp=p.viewportSize();
  const title=await p.locator('#install-guide-title').boundingBox();
  const menuOpen=await p.locator('header button[aria-expanded="true"]').count();
  if(how==='X'){await p.screenshot({path:`${OUT}/modal-${name}.png`});
   res.push(`modal ${Math.round(box.width)}x${Math.round(box.height)} en (${Math.round(box.x)},${Math.round(box.y)}), pantalla ${vp.width}x${vp.height}, entra entero: ${box.y>=0&&box.y+box.height<=vp.height}, título visible: ${title.y>=0}, menú cerrado: ${menuOpen===0}`);}
  if(how==='X')await dlg.getByRole('button',{name:'Cerrar'}).click();
  if(how==='Entendido')await dlg.getByRole('button',{name:'Entendido'}).click();
  if(how==='afuera')await p.mouse.click(5,vp.height-5);
  if(how==='Escape')await p.keyboard.press('Escape');
  await sleep(300);res.push(`cierra con ${how}: ${(await p.getByRole('dialog').count())===0}`);
 }
 console.log(name+':\n  '+res.join('\n  ')+'\n  errores: '+errs.length);await c.close();}
await b.close()})().catch(e=>{console.error('FALLÓ:',e.message);process.exit(1)});
