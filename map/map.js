/* Curated biomolecular literature map. Rebuild with build_map_data.py. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const D = window.BIO_MAP;
  if (!D) return;

  const CATS = D.cats;
  const PAPERS = D.papers;
  const byId = new Map(PAPERS.map((p) => [p.id, p]));
  const catLabel = Object.fromEntries(CATS.map((c) => [c.id, c.label]));
  const SHAPE = { emb: 'circle', latent: 'square', simplex: 'triangle', onehot: 'diamond',
    fewstep: 'triangleDown', hybrid: 'hexagon', guide: 'cross', apps: 'star', bayesian: 'hexagon', sphere: 'circle', sequence: 'diamond', latentgen: 'hexagon' };

  // ── Shapes: roughly equal visual area for a given radius ─
  function poly(pts) { return 'M' + pts.map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join('L') + 'Z'; }
  function ring(n, rad, rot) {
    return Array.from({ length: n }, (_, i) => {
      const a = rot + (i * 2 * Math.PI) / n;
      return [rad * Math.cos(a), rad * Math.sin(a)];
    });
  }
  function shapePath(cat, r) {
    switch (SHAPE[cat]) {
      case 'square': { const s = r * 0.89; return poly([[-s, -s], [s, -s], [s, s], [-s, s]]); }
      case 'diamond': return poly(ring(4, r * 1.25, -Math.PI / 2));
      case 'triangle': return poly(ring(3, r * 1.35, -Math.PI / 2).map(([x, y]) => [x, y + r * 0.2]));
      case 'triangleDown': return poly(ring(3, r * 1.35, Math.PI / 2).map(([x, y]) => [x, y - r * 0.2]));
      case 'hexagon': return poly(ring(6, r * 1.06, 0));
      case 'cross': {
        const a = r * 1.12, w = r * 0.44;
        return poly([[-w, -a], [w, -a], [w, -w], [a, -w], [a, w], [w, w], [w, a], [-w, a], [-w, w], [-a, w], [-a, -w], [-w, -w]]);
      }
      case 'star': {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const rad = i % 2 ? r * 0.62 : r * 1.38, a = -Math.PI / 2 + (i * Math.PI) / 5;
          pts.push([rad * Math.cos(a), rad * Math.sin(a) + r * 0.08]);
        }
        return poly(pts);
      }
      default: return `M${r},0A${r},${r} 0 1 1 ${-r},0A${r},${r} 0 1 1 ${r},0Z`;
    }
  }
  const icon = (cat, size = 6) =>
    `<svg viewBox="-8 -8 16 16" aria-hidden="true"><path d="${shapePath(cat, size)}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const authorLine = (a, n = 6) => (a.length > n ? a.slice(0, n).join(', ') + ', et al.' : a.join(', ').replace(/, et al\.$/, ' et al.'));

  // ── State ────────────────────────────────────────────────
  const state = { cats: new Set(CATS.map((c) => c.id)), facets: {}, year: null, query: '', sel: null, hover: null };
  const stage = $('#stage'), svg = $('#mapSvg');
  const L = { halos: $('#layerHalos'), edges: $('#layerEdges'), nodes: $('#layerNodes'), labels: $('#layerLabels'), clusters: $('#layerClusters') };
  const tip = $('#tip'), panel = $('#panel');
  let W = 0, H = 0;
  const view = { S: 1, TX: 0, TY: 0, fit: 1 };

  const bounds = PAPERS.reduce((b, p) => ({
    x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y),
  }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

  // Compact filter labels do not alter the source metadata shown in paper details.
  function filterValues(p, key) {
    if (key === 'wetlab') return [p.wetlab === 'Not reported' ? 'Computational only' : p.wetlab];
    if (key === 'applications') {
      const primary = ['Proteins', 'Antibodies', 'Peptides', 'DNA/RNA', 'Small molecules', 'Cell state', 'Enzymes'];
      return [...new Set(p.applications.map(a => ['DNA','RNA'].includes(a) ? 'DNA/RNA' : a === 'Multi-omics' ? 'Cell state' : primary.includes(a) ? a : 'Other'))];
    }
    return Array.isArray(p[key]) ? p[key] : [String(p[key])];
  }
  const visible = (p) => state.cats.has(p.cat) && (state.year == null || p.year <= state.year) &&
    Object.entries(state.facets).every(([key,values]) => !values.length || values.some(value =>
      filterValues(p,key).includes(value)));
  const matches = (p) => {
    if (!state.query) return true;
    const q = state.query.toLowerCase();
    return (p.short + ' ' + p.title + ' ' + p.authors.join(' ') + ' ' + p.venue + ' ' + (p.venueFull || '') + ' ' + p.year + ' ' + catLabel[p.cat] + ' ' + p.summary + ' ' + Object.values(p.details || {}).join(' ') + ' ' + (p.applications || []).join(' ') + ' ' + (p.modelTypes || []).join(' ') + ' ' + p.wetlab).toLowerCase().includes(q);
  };

  // ── Build SVG ────────────────────────────────────────────
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  // A cluster region is the union of one soft disc per paper, flattened by group opacity.
  const halo = {};
  CATS.forEach((c) => { halo[c.id] = el('g', { class: 'halo c-' + c.id }, L.halos); });
  const haloDisc = PAPERS.map((p) => el('circle', { r: 0 }, halo[p.cat]));

  const nodes = PAPERS.map((p) => {
    const g = el('g', { class: 'node c-' + p.cat, tabindex: '0', role: 'button',
      'aria-label': `${p.short}: ${p.title}, ${p.venue} ${p.year}` }, L.nodes);
    el('path', { d: shapePath(p.cat, p.r) }, g);
    g.addEventListener('pointerenter', () => { state.hover = p.id; showTip(p); drawEdges(); styleNodes(); });
    g.addEventListener('pointerleave', () => { state.hover = null; hideTip(); drawEdges(); styleNodes(); });
    g.addEventListener('click', (e) => { if (drag.moved) return; e.stopPropagation(); select(p.id, { center: false }); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.id); } });
    g.addEventListener('focus', () => { state.hover = p.id; showTip(p); drawEdges(); });
    g.addEventListener('blur', () => { state.hover = null; hideTip(); drawEdges(); });
    return g;
  });
  const labels = PAPERS.map((p) => {
    const t = el('text', { class: 'plabel' + (p.n >= 10 ? ' big' : '') }, L.labels);
    t.textContent = p.short;
    return t;
  });
  const clusterLabels = CATS.map((c) => {
    const t = el('text', { class: 'clabel' }, L.clusters);
    t.textContent = c.label;
    const n = el('tspan', { class: 'cl-count', dx: '6' }, t);
    return { cat: c.id, t, n };
  });

  // Text widths for label collision, measured once.
  const ctx = document.createElement('canvas').getContext('2d');
  function measure(text, weight) { ctx.font = `${weight} 11px Inter, -apple-system, sans-serif`; return ctx.measureText(text).width; }
  let widths = [];
  function measureAll() { widths = PAPERS.map((p) => measure(p.short, p.n >= 10 ? 600 : 500)); }

  // ── View transform ───────────────────────────────────────
  const sx = (x) => x * view.S + view.TX, sy = (y) => y * view.S + view.TY;
  function fitView() {
    const pad = W < 600 ? 34 : 64;
    const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
    const S = Math.min((W - 2 * pad) / bw, (H - 2 * pad - 20) / bh);
    view.fit = S; view.S = S;
    view.TX = (W - bw * S) / 2 - bounds.x0 * S;
    view.TY = (H - bh * S) / 2 - bounds.y0 * S + 10;
  }
  const zoomLevel = () => view.S / view.fit;
  function zoomAt(f, cx, cy) {
    const S = Math.max(view.fit * 0.7, Math.min(view.fit * 7, view.S * f));
    f = S / view.S;
    view.TX = cx - (cx - view.TX) * f;
    view.TY = cy - (cy - view.TY) * f;
    view.S = S;
    render();
  }
  let anim = 0;
  function animateTo(S, TX, TY, ms = 420) {
    cancelAnimationFrame(anim);
    const a = { ...view }, t0 = performance.now();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) ms = 0;
    const step = (now) => {
      const u = ms ? Math.min(1, (now - t0) / ms) : 1, e = 1 - Math.pow(1 - u, 3);
      view.S = a.S + (S - a.S) * e; view.TX = a.TX + (TX - a.TX) * e; view.TY = a.TY + (TY - a.TY) * e;
      render();
      if (u < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  const panelOpen = () => !panel.hidden;
  function focusPoint() {
    // Center of the part of the stage the panel does not cover.
    if (panelOpen() && W > 760) return [(W - 372) / 2, H / 2];
    if (panelOpen()) return [W / 2, H * 0.22];
    return [W / 2, H / 2];
  }

  // ── Render ───────────────────────────────────────────────
  function render() {
    const k = zoomLevel();
    const z = Math.min(1.5, Math.max(0.85, Math.pow(k, 0.3)));
    const discR = 34 * view.S;
    PAPERS.forEach((p, i) => {
      const x = sx(p.x), y = sy(p.y);
      nodes[i].setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${z.toFixed(3)})`);
      haloDisc[i].setAttribute('cx', x.toFixed(1));
      haloDisc[i].setAttribute('cy', y.toFixed(1));
      haloDisc[i].setAttribute('r', visible(p) ? discR.toFixed(1) : 0);
    });
    placeLabels(z);
    drawEdges();
  }

  function placeLabels(z) {
    const k = zoomLevel();
    const boxes = [];
    const hit = (b) => b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H || boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);

    // Cluster titles sit just above their cluster and fade out as you zoom in.
    // Larger clusters claim their spot first; a title that would collide is hidden.
    const cOpacity = Math.max(0, Math.min(1, (2.6 - k) / 0.9));
    const sized = clusterLabels.map((c) => ({ c, ps: PAPERS.filter((p) => p.cat === c.cat && visible(p)) }))
      .sort((a, b) => b.ps.length - a.ps.length);
    for (const { c, ps } of sized) {
      if (!ps.length || cOpacity === 0) { c.t.style.opacity = 0; continue; }
      const cx = ps.reduce((s, p) => s + sx(p.x), 0) / ps.length;
      const top = Math.min(...ps.map((p) => sy(p.y) - p.r * z));
      c.n.textContent = ps.length;
      const w = c.t.getComputedTextLength ? c.t.getComputedTextLength() : 160;
      const x = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, cx)), y = Math.max(22, top - 12);
      const b = { x0: x - w / 2 - 4, x1: x + w / 2 + 4, y0: y - 15, y1: y + 5 };
      if (hit(b)) { c.t.style.opacity = 0; continue; }
      c.t.setAttribute('x', x.toFixed(1));
      c.t.setAttribute('y', y.toFixed(1));
      c.t.style.opacity = cOpacity;
      boxes.push(b);
    }

    // Every visible mark is an obstacle, so labels never sit on top of a paper.
    PAPERS.forEach((p) => {
      if (!visible(p)) return;
      const x = sx(p.x), y = sy(p.y), r = p.r * z + 1;
      boxes.push({ x0: x - r, x1: x + r, y0: y - r, y1: y + r });
    });

    const order = PAPERS.map((p, i) => i).filter((i) => visible(PAPERS[i])).sort((a, b) => {
      const pri = (i) => (PAPERS[i].id === state.sel ? 1e4 : 0) + (PAPERS[i].id === state.hover ? 5e3 : 0) +
        (state.query && matches(PAPERS[i]) ? 2e3 : 0) + PAPERS[i].n;
      return pri(b) - pri(a);
    });
    const shown = new Set();
    for (const i of order) {
      const p = PAPERS[i], x = sx(p.x), y = sy(p.y), r = p.r * z, w = widths[i], h = 13;
      const forced = p.id === state.sel || p.id === state.hover;
      if (state.query && !matches(p) && !forced) continue;
      const cands = [
        { x: x + r + 4, y: y + 4, a: 'start' }, { x: x - r - 4, y: y + 4, a: 'end' },
        { x: x, y: y + r + 12, a: 'middle' }, { x: x, y: y - r - 5, a: 'middle' },
      ];
      for (const c of cands) {
        const x0 = c.a === 'start' ? c.x : c.a === 'end' ? c.x - w : c.x - w / 2;
        const b = { x0: x0 - 2, x1: x0 + w + 2, y0: c.y - 10, y1: c.y - 10 + h };
        if (forced || !hit(b)) {
          boxes.push(b);
          labels[i].setAttribute('x', c.x.toFixed(1));
          labels[i].setAttribute('y', c.y.toFixed(1));
          labels[i].setAttribute('text-anchor', c.a);
          shown.add(i);
          break;
        }
      }
    }
    labels.forEach((t, i) => {
      t.style.display = shown.has(i) ? '' : 'none';
      t.classList.toggle('sel', PAPERS[i].id === state.sel);
      t.classList.toggle('dim', !!state.query && !matches(PAPERS[i]));
    });
  }

  function drawEdges() {
    L.edges.replaceChildren();
    const id = state.hover || state.sel;
    if (!id) return;
    const p = byId.get(id);
    if (!visible(p)) return;
    const z = Math.min(1.5, Math.max(0.85, Math.pow(zoomLevel(), 0.3)));
    p.related.forEach((rid) => {
      const q = byId.get(rid);
      if (!q || !visible(q)) return;
      const x1 = sx(p.x), y1 = sy(p.y), x2 = sx(q.x), y2 = sy(q.y);
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1;
      // Start and stop at the rim of each mark; bow the line slightly.
      const a = p.r * z + 3, b = q.r * z + 3;
      const ax = x1 + (dx / d) * a, ay = y1 + (dy / d) * a, bx = x2 - (dx / d) * b, by = y2 - (dy / d) * b;
      const mx = (ax + bx) / 2 - dy * 0.12, my = (ay + by) / 2 + dx * 0.12;
      el('path', { class: 'edge', d: `M${ax.toFixed(1)},${ay.toFixed(1)}Q${mx.toFixed(1)},${my.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}` }, L.edges);
    });
  }

  function styleNodes() {
    const focus = state.hover || state.sel;
    const near = focus ? new Set([focus, ...byId.get(focus).related]) : null;
    PAPERS.forEach((p, i) => {
      const n = nodes[i];
      n.classList.toggle('hidden', !visible(p));
      n.classList.toggle('sel', p.id === state.sel);
      const q = !!state.query, m = matches(p);
      n.classList.toggle('match', q && m);
      n.classList.toggle('dim', (q && !m) || (!!near && !q && !near.has(p.id) && !!state.sel));
      n.setAttribute('tabindex', visible(p) ? '0' : '-1');
    });
    CATS.forEach((c) => halo[c.id].classList.toggle('off', !state.cats.has(c.id)));
  }

  // ── Tooltip ──────────────────────────────────────────────
  function showTip(p) {
    tip.className = 'map-tip c-' + p.cat;
    tip.innerHTML = `<div class="t-head">${icon(p.cat)}${esc(p.short)}</div>` +
      `<div class="t-title">${esc(p.title)}</div>` +
      `<div class="t-meta">${esc(authorLine(p.authors, 3))} · ${esc(p.venue)} ${p.year}</div>`;
    tip.hidden = false;
    const x = sx(p.x), y = sy(p.y), tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 16, top = y - th - 12;
    if (left + tw > W - 8) left = x - tw - 16;
    if (left < 8) left = 8;
    if (top < 8) top = y + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // ── Detail panel ─────────────────────────────────────────
  function select(id, { center = true, scroll = false } = {}) {
    const p = byId.get(id);
    if (!p) return;
    if (!visible(p)) { state.cats.add(p.cat); state.facets = {}; state.year = null; syncControls(); }
    state.sel = id;
    hideTip();
    panel.className = 'map-panel c-' + p.cat;
    const linkNames = {paper:'Publication', code:'Code'};
    const badges = [...p.applications, ...p.modelTypes, p.focus, p.wetlab === 'Demonstrated' ? 'Wet lab demonstrated' : p.wetlab];
    panel.innerHTML = `<div class="p-top"><span class="p-cat">${icon(p.cat)}${esc(catLabel[p.cat])}</span><button class="btn p-close" type="button" aria-label="Close details">Close</button></div><div class="p-body"><h3 class="p-short">${esc(p.short)}</h3><p class="p-title">${esc(p.title)}</p><p class="p-authors">${esc(authorLine(p.authors,8))}</p><p class="p-venue">${esc(p.venue)} · ${p.year}</p><div class="p-tags">${[...new Set(badges)].map(t => `<span>${esc(t)}</span>`).join('')}</div><p class="p-h">${esc(p.summaryKind || "Condensed abstract")}</p><p class="p-summary">${esc(p.summary)}</p><div class="p-links">${Object.entries(linkNames).filter(([k]) => p.links[k]).map(([k,v]) => `<a class="btn ${k === 'paper' ? 'primary' : ''}" href="${esc(p.links[k])}" target="_blank" rel="noopener noreferrer">${v} ↗</a>`).join('')}</div><p class="p-h">Experimental evidence</p><p>${esc(p.evidence || (p.details || {})['Validation / outcome'] || (p.wetlab === 'Demonstrated' ? 'Wet-lab experiments are reported in the linked study.' : p.wetlab === 'Computational only' ? 'The linked study evaluates generated outputs computationally.' : 'Wet-lab evidence was not established from the checked sources.'))}</p><p class="p-note">${esc(p.origin)} · Metadata checked ${esc(p.checked || D.checked)}</p></div>`;
    panel.hidden = false;
    panel.scrollTop = 0;
    $('.p-close', panel).addEventListener('click', deselect);
    panel.querySelectorAll('.p-related .legend-chip').forEach((b) => b.addEventListener('click', () => select(b.dataset.id)));
    if (window.renderMathInElement) {
      window.renderMathInElement(panel, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false });
    }
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// or sandboxed */ }
    styleNodes();
    const [fx, fy] = focusPoint();
    const x = sx(p.x), y = sy(p.y);
    const covered = W > 760 ? x > W - 380 || x < 20 : y > H * 0.38;
    if (center || covered || y < 20 || y > H - 20) animateTo(view.S, view.TX + fx - x, view.TY + fy - y);
    else render();
    if (scroll) stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function deselect() {
    state.sel = null;
    panel.hidden = true;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    styleNodes();
    render();
  }

  // ── Controls ─────────────────────────────────────────────
  const legend = $('#legend');
  CATS.forEach((c) => {
    const n = PAPERS.filter((p) => p.cat === c.id).length;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'legend-chip c-' + c.id;
    b.dataset.cat = c.id;
    b.setAttribute('aria-pressed', 'true');
    b.title = 'Show or hide ' + c.label + '. Double-click to show only this family.';
    b.innerHTML = `${icon(c.id)}<span class="lbl">${esc(c.label)}</span><span class="n">${n}</span>`;
    let clickTimer = 0;
    b.addEventListener('click', () => {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        if (state.cats.has(c.id)) state.cats.delete(c.id); else state.cats.add(c.id);
        update();
      }, 180);
    });
    b.addEventListener('dblclick', () => {
      clearTimeout(clickTimer);
      const only = state.cats.size === 1 && state.cats.has(c.id);
      state.cats = only ? new Set(CATS.map((x) => x.id)) : new Set([c.id]);
      update();
    });
    b.addEventListener('pointerenter', () => { if (!state.query) highlightCat(c.id); });
    b.addEventListener('pointerleave', () => { if (!state.sel) styleNodes(); });
    legend.appendChild(b);
  });
  function highlightCat(cat) {
    if (state.sel) return;
    PAPERS.forEach((p, i) => nodes[i].classList.toggle('dim', !!cat && p.cat !== cat));
  }

  const FACETS = { applications: 'Application', focus: 'Focus', wetlab: 'Validation' };
  const filterGlyphs = {
    applications: '<path d="M7 3c0 8 10 10 10 18M17 3C17 11 7 13 7 21M8 6h8M9 10h6M9 14h6M8 18h8"/>',
    modelTypes: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8M16 4h4v4"/>',
    wetlab: '<path d="M9 3h6M10 3v7L4 19a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2l-6-9V3M7 15h10"/>',
    origin: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  };
  function facetIcon(key, value = '') {
    let glyph = filterGlyphs[key];
    if (key === 'applications' && /cell/i.test(value)) glyph = '<circle cx="12" cy="12" r="9"/><circle cx="13" cy="11" r="3"/><path d="m6 14 1 1M15 17h1M7 7h1"/>';
    if (key === 'applications' && /molecule/i.test(value)) glyph = '<path d="m12 2 8 5v10l-8 5-8-5V7l8-5ZM8 7l4-2 4 2M17 10v5M8 17l4 2"/>';
    if (key === 'applications' && /protein|peptide|antibod/i.test(value)) glyph = '<path d="M4 17c-4-9 9-14 10-7s-8 9-6 3 15-9 12 2-10 2-9-2"/>';
    if (key === 'applications' && value === 'Enzymes') glyph = '<path d="M14 3a9 9 0 1 0 7 13l-7-4V3Z"/><path d="m20 4 2 3-3 2-2-3 3-2Z"/>';
    if (key === 'wetlab' && value === 'Computational only') glyph = '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4m-4-13 2 2-2 2M13 12h3"/>';
    if (key === 'wetlab' && value === 'Not reported') glyph = '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"/>';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyph}</svg>`;
  }
  const filters = $('#filters');
  const detailRow = document.createElement('div'); detailRow.className = 'facet-details-row';
  Object.entries(FACETS).forEach(([key,label]) => {
    const counts = new Map();
    PAPERS.forEach(p => filterValues(p,key).forEach(value => counts.set(value, (counts.get(value) || 0) + 1)));
    const values = [...counts.keys()].sort((a,b) => {
      if (key === 'applications') {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return counts.get(b) - counts.get(a) || a.localeCompare(b);
      }
      return a.localeCompare(b);
    });
    const group = document.createElement('div');
    group.className = 'facet-group facet-' + key;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Filter by ' + label.toLowerCase());
    const heading = document.createElement('span');
    heading.className = 'facet-label'; heading.textContent = label;
    group.appendChild(heading);
    const choices = document.createElement('div'); choices.className = 'facet-choices';
    ['', ...values].forEach(value => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'facet-chip';
      button.dataset.facet = key; button.dataset.value = value;
      button.setAttribute('aria-pressed', String(!value));
      const text = value === 'Demonstrated' ? 'Wet lab' : key === 'focus' ? ({Application:'Applications', 'General method':'Methods'}[value] || value || 'All') : value || 'All';
      if (key === 'wetlab' && value === 'Computational only') button.title = 'Includes computational-only studies and studies where wet-lab evidence was not reported.';
      if (key === 'applications' && value === 'Other') button.title = 'Carbohydrates, materials, graphs, general methods and other modalities.';
      if (key === 'applications' && value === 'Enzymes') button.title = 'Protein enzyme design, catalytic RNA design, and enzymatic mechanism generation. Specific tasks are distinguished in paper details.';
      button.innerHTML = `${value ? facetIcon(key,value) : ''}<span>${esc(text)}</span>`;
      button.addEventListener('click', () => {
        const selected = state.facets[key] || [];
        state.facets[key] = !value ? [] : selected.includes(value) ? selected.filter(v => v !== value) : [...selected,value];
        update();
      });
      choices.appendChild(button);
    });
    group.appendChild(choices);
    (['focus','wetlab'].includes(key) ? detailRow : filters).appendChild(group);
  });
  filters.appendChild(detailRow);
  const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, null];
  const years = $('#years');
  YEARS.forEach((y) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn';
    b.textContent = y == null ? 'All' : y;
    b.addEventListener('click', () => { state.year = y; update(); });
    years.appendChild(b);
  });
  $('#clearFilters').addEventListener('click', () => {
    state.cats = new Set(CATS.map(c => c.id)); state.facets = {}; state.year = null; state.query = ''; search.value = ''; update();
  });
  $('#downloadData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({...D,papers:PAPERS.filter(p => visible(p) && matches(p))},null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'biomolecular-design-papers.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });

  const search = $('#search');
  search.addEventListener('input', () => { state.query = search.value.trim(); update(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const hit = PAPERS.filter((p) => visible(p) && matches(p)).sort((a, b) => b.n - a.n)[0];
      if (hit) select(hit.id);
    } else if (e.key === 'Escape') { search.value = ''; state.query = ''; update(); }
  });

  $('#zoomIn').addEventListener('click', () => zoomAt(1.4, ...focusPoint()));
  $('#zoomOut').addEventListener('click', () => zoomAt(1 / 1.4, ...focusPoint()));
  $('#zoomReset').addEventListener('click', () => { const v = { ...view }; fitView(); const t = { ...view }; Object.assign(view, v); animateTo(t.S, t.TX, t.TY); });

  function syncControls() {
    legend.querySelectorAll('.legend-chip').forEach((b) => b.setAttribute('aria-pressed', String(state.cats.has(b.dataset.cat))));
    [...years.children].forEach((b, i) => b.setAttribute('aria-pressed', String(YEARS[i] === state.year)));
    filters.querySelectorAll('.facet-chip').forEach(button => {
      const selected = state.facets[button.dataset.facet] || [];
      button.setAttribute('aria-pressed', String(button.dataset.value ? selected.includes(button.dataset.value) : !selected.length));
    });
  }

  function update() {
    syncControls();
    if (state.sel && !visible(byId.get(state.sel))) deselect();
    const vis = PAPERS.filter(visible), shown = vis.filter(matches);
    $('#mapCount').textContent = shown.length === PAPERS.length ? `${PAPERS.length} papers · ${CATS.length} families`
      : `${shown.length} of ${PAPERS.length} papers`;
    $('#empty').hidden = shown.length > 0;
    $('#filterStatus').textContent = `${shown.length} papers shown · choose multiple within a group; groups combine`;
    $('#collectionMeta').textContent = `${PAPERS.length} papers · Last curated ${D.checked}.`;
    styleNodes();
    render();
    renderIndex();
  }

  // ── Pan, zoom, pinch ─────────────────────────────────────
  const drag = { on: false, moved: false, x: 0, y: 0, pts: new Map(), pinch: 0 };
  const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('wheel', (e) => {
    if (panel.contains(e.target)) return;
    e.preventDefault();
    cancelAnimationFrame(anim);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), ...local(e));
  }, { passive: false });
  stage.addEventListener('pointerdown', (e) => {
    if (panel.contains(e.target) || e.button > 0) return;
    cancelAnimationFrame(anim);
    drag.pts.set(e.pointerId, local(e));
    drag.on = true; drag.moved = false;
    [drag.x, drag.y] = local(e);
    if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()]; drag.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag.on || !drag.pts.has(e.pointerId)) return;
    const [x, y] = local(e);
    if (drag.pts.size === 2) {
      drag.pts.set(e.pointerId, [x, y]);
      const [a, b] = [...drag.pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (drag.pinch) zoomAt(d / drag.pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      drag.pinch = d; drag.moved = true;
      return;
    }
    const dx = x - drag.x, dy = y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { stage.setPointerCapture(e.pointerId); stage.classList.add('dragging'); hideTip(); }
    drag.moved = true;
    view.TX += dx; view.TY += dy; drag.x = x; drag.y = y;
    render();
  });
  const endDrag = (e) => {
    drag.pts.delete(e.pointerId);
    if (drag.pts.size === 0) { drag.on = false; drag.pinch = 0; stage.classList.remove('dragging'); }
    else { drag.pinch = 0; [drag.x, drag.y] = [...drag.pts.values()][0]; }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  svg.addEventListener('click', (e) => { if (!drag.moved && e.target === svg && state.sel) deselect(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.sel && document.activeElement !== search) deselect();
  });

  // ── Paper index (the table view) ─────────────────────────
  const indexEl = $('#index');
  function renderIndex() {
    const parts = CATS.map((c) => {
      const ps = PAPERS.filter((p) => p.cat === c.id && visible(p) && matches(p))
        .sort((a, b) => a.year - b.year || a.short.localeCompare(b.short));
      if (!ps.length) return '';
      const rows = ps.map((p) =>
        `<tr><td><button type="button" class="ix-model c-${p.cat}" data-id="${esc(p.id)}">${esc(p.short)}</button></td>` +
        `<td class="ix-title"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a><span class="ix-auth">${esc(authorLine(p.authors, 4))}</span><span class="ix-tags">${esc(p.applications.join(' · '))}${p.wetlab === 'Demonstrated' ? ' · Wet lab' : ''}</span></td>` +
        `<td class="ix-venue" title="${esc(p.venueFull || p.venue)}">${esc(p.venue)} ${p.year}</td></tr>`).join('');
      return `<div class="ix-group c-${c.id}"><h3>${icon(c.id)}${esc(c.label)}<span class="n">${ps.length}</span></h3>` +
        `<div class="table-wrap"><table><colgroup><col class="c-model"><col><col class="c-venue"></colgroup>` +
        `<thead><tr><th>Model</th><th>Paper</th><th class="ix-venue">Venue</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join('');
    indexEl.innerHTML = parts || '<p class="index-sub">No papers match the current filters.</p>';
  }
  indexEl.addEventListener('click', (e) => {
    const b = e.target.closest('.ix-model');
    if (b) select(b.dataset.id, { scroll: true });
  });

  // ── Boot ─────────────────────────────────────────────────
  function resize() {
    const r = stage.getBoundingClientRect();
    if (r.width === W && r.height === H) return;
    W = r.width; H = r.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    fitView();
    render();
  }
  measureAll();
  new ResizeObserver(() => resize()).observe(stage);
  resize();
  update();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureAll(); render(); });

  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (byId.has(fromHash)) select(fromHash);
})();
