// Verifica el rol Cantina: entra con un toque, vende, carga a una cancha y no ve Mostrador ni Admin.
// Uso: CHANNEL=chrome node scripts/verify-cantina.cjs <url> <carpeta-capturas> [hora simulada HH:MM]
// Con hora simulada la demo puede rearmarse sola al entrar (más de 2 h): usar sin hora contra la demo publicada.
const { chromium } = require('playwright');
const URL=process.argv[2]||'http://127.0.0.1:5173', OUT=process.argv[3]||'.', hh=process.argv[4];
(async()=>{const b=await chromium.launch(process.env.CHANNEL?{channel:process.env.CHANNEL}:{});
 const c=await b.newContext({viewport:{width:1400,height:900},deviceScaleFactor:1,timezoneId:'America/Montevideo'}); const p=await c.newPage();
 if(hh){const [h,m]=hh.split(':').map(Number); await p.clock.install({time:new Date(Date.UTC(2026,10,16,h+3,m))});}
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&/permission|insufficient/i.test(m.text()))errs.push(m.text().slice(0,160));});
 const res=[]; const check=(n,ok,d)=>{res.push(ok);console.log(`${ok?'OK  ':'FALLA'} ${n}${d?' · '+d:''}`)};
 await p.goto(URL); await p.waitForSelector('text=/Probá la demo|Entrá a tu club/',{timeout:40000});
 const btn=p.getByRole('button',{name:/Romina Ferreira/}); check('Botón "Encargada de cantina" en la entrada', await btn.count()>0);
 await btn.click(); await p.waitForTimeout(8000);
 let t=await p.innerText('body');
 check('Entra directo a la Cantina', t.includes('Cantina de hoy'));
 check('Ve venta, cargar a una cancha y caja de cantina', t.includes('Cargar a una cancha') && t.includes('Caja de la cantina'));
 check('No ve pestañas de cuponeras ni saldo', !/Cuponeras y saldo|Clases/.test(t.split('Cargar a una cancha')[0]));
 await p.screenshot({path:`${OUT}/1-cantina.png`,fullPage:true});
 await p.locator('header button[aria-expanded]').first().click(); await p.waitForTimeout(700);
 const menu=await p.innerText('body');
 check('Menú: tiene Cantina y no Mostrador ni Admin', /Cantina/.test(menu) && !/Mostrador/.test(menu) && !/Admin del club/.test(menu));
 await p.screenshot({path:`${OUT}/2-menu.png`}); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
 // Venta: agua, efectivo, sin nombre
 const before=(await p.innerText('body')).match(/Caja de la cantina\s*\n?\s*\$\s?([\d.]+)/);
 const anon=p.getByText(/Sin nombre/).first(); if(await anon.count()) {await anon.click(); await p.waitForTimeout(600);}
 await p.locator('li, div').filter({hasText:/^Agua 500 ml/}).last().getByRole('button').last().click(); await p.waitForTimeout(500);
 await p.screenshot({path:`${OUT}/2b-venta.png`,fullPage:true});
 await p.getByRole('button',{name:/^Efectivo$/}).first().click().catch(()=>{}); await p.waitForTimeout(300);
 const cobrar=p.getByRole('button',{name:/^Cobrar/}).first(); await cobrar.click();
 const toast=await p.waitForSelector('text=/Venta cobrada|No se pudo/',{timeout:15000}).then(e=>e.innerText()).catch(()=>'sin aviso');
 check('La venta se guarda (aviso)', /Venta cobrada/.test(toast), toast); await p.waitForTimeout(1500);
 const after=(await p.innerText('body')).match(/Caja de la cantina\s*\n?\s*\$\s?([\d.]+)/);
 check('Vende un agua en efectivo y sube la caja de cantina', !!after && (!before || after[1]!==before[1]), `${before?.[1]} → ${after?.[1]}`);
 // Cargar a una cancha
 const turn=p.locator('li button').filter({hasText:/En juego/}).first();
 if(await turn.count()){ await turn.click(); await p.waitForTimeout(1500); t=await p.innerText('body');
  check('Abre la cuenta del turno solo para cargar', t.includes('se cobra en el mostrador') && !/Quién paga qué/i.test(t));
  check('Muestra a qué cancha está cargando', /Cargando a\s*\n?\s*Cancha \d/i.test(t), (t.match(/Cargando a\s*\n?\s*(Cancha \d)/i)||[])[1]);
  const before2=(t.match(/Falta cobrar\s*\$\s?([\d.]+)/)||[])[1];
  await p.locator('section').filter({hasText:'Agregar de la cantina'}).getByRole('button',{name:/Agua con gas/}).first().click(); await p.waitForTimeout(800);
  const todos=p.getByRole('button',{name:/Para todos|Todos|Compartido/}).first(); if(await todos.count()){await todos.click(); await p.waitForTimeout(400);}
  const add=p.getByRole('button',{name:/^Agregar|^Cargar/}).first(); if(await add.count()){await add.click();}
  const toast2=await p.waitForSelector('text=/sumado/',{timeout:10000}).then(e=>e.innerText()).catch(()=>'sin aviso');
  check('El aviso dice en qué cancha quedó', /en Cancha \d/.test(toast2), toast2);
  await p.waitForTimeout(2000); t=await p.innerText('body');
  const after2=(t.match(/Falta cobrar\s*\$\s?([\d.]+)/)||[])[1];
  check('Carga un agua con gas a la cuenta del turno', before2!==after2, `${before2} → ${after2}`);
  await p.screenshot({path:`${OUT}/3-cuenta-turno.png`,fullPage:true});
 } else check('Abre la cuenta del turno solo para cargar', false, 'sin canchas en juego');
 check('Sin errores de permisos ni de página', errs.length===0, errs.join(' | '));
 const bad=res.filter(x=>!x).length; console.log(`\n${res.length-bad} de ${res.length} verificaciones OK`); await b.close(); process.exit(bad?1:0);})();
