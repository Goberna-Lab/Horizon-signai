/* Horizon Signai · idioma de las páginas del planificador: inglés (por defecto) o español.
 *
 * Las páginas están escritas en inglés. En español no se reescriben: este archivo traduce lo que se ve, nodo de texto por
 * nodo de texto (y los atributos title, aria-label y placeholder), con el diccionario de i18n-es.js. También traduce lo
 * que las páginas dibujan después (tarjetas, línea de tiempo, diálogos), observando los cambios del documento.
 *
 * - La preferencia es la misma de toda la app: localStorage «horizon-signai.lang» («en» o «es»). La landing, el mapa 3D y
 *   EVA leen esa misma clave. «?lang=es» en la dirección también la fija.
 * - Cambiar de idioma recarga la página: así no hay que deshacer traducciones. Si el cambio viene de otra pantalla
 *   (la app que envuelve a esta página en un iframe), el aviso «storage» también la recarga.
 * - Diccionario: LunarI18n.add({ exact: { 'English text': 'Texto en español' }, patterns: [[/^Meets all (\d+) requirements$/, 'Cumple los $1 requisitos']] }).
 *   Primero se busca el texto entero (sin espacios de los bordes y con los espacios seguidos reducidos a uno) en «exact».
 *   Si no está, se aplican todos los «patterns» en orden, uno tras otro, sobre el mismo texto: los que cubren la frase
 *   entera van anclados con ^ y $; los de trozos (meses, unidades) van al final. Lo que nadie traduce se queda en inglés.
 * - Lo que no está en el documento (texto pintado en un canvas, window.prompt) se pide con LunarI18n.t('English text').
 */
(function (root) {
  'use strict';
  var KEY = 'horizon-signai.lang';
  function read() {
    try {
      var q = /[?&]lang=(en|es)\b/.exec(root.location.search);
      if (q) { root.localStorage.setItem(KEY, q[1]); return q[1]; }
      return root.localStorage.getItem(KEY) === 'es' ? 'es' : 'en';
    } catch (e) { return 'en'; }
  }
  var lang = read(), exact = {}, patterns = [], cache = {}, cacheN = 0;
  var ATTRS = ['title', 'aria-label', 'placeholder'];

  function tr(s) {
    if (lang !== 'es' || !s) return s;
    if (Object.prototype.hasOwnProperty.call(cache, s)) return cache[s];
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2].replace(/\s+/g, ' '), out = s;
    if (core && /[A-Za-z]/.test(core)) {
      if (Object.prototype.hasOwnProperty.call(exact, core)) out = m[1] + exact[core] + m[3];
      else {
        var r = core;
        for (var i = 0; i < patterns.length; i++) r = r.replace(patterns[i][0], patterns[i][1]);
        if (r !== core) out = m[1] + r + m[3];
      }
    }
    if (cacheN++ > 6000) { cache = {}; cacheN = 0; }
    cache[s] = out;
    return out;
  }
  function textNode(n) { var v = n.nodeValue, t = tr(v); if (t !== v) n.nodeValue = t; }
  function attrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v) { var t = tr(v); if (t !== v) el.setAttribute(ATTRS[i], t); }
    }
  }
  function skip(el) { var n = el && el.nodeName; return n === 'SCRIPT' || n === 'STYLE' || n === 'TEXTAREA'; }
  function tree(node) {
    if (node.nodeType === 3) { if (!skip(node.parentNode)) textNode(node); return; }
    if (node.nodeType !== 1 || skip(node)) return;
    attrs(node);
    var all = node.querySelectorAll('*'), i;
    for (i = 0; i < all.length; i++) attrs(all[i]);
    var w = root.document.createTreeWalker(node, 4 /* NodeFilter.SHOW_TEXT */, null), t;
    while ((t = w.nextNode())) if (!skip(t.parentNode)) textNode(t);
  }
  function start() {
    var d = root.document;
    d.documentElement.lang = lang;
    if (lang !== 'es') return;
    d.title = tr(d.title);
    tree(d.body);
    new root.MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === 'characterData') { if (!skip(r.target.parentNode)) textNode(r.target); }
        else if (r.type === 'attributes') attrs(r.target);
        else for (var k = 0; k < r.addedNodes.length; k++) tree(r.addedNodes[k]);
      }
    }).observe(d.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /* cambia el idioma de la app (no hay botones EN / ES en pantalla: el idioma lo elige EVA o «?lang=») */
  function set(next) {
    if (next !== 'en' && next !== 'es' || next === lang) return;
    try { root.localStorage.setItem(KEY, next); } catch (e) { /* sin almacenamiento no hay cambio que recordar */ }
    /* si la dirección traía «?lang=», se quita: si no, al recargar volvería a mandar ella */
    var clean = root.location.href.replace(/([?&])lang=(en|es)\b&?/, '$1').replace(/[?&](#|$)/, '$1');
    if (clean !== root.location.href) root.location.replace(clean); else root.location.reload();
  }
  root.addEventListener('storage', function (evt) {
    if (evt.key === KEY && (evt.newValue === 'es' ? 'es' : 'en') !== lang) root.location.reload();
  });

  root.LunarI18n = {
    lang: lang,
    set: set,
    t: tr,
    add: function (d) {
      var k;
      if (d.exact) for (k in d.exact) if (Object.prototype.hasOwnProperty.call(d.exact, k)) exact[k.replace(/\s+/g, ' ').trim()] = d.exact[k];
      if (d.patterns) patterns = patterns.concat(d.patterns);
    }
  };
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start); else start();
})(window);
