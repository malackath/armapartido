/* Medidor de visitas para el panel (pizcaya.com/#/panel). Se copia a cada app y se carga con:
     <script src="/medidor.js" data-app="armapartido" defer></script>
   Sin cookies de terceros ni IP: el visitante es un número al azar guardado en este navegador.
   Cuenta pantallas, de dónde viene la visita, aparato y el texto de los botones que se tocan (nunca lo que se escribe).
   Para no contarte a vos mismo: entrá una vez con ?soyyo=1 al final del link. */
(function () {
  var URL_EV = "https://pizca-ia.velvet-uy.workers.dev/ev";
  var yoScript = document.currentScript;
  var APP = (yoScript && yoScript.getAttribute("data-app")) || "otra";
  var K = "md_" + APP + "_";
  function leer(st, k) { try { return st.getItem(K + k); } catch (e) { return null; } }
  function poner(st, k, v) { try { st.setItem(K + k, v); } catch (e) {} }
  function az(n) { var a = new Uint8Array(n), s = ""; crypto.getRandomValues(a); for (var i = 0; i < n; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[a[i] % 36]; return s; }

  var q = new URLSearchParams(location.search);
  if (q.get("soyyo") === "1") poner(localStorage, "yo", "1");
  if (q.get("soyyo") === "0") try { localStorage.removeItem(K + "yo"); } catch (e) {}
  if (leer(localStorage, "yo") === "1") return;

  var V = leer(localStorage, "v"), yaVino = !!V;
  if (!V) { V = az(16); poner(localStorage, "v", V); }
  var S = leer(sessionStorage, "s"), ultima = +leer(localStorage, "ult") || 0;
  var nueva = !S || Date.now() - ultima > 30 * 60e3;
  if (nueva) { S = az(12); poner(sessionStorage, "s", S); }

  var cola = [], RUTA = "";
  function rutaActual() {
    var sub = location.hostname.split(".").length > 2 && !/^www\./.test(location.hostname) ? location.hostname.split(".")[0] + ":" : "";
    var r = (location.pathname.replace(/\/index\.html$/, "/") + location.hash).replace(/\/+$/, "") || "inicio";
    return (sub + r).slice(0, 40);
  }
  function evento(n, p) {
    cola.push({ n: n, p: p || undefined, t: Date.now(), ruta: RUTA });
    poner(localStorage, "ult", String(Date.now()));
    if (cola.length >= 20) enviar();
  }
  function enviar(alSalir) {
    if (!cola.length) return;
    var blob = new Blob([JSON.stringify({ app: APP, v: V, s: S, evs: cola.splice(0, 40) })], { type: "text/plain" });
    if (alSalir && navigator.sendBeacon && navigator.sendBeacon(URL_EV, blob)) return;
    fetch(URL_EV, { method: "POST", body: blob, keepalive: true }).catch(function () {});
  }
  function pantalla() { var r = rutaActual(); if (r === RUTA) return; RUTA = r; evento("pantalla"); }

  function aparato() {
    var ua = navigator.userAgent || "";
    var so = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "Otro";
    var nav = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung" : /FBAN|FBAV|Instagram|TikTok|musical_ly/.test(ua) ? "Dentro de una red social" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Otro";
    var ancho = Math.min(screen.width || innerWidth, screen.height || innerHeight);
    var disp = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "Tablet" : ancho < 600 || /Mobi/.test(ua) ? "Celular" : "Compu";
    var inst = (matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone ? "Instalada" : undefined;
    return { disp: disp, so: so, nav: nav, app: inst };
  }

  RUTA = rutaActual();
  if (nueva) {
    var fuente = q.get("utm_source") || q.get("ref") || "";
    if (!fuente && document.referrer) { try { var h = new URL(document.referrer).hostname.replace(/^www\./, ""); if (h !== location.hostname.replace(/^www\./, "")) fuente = h; } catch (e) {} }
    var a = aparato();
    evento("visita", { fuente: (fuente || "directo").toLowerCase().slice(0, 40), campania: q.get("utm_campaign") || undefined, vuelve: yaVino || undefined, disp: a.disp, so: a.so, nav: a.nav, app: a.app });
  }
  evento("pantalla");

  // apps de una sola página: cambios de dirección sin recargar
  ["pushState", "replaceState"].forEach(function (f) {
    var o = history[f]; history[f] = function () { var r = o.apply(this, arguments); setTimeout(pantalla, 0); return r; };
  });
  addEventListener("popstate", pantalla);
  addEventListener("hashchange", pantalla);

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button, a, [role=button]");
    if (!b) return;
    var txt = (b.getAttribute("aria-label") || b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (txt) evento("clic", { b: txt });
  }, { capture: true, passive: true });

  setInterval(enviar, 8000);
  addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") { evento("salir"); enviar(true); } });
})();
