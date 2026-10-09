// Isometric / 2.5D board for Cờ Thú.
//
// CTIso.render(opts) returns { svg, viewBox, cells, project } and touches no
// DOM, so the same code can be unit-tested in Node and dropped into the page.
// The game rules (cothu.js) never look at this file: it only draws.
//
// Coordinates: "logical" (x,y) is the game's own board position (x = column
// 0..6, y = row 0..8). "display" (di,dj) is where that cell lands on screen.
// They are the same unless opts.flip is on (view from the other side).
(function (root) {
  "use strict";

  const COLS = 7, ROWS = 9;
  const HL = 0.30;    // height of a land block's top (in cell widths)
  const HW = 0.08;    // height of the water surface (the river is sunken)
  const ZB = -0.40;   // bottom of the stone slab the board sits on
  const DAIS = 0.22;  // how far the jade den platform rises above the grass

  const OWNER = {
    top:    { main: "#d8442f", glow: "#f0715a", dark: "#8f2518" },
    bottom: { main: "#d1a92e", glow: "#f4d35e", dark: "#8a6b12" }
  };

  // ---- board layout (mirrors cothu.js) ----
  const isRiver = (x, y) => (x === 1 || x === 2 || x === 4 || x === 5) && y >= 3 && y <= 5;
  const isCauseway = (x, y) => x === 3 && y >= 3 && y <= 5;   // the land strip between the two rivers
  function denOwner(x, y) {
    if (x === 3 && y === 0) return "top";
    if (x === 3 && y === ROWS - 1) return "bottom";
    return null;
  }
  function trapOwner(x, y) {
    const t = [[2, 0], [4, 0], [3, 1]], b = [[2, 8], [4, 8], [3, 7]];
    if (t.some(p => p[0] === x && p[1] === y)) return "top";
    if (b.some(p => p[0] === x && p[1] === y)) return "bottom";
    return null;
  }

  // ---- small helpers ----
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r1 = n => Math.round(n * 10) / 10;
  const pts = arr => arr.map(p => r1(p[0]) + "," + r1(p[1])).join(" ");
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.max(0, Math.min(255, Math.round(v * k)));
    return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => c(v).toString(16).padStart(2, "0")).join("");
  }
  const LETTER = { rat: "R", cat: "C", dog: "D", wolf: "W", leopard: "P", tiger: "T", lion: "L", elephant: "E" };

  function render(opts) {
    const o = Object.assign({ yaw: 34, pitch: 50, scale: 64, flip: false, pieces: [], seed: 7, background: true, animate: true, croc: true }, opts || {});
    const th = o.yaw * Math.PI / 180, ph = o.pitch * Math.PI / 180;
    const cs = Math.cos(th), sn = Math.sin(th), sp = Math.sin(ph), cp = Math.cos(ph), S = o.scale;

    // ground (u,v) + height z  ->  screen (x,y)
    const P = (u, v, z) => [S * (u * cs - v * sn), S * (sp * (u * sn + v * cs) - cp * (z || 0))];
    const M = [S * cs, S * sp * sn, -S * sn, S * sp * cs];
    // flat shapes drawn in cell units (0..1 across a cell) lying on the ground at height z
    const decal = (u, v, z, inner) => {
      const e = P(u, v, z);
      return '<g transform="matrix(' + [M[0], M[1], M[2], M[3], e[0], e[1]].map(n => Math.round(n * 1000) / 1000).join(" ") + ')">' + inner + "</g>";
    };
    const flip = !!o.flip;
    const toLogical = (di, dj) => flip ? [COLS - 1 - di, ROWS - 1 - dj] : [di, dj];
    const toDisplay = toLogical; // the flip is its own inverse

    // ---- SMIL animation helpers (they return plain content / "" when opts.animate is false) ----
    const A = o.animate !== false;
    const f2 = n => Math.round(n * 100) / 100;
    const anim = (attr, values, dur, begin, extra) => A
      ? '<animate attributeName="' + attr + '" values="' + values + '" dur="' + f2(dur) + 's" begin="-' + f2(Math.abs(begin)) + 's" repeatCount="indefinite"' + (extra || "") + "/>" : "";
    const EASE = ' calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"';
    const swayG = (cx, cy, deg, dur, begin, content) => A
      ? '<g><animateTransform attributeName="transform" type="rotate" values="' + (-deg) + " " + f2(cx) + " " + f2(cy) + ";" + deg + " " + f2(cx) + " " + f2(cy) + ";" + (-deg) + " " + f2(cx) + " " + f2(cy) +
        '" dur="' + f2(dur) + 's" begin="-' + f2(Math.abs(begin)) + 's" repeatCount="indefinite"' + EASE + "/>" + content + "</g>" : content;
    const driftG = (dx, dy, dur, begin, content) => A
      ? '<g><animateTransform attributeName="transform" type="translate" values="0 0;' + dx + " " + dy + ';0 0" dur="' + f2(dur) + 's" begin="-' + f2(Math.abs(begin)) + 's" repeatCount="indefinite"' + EASE + "/>" + content + "</g>" : content;

    // vertical wall between two ground points, split into horizontal colour bands
    function vface(p0, p1, bands, mortar) {
      let s = "";
      bands.forEach(b => {
        s += '<polygon points="' + pts([P(p0[0], p0[1], b.z1), P(p1[0], p1[1], b.z1), P(p1[0], p1[1], b.z0), P(p0[0], p0[1], b.z0)]) + '" fill="' + b.fill + '"/>';
      });
      (mortar || []).forEach(z => {
        s += '<polyline points="' + pts([P(p0[0], p0[1], z), P(p1[0], p1[1], z)]) + '" stroke="rgba(0,0,0,0.22)" stroke-width="1.2" fill="none"/>';
      });
      return s;
    }
    function box(u0, v0, u1, v1, z0, z1, cTop, cSouth, cEast) {
      return vface([u0, v1], [u1, v1], [{ z0: z0, z1: z1, fill: cSouth }]) +
             vface([u1, v0], [u1, v1], [{ z0: z0, z1: z1, fill: cEast }]) +
             '<polygon points="' + pts([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)]) + '" fill="' + cTop + '"/>';
    }
    function wallBands(top, bottom, kind, k, edge) {
      const fringe = { z0: top - 0.05, z1: top, fill: shade("#4b9a37", k) };
      if (kind === "wall") return [fringe, { z0: bottom, z1: top - 0.05, fill: shade("#a3a7ad", k) }];
      const bands = [fringe, { z0: Math.max(bottom, 0), z1: top - 0.05, fill: shade("#8c5d3c", k) }];
      if (edge) bands.push({ z0: ZB, z1: 0, fill: shade("#9a9ca6", k) });
      return bands;
    }

    // wooden retaining wall along a river bank: vertical planks, seams and a rope strap
    function woodFace(p0, p1, top, bottom, k) {
      const lerp = t => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
      const zt = top - 0.05, N = 6;
      let s = vface(p0, p1, [
        { z0: zt, z1: top, fill: shade("#4b9a37", k) },
        { z0: bottom, z1: zt, fill: shade("#a9733f", k) }
      ]);
      for (let i = 0; i < N; i++) {
        if (i % 2 === 0) continue;
        const a = lerp(i / N), b = lerp((i + 1) / N);
        s += '<polygon points="' + pts([P(a[0], a[1], zt), P(b[0], b[1], zt), P(b[0], b[1], bottom), P(a[0], a[1], bottom)]) + '" fill="' + shade("#93602f", k) + '"/>';
      }
      for (let i = 1; i < N; i++) {
        const a = lerp(i / N);
        s += '<polyline points="' + pts([P(a[0], a[1], zt), P(a[0], a[1], bottom)]) + '" stroke="rgba(55,28,10,0.5)" stroke-width="1" fill="none"/>';
      }
      s += '<polyline points="' + pts([P(p0[0], p0[1], top * 0.5), P(p1[0], p1[1], top * 0.5)]) + '" stroke="rgba(45,22,8,0.55)" stroke-width="2" fill="none"/>';
      return s;
    }
    // log rail + posts along the top of land edges that touch the river
    function bankTrim(di, dj, nW, wW, sW, eW) {
      const LOG = (u0, v0, u1, v1) => box(u0, v0, u1, v1, HL, HL + 0.045, "#c99557", "#a9733f", "#8a5a30");
      const done = {};
      const POST = (u, v) => {
        const key = r1(u) + "," + r1(v);
        if (done[key]) return "";
        done[key] = 1;
        return box(u, v, u + 0.1, v + 0.1, HL, HL + 0.17, "#b07a45", "#8a5a30", "#6f4624") +
               box(u - 0.015, v - 0.015, u + 0.115, v + 0.115, HL + 0.17, HL + 0.2, "#dcaa6a", "#b98750", "#9c703f");
      };
      let s = "";
      if (nW) s += LOG(di, dj, di + 1, dj + 0.09);
      if (wW) s += LOG(di, dj, di + 0.09, dj + 1);
      if (nW) s += POST(di, dj) + POST(di + 0.9, dj);
      if (wW) s += POST(di, dj) + POST(di, dj + 0.9);
      if (sW) s += LOG(di, dj + 0.91, di + 1, dj + 1) + POST(di, dj + 0.9) + POST(di + 0.9, dj + 0.9);
      if (eW) s += LOG(di + 0.91, dj, di + 1, dj + 1) + POST(di + 0.9, dj) + POST(di + 0.9, dj + 0.9);
      return s;
    }

    // ---------------------------------------------------------------- cells
    const pieceAt = {};
    (o.pieces || []).forEach(p => { pieceAt[p.x + "," + p.y] = p; });
    const cells = {};

    function grassDecor(di, dj, h, rand) {
      let s = "";
      s += decal(di, dj, h, '<circle cx="' + r1(0.25 + rand() * 0.5) + '" cy="' + r1(0.25 + rand() * 0.5) + '" r="' + r1(0.14 + rand() * 0.08) + '" fill="#4f9a3b" opacity="0.28"/>');
      const tufts = rand() < 0.55 ? 1 + (rand() < 0.4 ? 1 : 0) : 0;
      for (let t = 0; t < tufts; t++) {
        const u = di + 0.12 + rand() * 0.76, v = dj + 0.12 + rand() * 0.76;
        const b = P(u, v, h);
        const tuft = '<path d="M' + r1(b[0] - 3) + " " + r1(b[1]) + " L" + r1(b[0] - 4.5) + " " + r1(b[1] - 8) + " L" + r1(b[0] - 0.8) + " " + r1(b[1] - 3.5) +
             " L" + r1(b[0]) + " " + r1(b[1] - 10) + " L" + r1(b[0] + 1.6) + " " + r1(b[1] - 3.5) + " L" + r1(b[0] + 4.6) + " " + r1(b[1] - 7.5) + " L" + r1(b[0] + 3) + " " + r1(b[1]) + ' Z" fill="#3f8a33" stroke="#2f6e28" stroke-width="0.6"/>';
        // blades lean in the wind; the phase depends on position so the field ripples instead of moving as one
        s += swayG(b[0], b[1], 5, 2.2 + ((u * 3 + v * 5) % 1.7), (u * 1.3 + v * 0.9) % 3, tuft);
      }
      if (rand() < 0.28) {
        const u = di + 0.15 + rand() * 0.7, v = dj + 0.15 + rand() * 0.7;
        const b = P(u, v, h), col = ["#ffd1e8", "#ffffff", "#ffe066"][Math.floor(rand() * 3)];
        s += '<circle cx="' + r1(b[0]) + '" cy="' + r1(b[1] - 2) + '" r="2.2" fill="' + col + '"/><circle cx="' + r1(b[0]) + '" cy="' + r1(b[1] - 2) + '" r="0.9" fill="#f2a900"/>';
      }
      return s;
    }

    // a trap is a real pit sunk into a stone-paved tile, with spikes and a glowing owner rune at the bottom
    function trapTerrain(di, dj, owner, topFill) {
      const c = OWNER[owner];
      const a = 0.16, b = 0.84, zF = HL - 0.11;
      const sq = (u0, v0, u1, v1, z) => pts([P(di + u0, dj + v0, z), P(di + u1, dj + v0, z), P(di + u1, dj + v1, z), P(di + u0, dj + v1, z)]);
      let s = "";
      // paving cracks on the rim
      s += decal(di, dj, HL,
        '<path d="M0.04 0.1 L0.1 0.04 M0.9 0.04 L0.96 0.12 M0.05 0.92 L0.12 0.97 M0.88 0.95 L0.95 0.88" stroke="rgba(40,30,20,0.45)" stroke-width="0.018" fill="none" stroke-linecap="round"/>' +
        '<circle cx="0.08" cy="0.5" r="0.03" fill="#6e5f45" opacity="0.7"/><circle cx="0.92" cy="0.5" r="0.03" fill="#6e5f45" opacity="0.7"/>');
      // pit floor
      s += '<polygon points="' + sq(a, a, b, b, zF) + '" fill="#2a2030"/>';
      // inner walls that face the camera (north and west sides of the pit)
      s += vface([di + a, dj + a], [di + b, dj + a], [{ z0: zF, z1: HL, fill: "#6d6272" }], [(zF + HL) / 2]);
      s += vface([di + a, dj + a], [di + a, dj + b], [{ z0: zF, z1: HL, fill: "#554b5c" }], [(zF + HL) / 2]);
      // glowing rune
      s += decal(di, dj, zF,
        '<g>' + anim("opacity", "1;0.5;1", 2.4, di * 0.7 + dj * 0.4) +
        '<circle cx="0.5" cy="0.5" r="0.27" fill="' + c.main + '" opacity="0.30"/>' +
        '<circle cx="0.5" cy="0.5" r="0.22" fill="none" stroke="' + c.glow + '" stroke-width="0.03" opacity="0.9"/>' +
        '<path d="M0.5 0.3 L0.55 0.45 L0.7 0.5 L0.55 0.55 L0.5 0.7 L0.45 0.55 L0.3 0.5 L0.45 0.45 Z" fill="' + c.glow + '" opacity="0.75"/></g>');
      // spikes
      [[0.34, 0.4], [0.62, 0.36], [0.5, 0.56], [0.35, 0.66], [0.66, 0.64]].forEach(sp2 => {
        const bp = P(di + sp2[0], dj + sp2[1], zF), w = S * 0.04, hgt = S * 0.15;
        s += '<polygon points="' + pts([[bp[0] - w, bp[1]], [bp[0] + w, bp[1]], [bp[0], bp[1] - hgt]]) + '" fill="#d7dbe4" stroke="#4a4e5a" stroke-width="0.9" stroke-linejoin="round"/>' +
             '<polygon points="' + pts([[bp[0] + w * 0.1, bp[1]], [bp[0] + w, bp[1]], [bp[0], bp[1] - hgt]]) + '" fill="#9aa0ae"/>';
      });
      // a previous victim at the bottom of the pit
      s += skullShape(di + 0.27, dj + 0.3, zF, 0.8, owner === "top" ? -12 : 10);
      // redraw the near rim (south + east strips) so it hides the far part of the pit floor
      s += '<polygon points="' + sq(0, b, 1, 1, HL) + '" fill="' + topFill + '"/>';
      s += '<polygon points="' + sq(b, 0, 1, b, HL) + '" fill="' + topFill + '"/>';
      // lip highlight around the opening
      s += '<polyline points="' + pts([P(di + a, dj + b, HL), P(di + b, dj + b, HL), P(di + b, dj + a, HL)]) + '" stroke="rgba(255,255,255,0.28)" stroke-width="1.4" fill="none" stroke-linejoin="round"/>';
      s += '<polyline points="' + pts([P(di + a, dj + b, HL), P(di + a, dj + a, HL), P(di + b, dj + a, HL)]) + '" stroke="rgba(0,0,0,0.35)" stroke-width="1.2" fill="none" stroke-linejoin="round"/>';
      // mossy corner stones
      [[0.02, 0.02], [0.84, 0.02], [0.02, 0.84], [0.84, 0.84]].forEach(cn => {
        s += box(di + cn[0], dj + cn[1], di + cn[0] + 0.14, dj + cn[1] + 0.14, HL, HL + 0.05, "#a39a86", "#7f7765", "#6a6354");
        s += decal(di + cn[0], dj + cn[1], HL + 0.05, '<circle cx="0.05" cy="0.05" r="0.05" fill="#4f9a3b" opacity="0.7"/>');
      });
      return s;
    }

    // ------------------------------------------------------------------ jade den
    const JADE = { base: "#a9dcc8", baseS: "#6db39a", baseE: "#59997f", top: "#8cebc3", south: "#3fb088", east: "#2d8f6b", dark: "#1d6a4f", gold: "#f0cf6a" };
    // pale sheen across the upper part of the south face, plus a gold lip along the front edges of a tier
    function jadeSheen(u0, v0, u1, v1, z0, z1) {
      const zs = z1 - (z1 - z0) * 0.4;
      return '<polygon points="' + pts([P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, zs), P(u0, v1, zs)]) + '" fill="#fff" opacity="0.2"/>' +
             '<polyline points="' + pts([P(u0, v1, z1), P(u1, v1, z1), P(u1, v0, z1)]) + '" stroke="' + JADE.gold + '" stroke-width="1.5" fill="none" stroke-linejoin="round"/>';
    }

    function denStructure(di, dj, owner) {
      const c = OWNER[owner];
      const z1 = HL + 0.09, zT = HL + DAIS;
      // the den on the viewer's side (bottom of the screen) must not have steps leading off the board edge,
      // so its steps face the board (away from the camera); the far den keeps them on the camera-facing side
      const near = dj === ROWS - 1;
      const tv0 = near ? 0.16 : 0.12, tv1 = near ? 0.88 : 0.84, cy = (tv0 + tv1) / 2;
      let s = box(di + 0.03, dj + 0.03, di + 0.97, dj + 0.97, HL, z1, JADE.base, JADE.baseS, JADE.baseE);
      s += jadeSheen(di + 0.03, dj + 0.03, di + 0.97, dj + 0.97, HL, z1);
      if (near) {
        s += box(di + 0.3, dj + 0.03, di + 0.7, dj + 0.09, z1, z1 + 0.045, JADE.top, JADE.south, JADE.east);
        s += box(di + 0.3, dj + 0.09, di + 0.7, dj + 0.16, z1, z1 + 0.09, JADE.top, JADE.south, JADE.east);
      }
      s += box(di + 0.12, dj + tv0, di + 0.88, dj + tv1, z1, zT, JADE.top, JADE.south, JADE.east);
      s += jadeSheen(di + 0.12, dj + tv0, di + 0.88, dj + tv1, z1, zT);
      if (!near) {
        s += box(di + 0.3, dj + 0.84, di + 0.7, dj + 0.9, z1, z1 + 0.09, JADE.top, JADE.south, JADE.east);
        s += box(di + 0.3, dj + 0.9, di + 0.7, dj + 0.97, z1, z1 + 0.045, JADE.top, JADE.south, JADE.east);
      }
      // owner-coloured seal on the top
      s += decal(di, dj, zT,
        '<circle cx="0.5" cy="' + cy + '" r="0.3" fill="' + c.main + '" opacity="0.28"/>' +
        '<circle cx="0.5" cy="' + cy + '" r="0.3" fill="none" stroke="' + c.glow + '" stroke-width="0.04"/>' +
        '<circle cx="0.5" cy="' + cy + '" r="0.2" fill="none" stroke="' + JADE.gold + '" stroke-width="0.02"/>' +
        '<path d="M0.5 ' + f2(cy - 0.28) + ' L0.57 ' + f2(cy - 0.07) + ' L0.78 ' + cy + ' L0.57 ' + f2(cy + 0.07) + ' L0.5 ' + f2(cy + 0.28) + ' L0.43 ' + f2(cy + 0.07) + ' L0.22 ' + cy + ' L0.43 ' + f2(cy - 0.07) + ' Z" fill="' + c.glow + '" opacity="0.8"/>');
      // banner on a pole in the middle of the den: always faces the viewer, so it is drawn in screen space and waves
      const pb = P(di + 0.5, dj + cy, zT), pt = P(di + 0.5, dj + cy, zT + 1.05);
      const k = S / 64, fw = 30 * k, fh = 19 * k, fx = pt[0] + 1.2, fy = pt[1] + 4 * k;
      const flagD = a => "M" + r1(fx) + " " + r1(fy) + " C" + r1(fx + fw * 0.3) + " " + r1(fy - a) + "," + r1(fx + fw * 0.7) + " " + r1(fy + a) + "," + r1(fx + fw) + " " + r1(fy + a * 0.3) +
        " L" + r1(fx + fw) + " " + r1(fy + fh + a * 0.3) + " C" + r1(fx + fw * 0.7) + " " + r1(fy + fh + a) + "," + r1(fx + fw * 0.3) + " " + r1(fy + fh - a) + "," + r1(fx) + " " + r1(fy + fh) + " Z";
      const wave = anim("d", [flagD(4 * k), flagD(-4 * k), flagD(4 * k)].join(";"), 2.2, ox0(di, dj));
      const ecx = fx + fw * 0.5, ecy = fy + fh * 0.5, er = fh * 0.22;
      s += '<line x1="' + r1(pb[0]) + '" y1="' + r1(pb[1]) + '" x2="' + r1(pt[0]) + '" y2="' + r1(pt[1]) + '" stroke="#3a2a14" stroke-width="' + r1(4.6 * k) + '" stroke-linecap="round"/>' +
           '<line x1="' + r1(pb[0]) + '" y1="' + r1(pb[1]) + '" x2="' + r1(pt[0]) + '" y2="' + r1(pt[1]) + '" stroke="#e1cf94" stroke-width="' + r1(2.6 * k) + '" stroke-linecap="round"/>' +
           '<path d="' + flagD(4 * k) + '" fill="' + c.main + '" stroke="' + JADE.gold + '" stroke-width="' + r1(1.8 * k) + '" stroke-linejoin="round">' + wave + "</path>" +
           '<circle cx="' + r1(ecx) + '" cy="' + r1(ecy) + '" r="' + r1(fh * 0.3) + '" fill="none" stroke="' + JADE.gold + '" stroke-width="' + r1(1.3 * k) + '"/>' +
           '<path d="M' + r1(ecx) + " " + r1(ecy - er) + " L" + r1(ecx + er) + " " + r1(ecy) + " L" + r1(ecx) + " " + r1(ecy + er) + " L" + r1(ecx - er) + " " + r1(ecy) + ' Z" fill="' + JADE.gold + '"/>' +
           '<circle cx="' + r1(pt[0]) + '" cy="' + r1(pt[1] - 1.5 * k) + '" r="' + r1(3.4 * k) + '" fill="' + JADE.gold + '" stroke="#7a5d14" stroke-width="1"/>';
      // jade sparkle
      [[0.3, 0.3], [0.7, 0.45], [0.5, 0.68]].forEach((q, i) => {
        const t = P(di + q[0], dj + q[1], zT);
        s += '<circle cx="' + r1(t[0]) + '" cy="' + r1(t[1]) + '" r="1.8" fill="#fff" opacity="' + (A ? 0 : 0.6) + '">' + anim("opacity", "0;1;0", 2.4 + i * 0.5, i * 0.9) + "</circle>";
      });
      return s;
    }
    const ox0 = (di, dj) => di * 0.7 + dj * 0.4;   // animation phase offset

    // ------------------------------------------------------------------ wooden bridge (the middle strip between the rivers)
    // side wall under the deck: a beam, two piles and a cross brace, standing in the water
    function bridgeFace(p0, p1, top, k) {
      const lerp = t => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
      const zb = top - 0.09;
      let s = vface(p0, p1, [{ z0: zb, z1: top, fill: shade("#8f5e30", k) }, { z0: 0, z1: zb, fill: shade("#5a3a20", k) }]);
      [[0, 0.11], [0.89, 1]].forEach(r => {
        const a = lerp(r[0]), b = lerp(r[1]);
        s += '<polygon points="' + pts([P(a[0], a[1], zb), P(b[0], b[1], zb), P(b[0], b[1], 0), P(a[0], a[1], 0)]) + '" fill="' + shade("#7f5532", k) + '" stroke="rgba(30,15,5,0.5)" stroke-width="1"/>';
      });
      const a = lerp(0.11), b = lerp(0.89);
      s += '<polyline points="' + pts([P(a[0], a[1], zb), P(b[0], b[1], 0.02)]) + '" stroke="#a87c48" stroke-width="2.2" fill="none"/>' +
           '<polyline points="' + pts([P(a[0], a[1], 0.02), P(b[0], b[1], zb)]) + '" stroke="#a87c48" stroke-width="2.2" fill="none"/>' +
           '<polyline points="' + pts([P(p0[0], p0[1], top), P(p1[0], p1[1], top)]) + '" stroke="rgba(255,220,160,0.55)" stroke-width="1.4" fill="none"/>';
      return s;
    }
    // planks laid across the deck, nails, knots, and a side beam on each edge
    function bridgeDecal(di, dj, rand) {
      let s = '<rect x="0" y="0" width="0.08" height="1" fill="#8f5e30"/><rect x="0.92" y="0" width="0.08" height="1" fill="#8f5e30"/>';
      for (let i = 0; i < 8; i++) {
        const y = f2(i * 0.125);
        s += '<rect x="0.08" y="' + y + '" width="0.84" height="0.125" fill="' + (i % 2 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)") + '"/>' +
             '<line x1="0.08" y1="' + y + '" x2="0.92" y2="' + y + '" stroke="rgba(50,28,10,0.55)" stroke-width="0.012"/>' +
             '<circle cx="0.125" cy="' + f2(i * 0.125 + 0.0625) + '" r="0.011" fill="#4a3320"/><circle cx="0.875" cy="' + f2(i * 0.125 + 0.0625) + '" r="0.011" fill="#4a3320"/>';
      }
      for (let i = 0; i < 2; i++) {
        s += '<ellipse cx="' + f2(0.2 + rand() * 0.6) + '" cy="' + f2(0.1 + rand() * 0.8) + '" rx="0.03" ry="0.018" fill="none" stroke="rgba(60,35,15,0.5)" stroke-width="0.01"/>';
      }
      return decal(di, dj, HL, s);
    }
    // low rails along both edges with a post at the start of each cell (and one at the far end of the last cell)
    function bridgeTrim(di, dj, last) {
      const POST = (u, v) => box(u, v, u + 0.09, v + 0.09, HL, HL + 0.26, "#a0693a", "#7d5230", "#64401f") +
                             box(u - 0.012, v - 0.012, u + 0.102, v + 0.102, HL + 0.26, HL + 0.29, "#d9a965", "#b68648", "#9a6f36");
      const RAIL = u => box(u, dj, u + 0.05, dj + 1, HL + 0.17, HL + 0.21, "#c58f52", "#a0693a", "#7d5230") +
                        box(u, dj, u + 0.05, dj + 1, HL + 0.08, HL + 0.11, "#b07a45", "#8a5a30", "#6f4624");
      let s = RAIL(di + 0.01) + POST(di, dj) + (last ? POST(di, dj + 0.91) : "");
      s += RAIL(di + 0.94) + POST(di + 0.91, dj) + (last ? POST(di + 0.91, dj + 0.91) : "");
      return s;
    }

    function waterCell(di, dj, x, y, rand) {
      const par = (x + y) % 2;
      let s = '<polygon points="' + pts([P(di, dj, HW), P(di + 1, dj, HW), P(di + 1, dj + 1, HW), P(di, dj + 1, HW)]) + '" fill="' + (par ? "#3fb2d4" : "#47bddc") + '"/>';
      const landN = dj > 0 && !isRiver(...toLogical(di, dj - 1));
      const landW = di > 0 && !isRiver(...toLogical(di - 1, dj));
      let shadows = "";
      if (landN) shadows += '<rect x="0" y="0" width="1" height="0.32" fill="rgba(6,50,84,0.38)"/>';
      if (landW) shadows += '<rect x="0" y="0" width="0.28" height="1" fill="rgba(6,50,84,0.30)"/>';
      let ripples = "";
      for (let i = 0; i < 2; i++) {
        const rx = 0.2 + rand() * 0.55, ry = 0.3 + rand() * 0.5;
        ripples += '<path d="M' + f2(rx) + " " + f2(ry) + " q0.07 -0.05 0.14 0 q0.07 0.05 0.14 0" + '" stroke="rgba(255,255,255,0.55)" stroke-width="0.022" fill="none" stroke-linecap="round"/>';
      }
      ripples += '<circle cx="' + r1(0.2 + rand() * 0.6) + '" cy="' + r1(0.2 + rand() * 0.6) + '" r="0.015" fill="#fff" opacity="0.8"/>';
      // animation: ripples drift and fade, a soft shimmer pulses, bright glints slide across (all clipped to this cell)
      const ph = rand() * 6, ph2 = rand() * 6;
      let glints = "";
      if (A) {
        for (let g = 0; g < 2; g++) {
          const gy = 0.2 + rand() * 0.6, gd = 3 + rand() * 3, gb = rand() * 6;
          glints += '<ellipse cx="0.05" cy="' + f2(gy) + '" rx="0.11" ry="0.012" fill="#fff" opacity="0">' +
            anim("cx", "0.02;0.98", gd, gb) + anim("opacity", "0;0.8;0", gd, gb) + "</ellipse>";
        }
      }
      const shimmer = A ? '<rect width="1" height="1" fill="#fff" opacity="0">' + anim("opacity", "0;0.12;0", 3.2 + ph / 3, ph) + "</rect>" : "";
      s += decal(di, dj, HW, '<g clip-path="url(#ctIsoCell)">' + shadows + shimmer +
        driftG(0.1, 0.03, 4 + ph / 2, ph2, "<g>" + anim("opacity", "1;0.45;1", 3 + ph / 2, ph2) + ripples + "</g>") + glints + "</g>");
      if (landN) s += '<polyline points="' + pts([P(di, dj, HW), P(di + 1, dj, HW)]) + '" stroke="rgba(255,255,255,0.7)" stroke-width="2" fill="none" stroke-linecap="round">' + anim("opacity", "1;0.45;1", 2.6, ph) + "</polyline>";
      if (landW) s += '<polyline points="' + pts([P(di, dj, HW), P(di, dj + 1, HW)]) + '" stroke="rgba(255,255,255,0.6)" stroke-width="2" fill="none" stroke-linecap="round">' + anim("opacity", "1;0.45;1", 2.9, ph2) + "</polyline>";
      return s;
    }

    function pieceShape(p, di, dj, h) {
      const c = OWNER[p.owner];
      const cx = di + 0.5, cy = dj + 0.5;
      const b = P(cx, cy, h), u = S * cp; // u = one cell-height in pixels
      let s = decal(cx - 0.5, cy - 0.5, h,
        '<ellipse cx="0.56" cy="0.58" rx="0.3" ry="0.26" fill="rgba(0,0,0,0.30)"/>' +
        '<circle cx="0.5" cy="0.5" r="0.29" fill="' + c.dark + '" stroke="#2b160c" stroke-width="0.025"/>' +
        '<circle cx="0.5" cy="0.5" r="0.23" fill="' + c.main + '"/>');
      const baseY = b[1] - 0.04 * u, bw = S * 0.17;
      s += '<path d="M' + r1(b[0] - bw) + " " + r1(baseY) + " Q" + r1(b[0] - bw * 0.9) + " " + r1(baseY - 0.4 * u) + " " + r1(b[0] - bw * 0.35) + " " + r1(baseY - 0.62 * u) +
           " L" + r1(b[0] + bw * 0.35) + " " + r1(baseY - 0.62 * u) + " Q" + r1(b[0] + bw * 0.9) + " " + r1(baseY - 0.4 * u) + " " + r1(b[0] + bw) + " " + r1(baseY) +
           ' Z" fill="' + c.main + '" stroke="#2b160c" stroke-width="1.6" stroke-linejoin="round"/>';
      const hy = baseY - 0.8 * u, hr = S * 0.15;
      s += '<circle cx="' + r1(b[0]) + '" cy="' + r1(hy) + '" r="' + r1(hr) + '" fill="' + c.glow + '" stroke="#2b160c" stroke-width="1.6"/>' +
           '<circle cx="' + r1(b[0] - hr * 0.35) + '" cy="' + r1(hy - hr * 0.35) + '" r="' + r1(hr * 0.28) + '" fill="#fff" opacity="0.55"/>' +
           '<text x="' + r1(b[0]) + '" y="' + r1(hy + hr * 0.38) + '" font-family="Arial, sans-serif" font-size="' + r1(hr * 1.05) + '" font-weight="700" text-anchor="middle" fill="#2b160c">' + (LETTER[p.type] || "?") + "</text>";
      return s;
    }

    // ------------------------------------------------------------ terrain relief, cracks, bones
    // Open grass is lumpy: some cells sit higher, some lower. River banks, the causeway, traps and dens stay at the
    // standard height so the wooden walls, pits and dais line up. Heights depend on the logical (x,y), so flipping the view keeps them.
    function cellHeight(x, y) {
      if (isRiver(x, y)) return HW;
      if (isCauseway(x, y) || denOwner(x, y) || trapOwner(x, y)) return HL;
      if (isRiver(x - 1, y) || isRiver(x + 1, y) || isRiver(x, y - 1) || isRiver(x, y + 1)) return HL;
      if (isCauseway(x, y - 1) || isCauseway(x, y + 1)) return HL;   // the cells at the two ends of the bridge stay level with the deck
      const r = rng(o.seed * 777 + x * 29 + y * 53)();
      return HL + (r < 0.25 ? -0.07 : r < 0.6 ? 0 : r < 0.85 ? 0.06 : 0.11);
    }
    function nearTrap(x, y) {
      if (trapOwner(x, y) || denOwner(x, y)) return false;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (trapOwner(x + dx, y + dy)) return true;
      return false;
    }
    function crackD(cr, u, v, ang, len, depth) {
      let out = "M" + f2(u) + " " + f2(v), cu = u, cv = v, a = ang;
      const n = 4;
      for (let i = 0; i < n; i++) {
        a += (cr() - 0.5) * 1.1;
        cu += Math.cos(a) * len / n; cv += Math.sin(a) * len / n;
        out += " L" + f2(cu) + " " + f2(cv);
        if (depth > 0 && i > 0 && cr() < 0.45) out += " " + crackD(cr, cu, cv, a + (cr() < 0.5 ? 1 : -1) * (0.6 + cr() * 0.5), len * 0.5, depth - 1);
      }
      return out;
    }
    function crackInner(cr, strong) {
      let s = "";
      const count = strong ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const d = crackD(cr, 0.2 + cr() * 0.6, 0.2 + cr() * 0.6, cr() * Math.PI * 2, 0.42 + cr() * 0.3, 1);
        s += '<path d="' + d + '" transform="translate(0.012 0.016)" stroke="rgba(255,255,255,0.2)" stroke-width="0.014" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
             '<path d="' + d + '" stroke="rgba(28,36,16,0.6)" stroke-width="0.03" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
      }
      return '<g clip-path="url(#ctIsoCell)">' + s + "</g>";
    }
    // a bone lying flat (cell units): shaft with a pair of knobs at each end
    function boneInner(cx, cy, ang, len) {
      const knob = (sx) => '<circle cx="' + f2(sx * len) + '" cy="-0.022" r="0.032"/><circle cx="' + f2(sx * len) + '" cy="0.022" r="0.032"/>';
      return '<g transform="translate(' + f2(cx) + " " + f2(cy) + ") rotate(" + Math.round(ang) + ')" fill="#efe8d2" stroke="#7d7360" stroke-width="0.01">' +
        '<path d="M' + f2(-len) + " 0 L" + f2(len) + ' 0" stroke-width="0.062" stroke-linecap="round"/>' +
        '<path d="M' + f2(-len) + " 0 L" + f2(len) + ' 0" stroke="#efe8d2" stroke-width="0.044" stroke-linecap="round"/>' +
        knob(-1) + knob(1) + "</g>";
    }
    function ribsInner(cx, cy, ang) {
      let ribs = "";
      for (let i = 0; i < 4; i++) {
        const x = -0.105 + i * 0.07;
        ribs += "M" + f2(x) + " 0 q0.02 -0.09 0.085 -0.105 M" + f2(x) + " 0 q0.02 0.09 0.085 0.105 ";
      }
      return '<g transform="translate(' + f2(cx) + " " + f2(cy) + ") rotate(" + Math.round(ang) + ')" fill="none" stroke-linecap="round">' +
        '<path d="M-0.15 0 L0.18 0 ' + ribs + '" stroke="#7d7360" stroke-width="0.04"/>' +
        '<path d="M-0.15 0 L0.18 0 ' + ribs + '" stroke="#efe8d2" stroke-width="0.024"/></g>';
    }
    // a skull standing upright on the ground (drawn in screen space like a small prop)
    function skullShape(u, v, z, k, tilt) {
      const b = P(u, v, z), sk = S * 0.085 * k, x = b[0], y = b[1];
      let s = '<g transform="rotate(' + tilt + " " + r1(x) + " " + r1(y) + ')">';
      s += '<ellipse cx="' + r1(x + sk * 0.2) + '" cy="' + r1(y) + '" rx="' + r1(sk * 1.05) + '" ry="' + r1(sk * 0.4) + '" fill="rgba(0,0,0,0.3)"/>';
      s += '<path d="M' + r1(x - sk * 0.55) + " " + r1(y - sk * 0.55) + " L" + r1(x - sk * 0.5) + " " + r1(y - sk * 0.05) + " L" + r1(x + sk * 0.5) + " " + r1(y - sk * 0.05) + " L" + r1(x + sk * 0.55) + " " + r1(y - sk * 0.55) + ' Z" fill="#d9d1b8" stroke="#6f6650" stroke-width="1.1" stroke-linejoin="round"/>';
      s += '<circle cx="' + r1(x) + '" cy="' + r1(y - sk * 1.05) + '" r="' + r1(sk) + '" fill="#efe8d2" stroke="#6f6650" stroke-width="1.2"/>';
      s += '<ellipse cx="' + r1(x - sk * 0.38) + '" cy="' + r1(y - sk * 1.0) + '" rx="' + r1(sk * 0.28) + '" ry="' + r1(sk * 0.34) + '" fill="#2a2118"/>' +
           '<ellipse cx="' + r1(x + sk * 0.38) + '" cy="' + r1(y - sk * 1.0) + '" rx="' + r1(sk * 0.28) + '" ry="' + r1(sk * 0.34) + '" fill="#2a2118"/>';
      s += '<path d="M' + r1(x) + " " + r1(y - sk * 0.66) + " l" + r1(-sk * 0.11) + " " + r1(sk * 0.22) + " h" + r1(sk * 0.22) + ' z" fill="#2a2118"/>';
      for (let i = -2; i <= 2; i++) s += '<line x1="' + r1(x + i * sk * 0.2) + '" y1="' + r1(y - sk * 0.3) + '" x2="' + r1(x + i * sk * 0.2) + '" y2="' + r1(y - sk * 0.08) + '" stroke="#6f6650" stroke-width="0.8"/>';
      s += '<circle cx="' + r1(x - sk * 0.4) + '" cy="' + r1(y - sk * 1.5) + '" r="' + r1(sk * 0.2) + '" fill="#fff" opacity="0.5"/></g>';
      return s;
    }
    function rockShape(u, v, z, k) {
      const b = P(u, v, z), w = S * 0.11 * k, h = S * 0.09 * k, x = b[0], y = b[1];
      return '<ellipse cx="' + r1(x + w * 0.2) + '" cy="' + r1(y + 1) + '" rx="' + r1(w * 1.1) + '" ry="' + r1(h * 0.4) + '" fill="rgba(0,0,0,0.25)"/>' +
        '<path d="M' + r1(x - w) + " " + r1(y) + " L" + r1(x - w * 0.8) + " " + r1(y - h * 0.8) + " L" + r1(x - w * 0.1) + " " + r1(y - h * 1.3) + " L" + r1(x + w * 0.7) + " " + r1(y - h * 0.9) + " L" + r1(x + w) + " " + r1(y) + ' Z" fill="#9a9a96" stroke="#4d4d4a" stroke-width="1" stroke-linejoin="round"/>' +
        '<path d="M' + r1(x - w * 0.1) + " " + r1(y - h * 1.3) + " L" + r1(x + w * 0.7) + " " + r1(y - h * 0.9) + " L" + r1(x + w) + " " + r1(y) + " L" + r1(x + w * 0.1) + " " + r1(y) + ' Z" fill="#7b7b77"/>';
    }
    // everything extra on a plain cell: cracks, loose rocks, and bones when it is next to a trap
    function terrainExtras(di, dj, x, y, h) {
      const cr = rng(o.seed * 4001 + x * 47 + y * 89);
      const near = nearTrap(x, y);
      let s = "";
      if (near || cr() < 0.45) s += decal(di, dj, h, crackInner(cr, near));
      const byWater = isRiver(x - 1, y) || isRiver(x + 1, y) || isRiver(x, y - 1) || isRiver(x, y + 1);
      if (!near && !byWater && cr() < 0.22) s += rockShape(di + (cr() < 0.5 ? 0.2 : 0.8), dj + (cr() < 0.5 ? 0.22 : 0.8), h, 0.8 + cr() * 0.6);
      if (near) {
        const corner = () => [(cr() < 0.5 ? 0.18 + cr() * 0.12 : 0.7 + cr() * 0.12), (cr() < 0.5 ? 0.2 + cr() * 0.12 : 0.7 + cr() * 0.12)];
        let flat = "";
        const nb = 1 + (cr() < 0.5 ? 1 : 0);
        for (let i = 0; i < nb; i++) { const c = corner(); flat += boneInner(c[0], c[1], cr() * 180, 0.1 + cr() * 0.06); }
        if (cr() < 0.25) { const c = corner(); flat += ribsInner(c[0], c[1], cr() * 180); }
        s += decal(di, dj, h, flat);
        if (cr() < 0.55) { const c = corner(); s += skullShape(di + c[0], dj + c[1], h, 0.9 + cr() * 0.3, Math.round((cr() - 0.5) * 30)); }
      }
      return s;
    }

    function drawCell(di, dj) {
      const [x, y] = toLogical(di, dj);
      const rand = rng(o.seed * 1000 + x * 13 + y * 101);
      let s = "";
      const river = isRiver(x, y);
      const h = cellHeight(x, y);   // top of this cell
      const hTop = denOwner(x, y) ? h + DAIS : h;   // what you click on: the raised den platform
      cells[x + "," + y] = {
        display: [di, dj],
        top: [P(di, dj, hTop), P(di + 1, dj, hTop), P(di + 1, dj + 1, hTop), P(di, dj + 1, hTop)],
        center: P(di + 0.5, dj + 0.5, hTop),
        height: h
      };
      if (river) return waterCell(di, dj, x, y, rand);

      const southWater = dj + 1 < ROWS && isRiver(...toLogical(di, dj + 1));
      const eastWater = di + 1 < COLS && isRiver(...toLogical(di + 1, dj));
      const southEdge = dj === ROWS - 1, eastEdge = di === COLS - 1;
      const wallKind = isCauseway(x, y) ? "wall" : null;
      const northWater = dj > 0 && isRiver(...toLogical(di, dj - 1));
      const westWater = di > 0 && isRiver(...toLogical(di - 1, dj));
      // dirt walls get a few strata lines so the height differences between cells read as layered earth
      const strata = southEdge || eastEdge ? null : [h * 0.38, h * 0.7];
      s += wallKind ? bridgeFace([di, dj + 1], [di + 1, dj + 1], h, 1) : southWater ? woodFace([di, dj + 1], [di + 1, dj + 1], h, 0, 1) :
        vface([di, dj + 1], [di + 1, dj + 1], wallBands(h, southEdge ? ZB : 0, wallKind ? "wall" : "dirt", 1, southEdge),
          wallKind ? [h * 0.55] : (southEdge ? [0, ZB / 2] : strata));
      s += wallKind ? bridgeFace([di + 1, dj], [di + 1, dj + 1], h, 0.78) : eastWater ? woodFace([di + 1, dj], [di + 1, dj + 1], h, 0, 0.78) :
        vface([di + 1, dj], [di + 1, dj + 1], wallBands(h, eastEdge ? ZB : 0, wallKind ? "wall" : "dirt", 0.78, eastEdge),
          wallKind ? [h * 0.55] : (eastEdge ? [0, ZB / 2] : strata));

      const trap = trapOwner(x, y), den = denOwner(x, y), par = (x + y) % 2;
      let topFill;
      if (den) topFill = "#bdb6a2";
      else if (trap) topFill = par ? "#9a8a6c" : "#8f7f62";
      else if (isCauseway(x, y)) topFill = par ? "#b98650" : "#ad7a46";   // wooden deck
      else topFill = shade(par ? "#80cc5b" : "#74c052", 1 + (h - HL) * 1.5);   // higher ground is lighter, hollows are darker
      s += '<polygon points="' + pts([P(di, dj, h), P(di + 1, dj, h), P(di + 1, dj + 1, h), P(di, dj + 1, h)]) + '" fill="' + topFill + '"/>';
      // bevel: light on the back edges, dark on the front edges
      s += '<polyline points="' + pts([P(di, dj + 1, h), P(di, dj, h), P(di + 1, dj, h)]) + '" stroke="rgba(255,255,255,0.32)" stroke-width="1.5" fill="none" stroke-linejoin="round"/>';
      s += '<polyline points="' + pts([P(di, dj + 1, h), P(di + 1, dj + 1, h), P(di + 1, dj, h)]) + '" stroke="rgba(0,0,0,0.16)" stroke-width="1" fill="none" stroke-linejoin="round"/>';

      if (den) s += denStructure(di, dj, den);
      else if (trap) s += trapTerrain(di, dj, trap, topFill);
      else if (isCauseway(x, y)) s += bridgeDecal(di, dj, rand);
      else { s += grassDecor(di, dj, h, rand); s += terrainExtras(di, dj, x, y, h); }

      if (isCauseway(x, y)) s += bridgeTrim(di, dj, !isCauseway(...toLogical(di, dj + 1)));
      else if (northWater || westWater || southWater || eastWater) s += bankTrim(di, dj, northWater, westWater, southWater, eastWater);

      const p = pieceAt[x + "," + y];
      if (p) s += pieceShape(p, di, dj, den ? HL + DAIS : h);
      return s;
    }

    // painter's order: back to front
    const order = [];
    for (let dj = 0; dj < ROWS; dj++) for (let di = 0; di < COLS; di++) order.push([di, dj, (di + 0.5) * sn + (dj + 0.5) * cs]);
    order.sort((a, b) => a[2] - b[2]);
    let board = "";
    order.forEach(c => { board += drawCell(c[0], c[1]); });

    // ----------------------------------------------- rocky underside (the board floats on an island)
    // Built in screen space: two rock faces hanging below the slab's front-left and front-right edges,
    // thickest in the middle, with a jagged bottom edge.
    const rr = rng(o.seed * 77 + 5);
    function rockFace(A, B, tipA, tipB, n, faceFill, crackCol) {
      const bottom = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
        let depth = S * (0.55 + 0.95 * Math.pow(Math.sin(Math.PI * t), 0.8));
        if (i > 0 && i < n) depth *= 0.7 + rr() * 0.6;
        let dx = 0;
        if (i === 0) { depth = tipA; dx = 0; }
        if (i === n) { depth = tipB; dx = 0; }
        bottom.push([x + dx, y + depth]);
      }
      const poly = [A, B].concat(bottom.slice().reverse());
      let g = '<polygon points="' + pts(poly) + '" fill="' + faceFill + '" stroke="#2f241b" stroke-width="3" stroke-linejoin="round"/>';
      for (let i = 1; i < n; i++) {
        const t = i / n, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
        const by = bottom[i][1];
        if (rr() < 0.7) g += '<polyline points="' + pts([[x, y + 2], [x + (rr() - 0.5) * S * 0.25, (y + by) / 2], [x + (rr() - 0.5) * S * 0.2, by - S * 0.08]]) + '" stroke="' + crackCol + '" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7"/>';
      }
      return g;
    }
    const cA = P(0, ROWS, ZB), cB = P(COLS, ROWS, ZB), cC = P(COLS, 0, ZB);
    const tipFront = S * 0.9;
    const cliff =
      rockFace(cB, cC, tipFront, S * 0.45, 12, "#5a4a3b", "#2f241b") +
      rockFace(cA, cB, S * 0.45, tipFront, 11, "#7a6853", "#3b2d22");

    // ------------------------------------------------------------- hanging vines on the front edges
    function vine(u, v, len, sway) {
      const a = P(u, v, HL - 0.03);
      const segs = [[a[0], a[1]]];
      const n = 5;
      for (let i = 1; i <= n; i++) segs.push([a[0] + Math.sin(i * 1.3 + sway) * S * 0.07, a[1] + len * i / n]);
      let g = '<polyline points="' + pts(segs) + '" stroke="#245c2c" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
      for (let i = 1; i <= n; i++) {
        const sx = segs[i][0], sy = segs[i][1], side = i % 2 ? 1 : -1;
        g += '<path d="M' + r1(sx) + " " + r1(sy) + " q" + r1(side * S * 0.1) + " " + r1(-S * 0.05) + " " + r1(side * S * 0.16) + " " + r1(S * 0.03) + " q" + r1(-side * S * 0.08) + " " + r1(S * 0.07) + " " + r1(-side * S * 0.16) + ' ' + r1(-S * 0.03) + ' Z" fill="#4fbd57" stroke="#245c2c" stroke-width="1"/>';
      }
      return swayG(a[0], a[1], 2.5, 3.5 + (sway % 2), sway, g);
    }
    const vr = rng(o.seed * 19 + 3);
    let vines = "";
    for (let i = 0; i < 6; i++) vines += vine(0.4 + vr() * (COLS - 0.8), ROWS, S * (0.35 + vr() * 0.55), vr() * 6);
    for (let i = 0; i < 6; i++) vines += vine(COLS, 0.4 + vr() * (ROWS - 0.8), S * (0.35 + vr() * 0.55), vr() * 6);

    // ------------------------------------------------------------- framing / background
    const corners = [];
    [0, COLS].forEach(u => [0, ROWS].forEach(v => [ZB - 1.9, HL + 0.9].forEach(z => corners.push(P(u, v, z)))));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    corners.forEach(c => { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); });
    const padX = S * 0.9, padTop = S * 0.7, padBot = S * 0.5;
    const vb = [minX - padX, minY - padTop, (maxX - minX) + padX * 2, (maxY - minY) + padTop + padBot];

    let bg = "";
    if (o.background) {
      const [vx, vy, vw, vh] = vb;
      const br = rng(o.seed * 31 + 9);
      bg += '<rect x="' + r1(vx) + '" y="' + r1(vy) + '" width="' + r1(vw) + '" height="' + r1(vh) + '" fill="url(#ctIsoSky)"/>';
      // light rays
      for (let i = 0; i < 6; i++) {
        const cx0 = vx + vw * (0.15 + i * 0.14), w = vw * 0.05;
        bg += '<polygon points="' + pts([[cx0, vy], [cx0 + w, vy], [cx0 + w * 3 + vw * 0.08, vy + vh], [cx0 - w * 2 + vw * 0.08, vy + vh]]) + '" fill="#fff" opacity="0.06">' + anim("opacity", "0.03;0.1;0.03", 5 + i * 1.3, i * 1.7) + "</polygon>";
      }
      // distant jungle hills
      bg += '<path d="M' + r1(vx) + " " + r1(vy + vh * 0.55) + " Q" + r1(vx + vw * 0.2) + " " + r1(vy + vh * 0.3) + " " + r1(vx + vw * 0.4) + " " + r1(vy + vh * 0.5) +
            " T" + r1(vx + vw * 0.8) + " " + r1(vy + vh * 0.42) + " T" + r1(vx + vw) + " " + r1(vy + vh * 0.5) + " L" + r1(vx + vw) + " " + r1(vy + vh) + " L" + r1(vx) + " " + r1(vy + vh) + ' Z" fill="#2c8a7e" opacity="0.55"/>';
      bg += '<path d="M' + r1(vx) + " " + r1(vy + vh * 0.7) + " Q" + r1(vx + vw * 0.3) + " " + r1(vy + vh * 0.5) + " " + r1(vx + vw * 0.55) + " " + r1(vy + vh * 0.68) +
            " T" + r1(vx + vw) + " " + r1(vy + vh * 0.62) + " L" + r1(vx + vw) + " " + r1(vy + vh) + " L" + r1(vx) + " " + r1(vy + vh) + ' Z" fill="#1f6f69" opacity="0.6"/>';
      // bokeh
      for (let i = 0; i < 9; i++) {
        bg += '<circle cx="' + r1(vx + br() * vw) + '" cy="' + r1(vy + br() * vh * 0.7) + '" r="' + r1(S * (0.15 + br() * 0.5)) + '" fill="#fff" opacity="' + r1(0.05 + br() * 0.09).toString() + '"/>';
      }
    }
    // foreground leaves in the corners
    let leaves = "";
    if (o.background) {
      const [vx, vy, vw, vh] = vb;
      const leaf = (tx, ty, rot, sc, flipX) =>
        '<g transform="translate(' + r1(tx) + "," + r1(ty) + ") rotate(" + rot + ") scale(" + (flipX ? -sc : sc) + "," + sc + ')">' +
        swayG(0, 0, 2.5, 4.5 + (Math.abs(tx) % 3), Math.abs(tx) % 5,
          '<path d="M0 0 C16 -44 62 -64 106 -40 C84 -4 36 14 0 0 Z" fill="url(#ctIsoLeaf)" stroke="#1b4a2a" stroke-width="3.5" stroke-linejoin="round"/>' +
          '<path d="M4 -2 Q50 -26 100 -38" fill="none" stroke="#1b4a2a" stroke-width="2.5" opacity="0.55"/>') + "</g>";
      const k = S / 64;
      leaves += leaf(vx - 6, vy + vh + 6, -32, 1.5 * k, false) + leaf(vx + 26 * k, vy + vh + 10, -72, 1.1 * k, false) + leaf(vx + 80 * k, vy + vh + 8, -12, 0.95 * k, false);
      leaves += leaf(vx + vw + 6, vy + vh + 6, -148, 1.5 * k, false) + leaf(vx + vw - 26 * k, vy + vh + 10, -108, 1.1 * k, false) + leaf(vx + vw - 80 * k, vy + vh + 8, -168, 0.95 * k, false);
      leaves += leaf(vx - 4, vy - 2, 40, 1.2 * k, false) + leaf(vx + vw + 4, vy - 2, 140, 1.2 * k, false);
    }

    // ------------------------------------------------------------- ambience: fireflies over the board, leaves drifting down
    let motes = "";
    if (A && o.background) {
      const mr = rng(o.seed * 53 + 11);
      for (let i = 0; i < 16; i++) {
        const pos = () => P(mr() * COLS, mr() * ROWS, HL + 0.25 + mr() * 0.8);
        const a = pos(), b = pos(), c = pos();
        const dur = 9 + mr() * 8, ph = mr() * dur, tw = 1.6 + mr() * 1.6;
        motes += '<g opacity="0.9"><animateTransform attributeName="transform" type="translate" values="' +
          [a, b, c, a].map(p => r1(p[0]) + " " + r1(p[1])).join(";") + '" dur="' + f2(dur) + 's" begin="-' + f2(ph) + 's" repeatCount="indefinite"/>' +
          anim("opacity", "0.15;1;0.15", tw, ph) +
          '<circle r="' + r1(S * 0.07) + '" fill="#fff3a0" opacity="0.25"/><circle r="' + r1(S * 0.022) + '" fill="#fffbd0"/></g>';
      }
      const [vx, vy, vw, vh] = vb;
      for (let i = 0; i < 6; i++) {
        const x0 = vx + vw * (0.1 + mr() * 0.8), dur = 14 + mr() * 10, ph = mr() * dur, sw = (mr() - 0.5) * vw * 0.2, k = S / 64 * (0.8 + mr() * 0.6);
        motes += '<g opacity="0"><animateTransform attributeName="transform" type="translate" values="' + r1(x0) + " " + r1(vy) + ";" + r1(x0 + sw) + " " + r1(vy + vh * 0.5) + ";" + r1(x0) + " " + r1(vy + vh) +
          '" keyTimes="0;0.5;1" dur="' + f2(dur) + 's" begin="-' + f2(ph) + 's" repeatCount="indefinite"/>' +
          '<animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.9;1" dur="' + f2(dur) + 's" begin="-' + f2(ph) + 's" repeatCount="indefinite"/>' +
          '<g><animateTransform attributeName="transform" type="rotate" values="-50;60;-50" dur="' + f2(2.5 + mr() * 2) + 's" repeatCount="indefinite"/>' +
          '<path d="M0 0 C4 -7 13 -7 18 0 C13 7 4 7 0 0 Z" transform="scale(' + f2(k) + ')" fill="' + (i % 2 ? "#a6d95c" : "#e0c14a") + '" stroke="#2b6a2c" stroke-width="1"/></g></g>';
      }
    }

    // ------------------------------------------------------------- a crocodile patrolling both rivers
    // It swims east along the middle row, goes under the bridge, comes back west, and surfaces and sinks as it goes.
    // It is drawn after the board but clipped by the bridge's on-screen silhouette, so the deck hides it while it is underneath.
    const bridgeHull = (function () {
      const q = [];
      [3, 4].forEach(u => [3, 6].forEach(v => [0, HL + 0.3].forEach(z => q.push(P(u, v, z)))));
      q.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const lo = [], up = [];
      q.forEach(p => { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
      q.slice().reverse().forEach(p => { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
      lo.pop(); up.pop();
      return lo.concat(up);
    })();
    let croc = "";
    if (A && o.croc !== false) {
      const Wz = HW + 0.01, vC = 4.5, uW = 1.6, uE = 5.4, T = 26;
      const eW = P(uW, vC, Wz), eE = P(uE, vC, Wz);
      const dx = r1(eE[0] - eW[0]), dy = r1(eE[1] - eW[1]);
      const leg = (x, y, ang) => swayG(x, y, 18, 0.9, x * 3 + y * 5,
        '<ellipse cx="' + x + '" cy="' + y + '" rx="0.075" ry="0.032" transform="rotate(' + ang + " " + x + " " + y + ')" fill="#3b6a2c" stroke="#2b4d20" stroke-width="0.01"/>');
      let scutes = "";
      for (let i = 0; i < 6; i++) scutes += '<circle cx="' + f2(-0.15 + i * 0.065) + '" cy="-0.035" r="0.017" fill="#2f5724"/><circle cx="' + f2(-0.15 + i * 0.065) + '" cy="0.035" r="0.017" fill="#2f5724"/>';
      const inner =
        // expanding ripple ring and a faint shadow
        '<ellipse cx="0" cy="0" rx="0.3" ry="0.14" fill="none" stroke="#fff" stroke-width="0.012" opacity="0.5">' +
          anim("rx", "0.32;0.62", 1.7, 0) + anim("ry", "0.15;0.3", 1.7, 0) + anim("opacity", "0.55;0", 1.7, 0) + "</ellipse>" +
        '<ellipse cx="0.03" cy="0.02" rx="0.34" ry="0.14" fill="rgba(0,35,55,0.28)"/>' +
        swayG(-0.18, 0, 14, 1.1, 0,
          '<path d="M-0.15 -0.075 C-0.3 -0.08 -0.42 -0.03 -0.56 0 C-0.42 0.03 -0.3 0.08 -0.15 0.075 Z" fill="#43702f" stroke="#2b4d20" stroke-width="0.012"/>' +
          '<path d="M-0.2 0 L-0.5 0" stroke="#2f5724" stroke-width="0.02" stroke-dasharray="0.03 0.035"/>') +
        leg(-0.08, -0.12, -25) + leg(-0.08, 0.12, 25) + leg(0.12, -0.115, 25) + leg(0.12, 0.115, -25) +
        '<path d="M-0.2 -0.09 Q0 -0.15 0.22 -0.09 L0.22 0.09 Q0 0.15 -0.2 0.09 Z" fill="#4e7d3a" stroke="#2b4d20" stroke-width="0.012"/>' +
        '<ellipse cx="0.01" cy="0" rx="0.2" ry="0.05" fill="#6c9a50" opacity="0.7"/>' + scutes +
        '<path d="M0.2 -0.085 L0.5 -0.04 Q0.58 0 0.5 0.04 L0.2 0.085 Z" fill="#5a8a42" stroke="#2b4d20" stroke-width="0.012"/>' +
        '<circle cx="0.52" cy="-0.018" r="0.01" fill="#1d3414"/><circle cx="0.52" cy="0.018" r="0.01" fill="#1d3414"/>' +
        [-1, 1].map(sd => '<circle cx="0.3" cy="' + f2(sd * 0.07) + '" r="0.03" fill="#6b9a50" stroke="#2b4d20" stroke-width="0.01"/>' +
          '<circle cx="0.31" cy="' + f2(sd * 0.07) + '" r="0.017" fill="#e6e08a"/><ellipse cx="0.312" cy="' + f2(sd * 0.07) + '" rx="0.005" ry="0.013" fill="#1a1a10"/>').join("");
      // surfacing and sinking: fractions of one leg, with the opacity at each
      const fr = [0, 0.06, 0.1, 0.16, 0.28, 0.33, 0.4, 0.52, 0.6, 0.7, 0.76, 0.86, 0.94, 1];
      const op = [0, 0.9, 0.15, 0.9, 0.9, 0, 0.85, 0.85, 0.1, 0.9, 0.9, 0.2, 0.8, 0];
      const flick = (t0, t1) => {
        const kt = [], vv = [];
        if (t0 > 0) { kt.push(0); vv.push(0); }
        fr.forEach((f, i) => { kt.push(f2(t0 + f * (t1 - t0))); vv.push(op[i]); });
        if (t1 < 1) { kt.push(1); vv.push(0); }
        return '<animate attributeName="opacity" values="' + vv.join(";") + '" keyTimes="' + kt.join(";") + '" dur="' + T + 's" repeatCount="indefinite"/>';
      };
      const east = '<g opacity="0"><animateTransform attributeName="transform" type="translate" values="0 0;' + dx + " " + dy + ";" + dx + " " + dy +
        '" keyTimes="0;0.4;1" dur="' + T + 's" repeatCount="indefinite"/>' + flick(0, 0.4) + decal(uW, vC, Wz, inner) + "</g>";
      const west = '<g opacity="0"><animateTransform attributeName="transform" type="translate" values="0 0;0 0;' + (-dx) + " " + (-dy) + ";" + (-dx) + " " + (-dy) +
        '" keyTimes="0;0.5;0.9;1" dur="' + T + 's" repeatCount="indefinite"/>' + flick(0.5, 0.9) + decal(uE, vC, Wz, '<g transform="scale(-1 1)">' + inner + "</g>") + "</g>";
      croc = '<g pointer-events="none" clip-path="url(#ctIsoNoBridge)">' + east + west + "</g>";
    }

    const defs =
      '<defs>' +
      '<clipPath id="ctIsoCell"><rect x="0" y="0" width="1" height="1"/></clipPath>' +
      '<clipPath id="ctIsoNoBridge"><path clip-rule="evenodd" d="M' + r1(vb[0] - 50) + ' ' + r1(vb[1] - 50) + ' h' + r1(vb[2] + 100) + ' v' + r1(vb[3] + 100) + ' h' + r1(-vb[2] - 100) + ' Z M' + bridgeHull.map(p => r1(p[0]) + ' ' + r1(p[1])).join(' L') + ' Z"/></clipPath>' +
      '<linearGradient id="ctIsoSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#bff3ea"/><stop offset="55%" stop-color="#5fc9c0"/><stop offset="100%" stop-color="#1d7f84"/></linearGradient>' +
      '<linearGradient id="ctIsoLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7be07a"/><stop offset="100%" stop-color="#2b9a4b"/></linearGradient>' +
      '</defs>';

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.map(r1).join(" ") + '" width="' + r1(vb[2]) + '" height="' + r1(vb[3]) + '">' +
      defs + bg + cliff + board + croc + vines + motes + leaves + "</svg>";

    return { svg: svg, viewBox: vb, cells: cells, project: P, toDisplay: toDisplay, toLogical: toLogical };
  }

  const api = { render: render, COLS: COLS, ROWS: ROWS, isRiver: isRiver, trapOwner: trapOwner, denOwner: denOwner };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CTIso = api;
})(typeof window !== "undefined" ? window : this);
