// cover sampler and abstract diagram for the project page.
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const CAPTIONS = {
    flow: { eq: 'dx<sub>t</sub> = v<sub>t</sub>(x<sub>t</sub>) dt',
      text: 'A learned velocity field carries each sample along a smooth, deterministic path from noise to data. Training makes the model distribution p<sub>1</sub><sup>θ</sup> match the data in a continuous space.' },
    diffusion: { eq: 'dx<sub>t</sub> = b<sub>t</sub>(x<sub>t</sub>) dt + σ<sub>t</sub> dW<sub>t</sub>',
      text: 'Samples follow a stochastic process. A learned drift removes noise step by step, and a random term keeps the paths diverse.' },
    discrete: { eq: 'x → x′ at rate R<sub>t</sub>(x, x′)',
      text: 'For sequences such as amino acids or nucleotides, each position jumps between discrete tokens at learned rates, until the sequence matches the data distribution.' },
    steer: { eq: 'p*(x<sub>1</sub>) ∝ p<sub>1</sub><sup>θ</sup>(x<sub>1</sub>) e<sup>βR(x<sub>1</sub>)</sup>',
      text: 'The trained model stays fixed. During sampling, a reward signal adds a push to each path, so outputs tilt toward high-reward designs.' },
    shape: { eq: 'p*(x<sub>1</sub>) = p<sub>1</sub><sup>θ*</sup>(x<sub>1</sub>)',
      text: 'The model parameters change instead. Rounds of fine-tuning, θ<sub>0</sub> → θ<sub>1</sub> → … → θ*, move the generator until its own outputs follow the target distribution.' },
  };

  // ── cover: live sampler of the five mechanisms in the figure ──
  (() => {
    const root = document.getElementById('sampler');
    const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    const tabs = [...root.querySelectorAll('[data-mode]')];
    const cap = root.querySelector('.sm-caption'), extra = root.querySelector('.sm-extra');
    const STEPS = 120, K = 10;
    let mode = 'flow', beta = 3, round = 0, paths = [], t0 = 0, W = 0, H = 0, pick = 0;

    const randn = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
    const g = (x, m, s) => Math.exp(-.5 * ((x - m) / s) ** 2) / s;
    // each sample x1 is one candidate biomolecule, drawn from the set at the top of the figure.
    const MOLS = [{ name: 'Small molecules', short: 'Small mol.', icon: 'mol' }, { name: 'mRNA', short: 'mRNA', icon: 'rna' },
      { name: 'Peptides', short: 'Peptides', icon: 'pep' }, { name: 'Proteins', short: 'Proteins', icon: 'prot' }];
    const TOP = 170;
    const p1 = (x) => .55 * g(x, .3, .075) + .45 * g(x, .72, .06);
    const p0 = (x) => g(x, .5, .07);
    const tilted = (b) => (x) => p1(x) * Math.exp(b * (x - 1));
    const draw1 = () => (Math.random() < .55 ? .3 + .075 * randn() : .72 + .06 * randn());
    const drawTilted = (b) => { for (;;) { const x = draw1(); if (Math.random() < Math.exp(b * (x - 1))) return x; } };
    const clamp = (x) => Math.min(.99, Math.max(.01, x));
    const bin = (x) => Math.min(K - 1, Math.max(0, Math.floor(x * K)));
    const centre = (b) => (b + .5) / K;
    const targetBeta = () => (mode === 'steer' ? beta : 0);

    function build() {
      const b = targetBeta(), N = mode === 'discrete' ? 14 : 90;
      const x0 = Array.from({ length: N }, () => clamp(.5 + .07 * randn()));
      const x1 = Array.from({ length: N }, () => clamp(b ? drawTilted(b) : draw1()));
      if (mode === 'flow') { x0.sort((a, c) => a - c); x1.sort((a, c) => a - c); }
      paths = x0.map((a, i) => {
        const pts = [];
        if (mode === 'discrete') {
          const n = 1 + Math.floor(Math.random() * 3);
          const times = Array.from({ length: n }, Math.random).sort();
          const states = [Math.floor(Math.random() * K)];
          for (let j = 1; j < n; j++) states.push(Math.floor(Math.random() * K));
          states.push(bin(x1[i]));
          for (let k = 0; k <= STEPS; k++) pts.push(centre(states[times.filter((u) => u < k / STEPS).length]));
          return pts;
        }
        const sig = mode === 'diffusion' || mode === 'steer' ? .17 : 0;
        const w = [0];
        for (let k = 1; k <= STEPS; k++) w.push(w[k - 1] + randn() * Math.sqrt(1 / STEPS));
        for (let k = 0; k <= STEPS; k++) { const t = k / STEPS; pts.push(clamp((1 - t) * a + t * x1[i] + sig * (w[k] - t * w[STEPS]))); }
        return pts;
      });
      pick = Math.floor(Math.random() * N);
      t0 = performance.now();
    }

    function setMode(m) {
      mode = m;
      tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.mode === m)));
      const p = CAPTIONS[m];
      cap.innerHTML = `<span class="eq">${p.eq}</span>${p.text}`;
      if (m === 'steer') {
        extra.innerHTML = `<label for="beta">reward β</label><input id="beta" type="range" min="0" max="6" step=".5" value="${beta}"><output>${beta.toFixed(1)}</output>`;
        const r = extra.querySelector('input');
        r.addEventListener('input', () => { beta = +r.value; extra.querySelector('output').textContent = beta.toFixed(1); build(); });
      } else if (m === 'shape') {
        extra.innerHTML = '<span class="round-lab"></span><button class="chip">Fine-tune →</button>';
        extra.querySelector('button').addEventListener('click', () => startRound((round + 1) % REGIONS.length));
        startRound(0);
      } else if (m === 'flow') {
        extra.innerHTML = FLOW_STEPS.map((f, i) => `<button class="chip" data-fstep="${i}">${i + 1}. ${f.name}</button>`).join('');
        extra.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { flowAuto = false; startFlow(+b.dataset.fstep); }));
        flowAuto = true; startFlow(0);
      } else extra.innerHTML = '';
      build();
    }
    tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

    function curve(f, base, h, fillAlpha, stroke, dash) {
      const xs = Array.from({ length: 161 }, (_, i) => i / 160), ys = xs.map(f), m = Math.max(...ys);
      const X = (x) => 24 + x * (W - 48);
      ctx.beginPath(); ctx.moveTo(X(0), base);
      xs.forEach((x, i) => ctx.lineTo(X(x), base - h * ys[i] / m));
      ctx.lineTo(X(1), base);
      if (fillAlpha) { ctx.globalAlpha = fillAlpha; ctx.fillStyle = stroke; ctx.fill(); }
      ctx.globalAlpha = 1; ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = 1.6;
      ctx.beginPath(); xs.forEach((x, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(x), base - h * ys[i] / m)); ctx.stroke(); ctx.setLineDash([]);
    }
    function bars(f, base, h, alpha, color) {
      const vals = Array.from({ length: K }, (_, b) => { let s = 0; for (let j = 0; j < 10; j++) s += f((b + (j + .5) / 10) / K); return s; });
      const m = Math.max(...vals), bw = (W - 48) / K;
      vals.forEach((v, b) => { ctx.globalAlpha = alpha * (.45 + .55 * v / m); ctx.fillStyle = color; const hh = h * v / m; ctx.fillRect(24 + b * bw + 1, base - hh, bw - 2, hh); });
      ctx.globalAlpha = 1;
    }
    // distribution shaping, drawn like the figure panel: each fine-tuning round adds a smaller,
    // darker region inside the last one, and samples from p0 land in the newest region.
    const REGIONS = [
      { c: [.1, 0], r: .36, sx: 1.55, a: [.13, .09, .05], ph: [.4, 1.7, 2.9] },
      { c: [.25, -.03], r: .25, sx: 1.4, a: [.12, .08, .04], ph: [1.1, .3, 2.2] },
      { c: [.38, -.01], r: .155, sx: 1.3, a: [.1, .07, .03], ph: [2, 1.2, .5] },
      { c: [.47, .02], r: .075, sx: 1.25, a: [.08, .05, .02], ph: [.7, 2.4, 1.6] },
    ];
    const P0 = [-.6, .28], SUBS = ['₀', '₁', '₂', '*'];
    let sT0 = 0, flights = [];
    const ease = (t) => (t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
    const unit = () => Math.min(H * .95, W * .55);
    const toPx = ([x, y]) => [W / 2 + x * unit(), H / 2 - 6 + y * unit()];
    function rim(R, phi, f = 1) {
      const rr = R.r * f * (1 + R.a.reduce((s, a, i) => s + a * Math.cos((i + 1) * phi - R.ph[i]), 0));
      return [R.c[0] + rr * Math.cos(phi) * R.sx, R.c[1] + rr * Math.sin(phi)];
    }
    function blob(R, f) {
      ctx.beginPath();
      for (let j = 0; j <= 72; j++) { const [x, y] = toPx(rim(R, j / 72 * 2 * Math.PI, f)); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath();
    }
    function startRound(r) {
      round = r; sT0 = performance.now();
      if (r === 0) flights = [];
      flights[r] = Array.from({ length: 10 }, () => ({
        from: [P0[0] + (Math.random() - .5) * .05, P0[1] + (Math.random() - .5) * .03],
        to: rim(REGIONS[r], Math.random() * 2 * Math.PI, .2 + .6 * Math.sqrt(Math.random())),
      }));
      const lab = extra.querySelector('.round-lab');
      if (lab) lab.innerHTML = `round θ<sub>${SUBS[r]}</sub>`;
      const btn = extra.querySelector('button');
      if (btn) btn.textContent = r === REGIONS.length - 1 ? 'Restart ↺' : 'Fine-tune →';
    }
    function pLabel(x, y, sup, color) {
      ctx.fillStyle = color; ctx.textAlign = 'left';
      ctx.font = 'italic 19px Newsreader, Georgia, serif'; ctx.fillText('p', x, y);
      ctx.font = 'italic 12px Newsreader, Georgia, serif'; ctx.fillText('1', x + 10, y + 5); ctx.fillText(sup, x + 10, y - 9);
    }
    function curvePts(a, b, upto) {
      const [x0, y0] = toPx(a), [x1, y1] = toPx(b), mx = (x0 + x1) / 2 - (y1 - y0) * .25, my = (y0 + y1) / 2 + (x1 - x0) * -.25;
      const pts = [];
      for (let j = 0; j <= 30 * upto; j++) { const t = j / 30; pts.push([(1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1]); }
      return pts;
    }
    function polyline(pts) { ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    function arrowHead(pts, color) {
      if (pts.length < 2) return;
      const [x1, y1] = pts[pts.length - 1], [x0, y0] = pts[pts.length - 2], an = Math.atan2(y1 - y0, x1 - x0);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 7 * Math.cos(an - .45), y1 - 7 * Math.sin(an - .45)); ctx.lineTo(x1 - 7 * Math.cos(an + .45), y1 - 7 * Math.sin(an + .45)); ctx.fill();
    }
    function drawShape(now) {
      const el = reduced ? 1e9 : now - sT0;
      if (!reduced && el > 4200) startRound((round + 1) % REGIONS.length);
      const grow = ease(Math.min(1, el / 1000)), fly = ease(Math.min(1, Math.max(0, (el - 600) / 1500)));
      const lav = css('--lavender'), indigo = css('--indigo'), sky = css('--sky'), navy = css('--navy'), muted = css('--muted');
      const fills = [[lav, .5], [indigo, .42], [indigo, .5], [sky, .95]];
      // the regions so far; the newest one grows out of the region before it.
      for (let r = 0; r <= round; r++) {
        let R = REGIONS[r], f = 1;
        if (r === round && grow < 1) {
          const prev = REGIONS[Math.max(0, r - 1)];
          R = { ...R, c: [prev.c[0] + (R.c[0] - prev.c[0]) * grow, prev.c[1] + (R.c[1] - prev.c[1]) * grow] }; f = grow;
        }
        blob(R, f); ctx.globalAlpha = fills[r][1] * (r === round ? .3 + .7 * grow : 1); ctx.fillStyle = fills[r][0]; ctx.fill(); ctx.globalAlpha = 1;
      }
      // p0: a small ringed ellipse of noise.
      const [px, py] = toPx(P0), u = unit();
      [[1, .3], [.7, .5], [.4, .8]].forEach(([k, a]) => { ctx.globalAlpha = a; ctx.fillStyle = indigo; ctx.beginPath(); ctx.ellipse(px, py, .11 * u * k, .055 * u * k, 0, 0, 7); ctx.fill(); });
      ctx.globalAlpha = 1;
      ctx.fillStyle = indigo; ctx.font = 'italic 22px Newsreader, Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('p', px - 4, py + .1 * u + 18);
      ctx.font = 'italic 13px Newsreader, Georgia, serif'; ctx.fillText('0', px + 6, py + .1 * u + 23);
      // dotted sample paths from p0: older rounds faint, the current round drawing in.
      ctx.setLineDash([2, 4]); ctx.lineWidth = 1.4;
      flights.forEach((fs, r) => {
        if (!fs) return;
        const k = r === round ? fly : 1;
        if (!k) return;
        ctx.strokeStyle = r === round ? navy : muted; ctx.globalAlpha = r === round ? .75 : .25;
        fs.forEach((fl) => { const pts = curvePts(fl.from, fl.to, k); polyline(pts); if (r === round) { ctx.setLineDash([]); arrowHead(pts, navy); ctx.setLineDash([2, 4]); } });
      });
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      // labels and the dashed arrows between rounds.
      const at = REGIONS.map((R, r) => (r === REGIONS.length - 1 ? rim(R, -.2, 1.9) : rim(R, -2.35, .8)));
      for (let r = 0; r <= round; r++) {
        const vis = r === round ? grow : 1, [lx, ly] = toPx(at[r]);
        ctx.globalAlpha = vis; pLabel(lx - 8, ly + 6, 'θ' + SUBS[r], r ? '#fff' : navy);
        if (r > 0) {
          ctx.setLineDash([3, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          const a = [at[r - 1][0] + .05, at[r - 1][1] + .02], b = r === REGIONS.length - 1 ? rim(REGIONS[r], 3.6, .45) : [at[r][0] - .02, at[r][1] - .01], pts = curvePts(a, b, vis);
          polyline(pts); ctx.setLineDash([]); arrowHead(pts, '#fff');
        }
        ctx.globalAlpha = 1;
      }
      label(W > 520 ? 'fine-tuning moves the model itself:  p* = p₁ under θ*' : 'p* = p₁ under θ*', 24, 20, muted);
    }

    // flow matching in three steps: straight training interpolants, their average at a point,
    // and the marginal flow that follows the averaged velocity field.
    const FLOW_STEPS = [
      { name: 'Interpolants', eq: 'x<sub>t</sub> = (1 − t) x<sub>0</sub> + t x<sub>1</sub>',
        text: 'Training pairs a noise sample x<sub>0</sub> with a data sample x<sub>1</sub> and joins them with a straight line. Each line moves at a constant conditional velocity x<sub>1</sub> − x<sub>0</sub>. The lines cross, so many of them pass through the same point.' },
      { name: 'Average', eq: 'v<sub>t</sub>(x) = E[ x<sub>1</sub> − x<sub>0</sub> | x<sub>t</sub> = x ]',
        text: 'The network learns the average of the conditional velocities of all lines through a point. That average is the marginal velocity. Move the pointer over the plot to probe a point.' },
      { name: 'Marginal flow', eq: 'dx<sub>t</sub> = v<sub>t</sub>(x<sub>t</sub>) dt',
        text: 'Sampling follows the averaged field from noise to data. Unlike the training lines, these paths never cross, and they still end on the data distribution.' },
    ];
    const XS = Array.from({ length: 241 }, (_, i) => i / 240), LOGP = XS.map((x) => Math.log(p1(x)));
    let flowStep = 0, flowAuto = true, fT0 = 0, pairs = [], ode = [], probe = null;
    // marginal velocity for a gaussian source: average (x1 - x) / (1 - t) over the posterior of x1 given x_t = x.
    function vField(x, t) {
      t = Math.min(t, .985);
      const s = (1 - t) * .07, m = (1 - t) * .5, e = XS.map((x1, j) => LOGP[j] - .5 * ((x - m - t * x1) / s) ** 2), mx = Math.max(...e);
      let num = 0, den = 0;
      XS.forEach((x1, j) => { const w = Math.exp(e[j] - mx); num += w * (x1 - x); den += w; });
      return num / den / (1 - t);
    }
    function startFlow(i) {
      flowStep = i; fT0 = performance.now();
      if (i === 0 || !pairs.length) pairs = Array.from({ length: 60 }, () => [clamp(.5 + .07 * randn()), clamp(draw1())]);
      if (i === 2) {
        ode = Array.from({ length: 36 }, () => clamp(.5 + .07 * randn())).sort((a, c) => a - c).map((x) => {
          const pts = [x];
          for (let k = 0; k < STEPS; k++) { x += vField(x, k / STEPS) / STEPS; pts.push(x); }
          return pts;
        });
      }
      cap.innerHTML = `<span class="eq">${FLOW_STEPS[i].eq}</span>${FLOW_STEPS[i].text}`;
      extra.querySelectorAll('[data-fstep]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.fstep === i)));
    }
    cv.addEventListener('pointermove', (e) => {
      if (mode !== 'flow' || flowStep !== 1) return;
      const r = cv.getBoundingClientRect(), yTop = TOP, yBot = H - 64;
      probe = [Math.min(.97, Math.max(.03, (e.clientX - r.left - 24) / (W - 48))), Math.min(.92, Math.max(.06, (yBot - (e.clientY - r.top)) / (yBot - yTop)))];
    });
    cv.addEventListener('pointerleave', () => { probe = null; });
    function arrow(x, y, dx, dy, len, color, width, alpha) {
      const l = Math.hypot(dx, dy) || 1, ex = x + dx / l * len, ey = y + dy / l * len, an = Math.atan2(ey - y, ex - x), hd = 4 + width * 1.6;
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + Math.cos(an) * hd * .4, ey + Math.sin(an) * hd * .4);
      ctx.lineTo(ex - hd * Math.cos(an - .5), ey - hd * Math.sin(an - .5)); ctx.lineTo(ex - hd * Math.cos(an + .5), ey - hd * Math.sin(an + .5)); ctx.fill();
      ctx.globalAlpha = 1;
    }
    function drawFlow(now) {
      const el = reduced ? 1e9 : now - fT0;
      if (flowAuto && !reduced && el > [5200, 7600, 5200][flowStep]) startFlow((flowStep + 1) % 3);
      const sky = css('--sky'), indigo = css('--indigo'), lav = css('--lavender'), muted = css('--muted'), navy = css('--navy');
      const yTop = TOP, yBot = H - 64, X = (x) => 24 + x * (W - 48), Y = (t) => yBot - (yBot - yTop) * t;
      const vec = (v) => [v * (W - 48), -(yBot - yTop)];
      curve(p1, yTop, 70, .45, sky); curve(p0, yBot + 40, 40, .35, lav);
      label('data  p₁', 24, 20, muted); label('noise  p₀', 24, H - 6, muted);
      const grid = (alpha) => {
        for (let i = 1; i <= 11; i++) for (let j = 1; j <= 5; j++) {
          const x = i / 12, t = j / 6, [dx, dy] = vec(vField(x, t));
          arrow(X(x), Y(t), dx, dy, 15, sky, 1.3, alpha);
        }
      };
      if (flowStep === 0) {
        ctx.strokeStyle = indigo; ctx.lineWidth = 1;
        pairs.forEach(([a, b], i) => {
          const k = Math.min(1, Math.max(0, (el - i * 25) / 900));
          if (!k) return;
          ctx.globalAlpha = .4; ctx.beginPath(); ctx.moveTo(X(a), Y(0)); ctx.lineTo(X(a + (b - a) * k), Y(k)); ctx.stroke();
          ctx.globalAlpha = 1; ctx.fillStyle = navy; ctx.beginPath(); ctx.arc(X(a + (b - a) * k), Y(k), 2.2, 0, 7); ctx.fill();
        });
        ctx.globalAlpha = 1;
        targetSet(pairs[pick % pairs.length][1], Math.min(1, (el - 2400) / 400));
      } else if (flowStep === 1) {
        const [px, pt] = probe || [.5 + .27 * Math.sin(el / 1500), .5 + .22 * Math.sin(el / 2300 + 1)];
        const hits = pairs.filter(([a, b]) => Math.abs((1 - pt) * a + pt * b - px) < .045);
        grid(Math.min(1, Math.max(0, (el - 1500) / 1200)) * .55);
        ctx.lineWidth = 1;
        pairs.forEach(([a, b]) => {
          const on = hits.some((h) => h[0] === a && h[1] === b);
          ctx.globalAlpha = on ? .8 : .1; ctx.strokeStyle = on ? lav : indigo;
          ctx.beginPath(); ctx.moveTo(X(a), Y(0)); ctx.lineTo(X(b), Y(1)); ctx.stroke();
        });
        ctx.globalAlpha = 1;
        const cx = X(px), cy = Y(pt);
        ctx.strokeStyle = muted; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        hits.forEach(([a, b]) => { const [dx, dy] = vec(b - a); arrow(cx, cy, dx, dy, 52, lav, 1.4, .9); });
        const v = hits.length ? hits.reduce((s2, [a, b]) => s2 + b - a, 0) / hits.length : vField(px, pt), [dx, dy] = vec(v);
        arrow(cx, cy, dx, dy, 62, navy, 3.2, 1);
        ctx.fillStyle = navy; ctx.font = '12px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
        ctx.fillText(`average of ${hits.length} line${hits.length === 1 ? '' : 's'}`, Math.min(cx + 22, W - 170), cy + 30);
        targetSet(null, 0);
      } else {
        grid(.45);
        const k = Math.floor(Math.min(1, el / 2600) * STEPS);
        ctx.strokeStyle = indigo; ctx.lineWidth = 1.2; ctx.globalAlpha = .55;
        ode.forEach((p) => { ctx.beginPath(); ctx.moveTo(X(p[0]), Y(0)); for (let j = 1; j <= k; j++) ctx.lineTo(X(p[j]), Y(j / STEPS)); ctx.stroke(); });
        ctx.globalAlpha = 1; ctx.fillStyle = navy;
        ode.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[k]), Y(k / STEPS), 2.4, 0, 7); ctx.fill(); });
        targetSet(ode[pick % ode.length][STEPS], Math.min(1, (el - 2600) / 400));
      }
    }

    // a small glyph and name above each mode of p1.
    function glyph(kind, cx, cy, s, color) {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.beginPath();
      if (kind === 'mol') {
        for (let j = 0; j <= 6; j++) { const a = Math.PI / 6 + j * Math.PI / 3; ctx.lineTo(cx - s * .12 + s * .36 * Math.cos(a), cy + s * .36 * Math.sin(a)); }
        ctx.moveTo(cx - s * .12 + s * .31, cy - s * .18); ctx.lineTo(cx + s * .48, cy - s * .38);
      } else if (kind === 'rna') {
        for (let j = 0; j <= 40; j++) { const t = j / 40; ctx.lineTo(cx - s * .5 + s * t, cy + s * .18 * Math.sin(t * 4 * Math.PI)); }
        for (let j = 1; j < 8; j++) { const t = j / 8, y = cy + s * .18 * Math.sin(t * 4 * Math.PI); ctx.moveTo(cx - s * .5 + s * t, y); ctx.lineTo(cx - s * .5 + s * t, y + (Math.sin(t * 4 * Math.PI) > 0 ? -1 : 1) * s * .2); }
      } else if (kind === 'pep') {
        const pts = [0, 1, 2, 3].map((j) => [cx - s * .42 + j * s * .28, cy + (j % 2 ? -1 : 1) * s * .14]);
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.beginPath();
        pts.forEach(([x, y]) => { ctx.moveTo(x + s * .09, y); ctx.arc(x, y, s * .09, 0, 7); });
        ctx.fill(); return;
      } else {
        for (let j = 0; j <= 60; j++) { const t = j / 60, a = t * 5 * Math.PI; ctx.lineTo(cx - s * .45 + s * .9 * t + s * .1 * Math.cos(a), cy + s * .24 * Math.sin(a)); }
      }
      ctx.stroke();
    }
    // the set of biomolecules, with an arrow from one landed sample x1 into it.
    function targetSet(x1, alpha) {
      const navy = css('--navy'), muted = css('--muted'), rule = css('--rule'), card = css('--card'), narrow = W < 520;
      const bx0 = narrow ? 24 : W * .2, bx1 = narrow ? W - 24 : W * .8, by0 = 30, by1 = 84;
      ctx.fillStyle = card; ctx.strokeStyle = rule; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(bx0, by0, bx1 - bx0, by1 - by0, 8); ctx.fill(); ctx.stroke();
      MOLS.forEach((M, i) => {
        const x = bx0 + (bx1 - bx0) * (i + .5) / MOLS.length;
        glyph(M.icon, x, 50, narrow ? 22 : 26, navy);
        ctx.fillStyle = muted; ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText(narrow ? M.short : M.name, x, 76);
      });
      if (x1 == null || alpha <= 0) return;
      const sx = 24 + x1 * (W - 48), sy = TOP, ex = Math.min(bx1 - 30, Math.max(bx0 + 30, sx + (W / 2 - sx) * .25)), ey = by1 + 4;
      ctx.globalAlpha = alpha; ctx.strokeStyle = navy; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 7); ctx.stroke();
      // the head follows the curve's direction at its end, from the control point to the tip.
      const qx = sx, qy = (sy + ey) / 2, an = Math.atan2(ey - qy, ex - qx), hx = ex - 8 * Math.cos(an), hy = ey - 8 * Math.sin(an);
      ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(sx, sy - 9); ctx.quadraticCurveTo(qx, qy, hx, hy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = navy; ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 10 * Math.cos(an - .4), ey - 10 * Math.sin(an - .4)); ctx.lineTo(ex - 10 * Math.cos(an + .4), ey - 10 * Math.sin(an + .4)); ctx.fill();
      ctx.font = '12px "JetBrains Mono", monospace'; ctx.textAlign = sx > W / 2 ? 'right' : 'left';
      const tx = sx + (sx > W / 2 ? -14 : 14), ty = (sy + ey) / 2 + 12;
      ctx.strokeStyle = card; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeText('x₁ is a biomolecule', tx, ty);
      ctx.fillText('x₁ is a biomolecule', tx, ty);
      ctx.globalAlpha = 1;
    }

    function label(text, x, y, color, align) { ctx.fillStyle = color; ctx.font = '12px "JetBrains Mono", monospace'; ctx.textAlign = align || 'left'; ctx.fillText(text, x, y); }

    function frame(now) {
      const dur = 2600, hold = 1500;
      if (!reduced && now - t0 > dur + hold) build();
      const tau = reduced ? 1 : Math.min(1, (now - t0) / dur);
      const sky = css('--sky'), indigo = css('--indigo'), lav = css('--lavender'), muted = css('--muted'), navy = css('--navy');
      ctx.clearRect(0, 0, W, H);
      const yTop = TOP, yBot = H - 64, X = (x) => 24 + x * (W - 48), Y = (t) => yBot - (yBot - yTop) * t;
      if (mode === 'shape') { drawShape(now); if (!reduced) requestAnimationFrame(frame); return; }
      if (mode === 'flow') { drawFlow(now); if (!reduced) requestAnimationFrame(frame); return; }
      const b = targetBeta(), f = b ? tilted(b) : p1;
      if (mode === 'discrete') { bars(f, yTop, 60, .9, sky); bars(() => 1, yBot + 36, 28, .5, lav); }
      else {
        if (mode === 'steer') { curve(p1, yTop, 70, 0, muted, [4, 4]); curve((x) => Math.exp(beta * (x - 1)), yTop, 80, 0, lav, [2, 4]); }
        curve(f, yTop, 70, .25 + .35 * tau, sky);
        curve(p0, yBot + 40, 40, .35, lav);
      }
      targetSet(paths[pick] && paths[pick][STEPS], Math.min(1, (now - t0 - dur) / 400));
      label(mode === 'steer' ? 'p* (tilted by reward)' : 'data  p₁', 24, 20, muted);
      label(mode === 'discrete' ? 'tokens  (masked / uniform)' : 'noise  p₀', 24, H - 6, muted);
      if (mode === 'steer') label('e^{βR(x)}', W - 24, 20, lav, 'right');
      const k = Math.floor(tau * STEPS);
      ctx.lineWidth = mode === 'discrete' ? 2 : 1; ctx.strokeStyle = indigo; ctx.globalAlpha = mode === 'discrete' ? .75 : mode === 'diffusion' || mode === 'steer' ? .2 : .38;
      paths.forEach((p) => {
        ctx.beginPath(); ctx.moveTo(X(p[0]), Y(0));
        for (let j = 1; j <= k; j++) { if (mode === 'discrete') ctx.lineTo(X(p[j - 1]), Y(j / STEPS)); ctx.lineTo(X(p[j]), Y(j / STEPS)); }
        ctx.stroke();
      });
      ctx.globalAlpha = 1; ctx.fillStyle = navy;
      paths.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[k]), Y(k / STEPS), 2.4, 0, 7); ctx.fill(); });
      if (!reduced) requestAnimationFrame(frame);
    }
    function resize() {
      const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
      W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      if (reduced) frame(performance.now());
    }
    new ResizeObserver(resize).observe(cv);
    resize(); setMode('flow');
    if (!reduced) requestAnimationFrame(frame);
  })();

  // ── abstract: key phrases drive a small design-space diagram ──
  (() => {
    const root = document.getElementById('ds'), cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    const cap = root.querySelector('.ds-cap'), phrases = [...root.querySelectorAll('.ds-phrase')], dots = document.getElementById('ds-dots'), play = document.getElementById('ds-play');
    const CAPS = ['<b>Sparse data.</b> Grey dots are known biomolecules. Most of the space between them is unexplored.',
      '<b>Local search.</b> Traditional methods take small steps from molecules that already work.',
      '<b>No starting point.</b> A new target sits far from every known molecule, so local search cannot reach it.',
      '<b>Learned manifold.</b> A generative model learns the region where viable molecules live.',
      '<b>New samples.</b> Sampling the model turns noise into new candidates on the manifold, beyond the training data.',
      '<b>Control.</b> Steering moves the samples along the manifold toward the target.'];
    const seed = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const c = (s) => [.08 + .84 * s, .55 - .25 * Math.sin(Math.PI * (1.5 * s - .15))];
    const nrm = (s) => { const e = .001, [a, b] = c(s - e), [x, y] = c(s + e), l = Math.hypot(x - a, y - b); return [-(y - b) / l, (x - a) / l]; };
    const on = (s, u) => { const [x, y] = c(s), [nx, ny] = nrm(s); return [x + nx * u, y + ny * u]; };
    const data = [];
    [[.12, 7], [.22, 5], [.47, 6]].forEach(([s, n], k) => { for (let j = 0; j < n; j++) data.push(on(s + (seed(k * 9 + j) - .5) * .09, (seed(k * 9 + j + 50) - .5) * .07)); });
    const hops = data.filter((_, j) => j % 3 === 0).map((d, j) => [d, [d[0] + (seed(j + 70) - .5) * .09, d[1] + (seed(j + 90) - .5) * .09]]);
    const TARGET = on(.86, 0);
    const samples = Array.from({ length: 34 }, (_, j) => ({ s: .03 + .94 * seed(j + 200), u: (seed(j + 300) - .5) * .08, start: [seed(j + 400), seed(j + 500)] }));
    let step = 0, t0 = 0, W = 0, H = 0, timer = 0;
    CAPS.forEach((_, j) => { const d = document.createElement('button'); d.setAttribute('aria-label', 'Step ' + (j + 1)); d.addEventListener('click', () => { stopPlay(); set(j); }); dots.appendChild(d); });
    const ease = (t) => (t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
    function set(j) {
      step = j; t0 = performance.now(); cap.innerHTML = CAPS[j];
      phrases.forEach((p) => p.classList.toggle('is-active', +p.dataset.step === j));
      [...dots.children].forEach((d, k) => (k === j ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current')));
    }
    phrases.forEach((p) => {
      p.addEventListener('click', () => { stopPlay(); set(+p.dataset.step); });
      p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.click(); } });
    });
    // plays on its own while in view and loops; a reader's click on a phrase, dot or pause stops it.
    let userStopped = false;
    function stopPlay(byUser = true) { clearInterval(timer); timer = 0; play.textContent = '▶ Play'; if (byUser) userStopped = true; }
    function startPlay() {
      clearInterval(timer); userStopped = false; play.textContent = '❚❚ Pause';
      timer = setInterval(() => set((step + 1) % CAPS.length), 2600);
    }
    play.addEventListener('click', () => (timer ? stopPlay() : (set(0), startPlay())));
    if (!reduced) new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !timer && !userStopped) startPlay();
      else if (!e.isIntersecting && timer) stopPlay(false);
    }, { threshold: .4 }).observe(root);
    function frame(now) {
      const k = reduced ? 1 : Math.min(1, (now - t0) / 1300), e = ease(k), P = (pt) => [pt[0] * W, pt[1] * H];
      const muted = css('--muted'), indigo = css('--indigo'), sky = css('--sky'), lav = css('--lavender'), accent = css('--accent');
      const part = (j) => (step > j ? 1 : step === j ? e : 0);
      ctx.clearRect(0, 0, W, H);
      if (part(3)) {
        ctx.globalAlpha = .22 * part(3); ctx.strokeStyle = sky; ctx.lineCap = 'round'; ctx.lineWidth = .1 * H;
        ctx.beginPath(); for (let s = 0; s <= part(3); s += .01) { const [x, y] = P(c(s)); s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (part(1)) {
        ctx.strokeStyle = lav; ctx.fillStyle = lav; ctx.lineWidth = 1.4; ctx.globalAlpha = part(1);
        hops.forEach(([a, b]) => { const [x0, y0] = P(a), [x1, y1] = P(b); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * part(1), y0 + (y1 - y0) * part(1)); ctx.stroke(); ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * part(1), y0 + (y1 - y0) * part(1), 3, 0, 7); ctx.stroke(); });
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = muted; data.forEach((d) => { const [x, y] = P(d); ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.fill(); });
      if (part(2)) {
        const [tx, ty] = P(TARGET), a = part(2);
        ctx.globalAlpha = a; ctx.strokeStyle = accent; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(tx, ty, 16, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = accent; ctx.beginPath();
        for (let j = 0; j < 10; j++) { const r = j % 2 ? 3.5 : 8.5, an = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(tx + r * Math.cos(an), ty + r * Math.sin(an)); }
        ctx.fill(); ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('target', tx, ty - 22); ctx.globalAlpha = 1;
      }
      if (part(4)) {
        ctx.fillStyle = indigo;
        samples.forEach((sm) => {
          const s = part(5) ? sm.s + (.86 - sm.s) * .75 * part(5) * (sm.s < .86 ? 1 : .5) : sm.s;
          const goal = on(s, sm.u * (1 - .6 * part(5))), a = part(4);
          const [x, y] = P([sm.start[0] + (goal[0] - sm.start[0]) * a, sm.start[1] + (goal[1] - sm.start[1]) * a]);
          ctx.globalAlpha = .35 + .65 * a; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      requestAnimationFrame(frame);
    }
    function resize() { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
    new ResizeObserver(resize).observe(cv); resize(); set(0); requestAnimationFrame(frame);
  })();
})();
