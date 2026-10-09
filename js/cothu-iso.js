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
  const DAIS = 0.07;  // how far the den platform rises above the grass

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
    const o = Object.assign({ yaw: 34, pitch: 50, scale: 64, flip: false, pieces: [], seed: 7, background: true }, opts || {});
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
        s += '<path d="M' + r1(b[0] - 3) + " " + r1(b[1]) + " L" + r1(b[0] - 4.5) + " " + r1(b[1] - 8) + " L" + r1(b[0] - 0.8) + " " + r1(b[1] - 3.5) +
             " L" + r1(b[0]) + " " + r1(b[1] - 10) + " L" + r1(b[0] + 1.6) + " " + r1(b[1] - 3.5) + " L" + r1(b[0] + 4.6) + " " + r1(b[1] - 7.5) + " L" + r1(b[0] + 3) + " " + r1(b[1]) + ' Z" fill="#3f8a33" stroke="#2f6e28" stroke-width="0.6"/>';
      }
      if (rand() < 0.28) {
        const u = di + 0.15 + rand() * 0.7, v = dj + 0.15 + rand() * 0.7;
        const b = P(u, v, h), col = ["#ffd1e8", "#ffffff", "#ffe066"][Math.floor(rand() * 3)];
        s += '<circle cx="' + r1(b[0]) + '" cy="' + r1(b[1] - 2) + '" r="2.2" fill="' + col + '"/><circle cx="' + r1(b[0]) + '" cy="' + r1(b[1] - 2) + '" r="0.9" fill="#f2a900"/>';
      }
      return s;
    }

    function trapDecal(di, dj, owner) {
      const c = OWNER[owner], teeth = 12;
      let ring = [];
      for (let i = 0; i < teeth * 2; i++) {
        const a = Math.PI * i / teeth, r = i % 2 ? 0.28 : 0.37;
        ring.push((0.5 + r * Math.cos(a)).toFixed(3) + "," + (0.5 + r * Math.sin(a)).toFixed(3));
      }
      return decal(di, dj, HL,
        '<circle cx="0.5" cy="0.5" r="0.42" fill="#2a2433"/>' +
        '<polygon points="' + ring.join(" ") + '" fill="' + c.main + '" stroke="' + c.dark + '" stroke-width="0.015"/>' +
        '<circle cx="0.5" cy="0.5" r="0.21" fill="#1d1826"/>' +
        '<path d="M0.36 0.36 L0.64 0.64 M0.64 0.36 L0.36 0.64" stroke="' + c.glow + '" stroke-width="0.04" stroke-linecap="round"/>');
    }

    function denStructure(di, dj, owner) {
      const c = OWNER[owner];
      const zT = HL + DAIS;
      let s = box(di + 0.05, dj + 0.05, di + 0.95, dj + 0.95, HL, zT, "#d8d1bd", "#a59e8a", "#8b8472");
      s += decal(di, dj, zT,
        '<circle cx="0.5" cy="0.5" r="0.36" fill="' + c.main + '" opacity="0.30"/>' +
        '<circle cx="0.5" cy="0.5" r="0.36" fill="none" stroke="' + c.glow + '" stroke-width="0.05"/>' +
        '<circle cx="0.5" cy="0.5" r="0.24" fill="none" stroke="' + c.main + '" stroke-width="0.025"/>' +
        '<path d="M0.5 0.2 L0.58 0.42 L0.8 0.5 L0.58 0.58 L0.5 0.8 L0.42 0.58 L0.2 0.5 L0.42 0.42 Z" fill="' + c.glow + '" opacity="0.8"/>');
      // two pillars at the back corners, so a piece standing in the den is never hidden behind them
      [0.07, 0.78].forEach(ox => {
        const u0 = di + ox, v0 = dj + 0.06, w = 0.15;
        s += box(u0, v0, u0 + w, v0 + w, zT, zT + 0.58, "#cfc8b4", "#a59e8a", "#8b8472");
        s += box(u0 - 0.025, v0 - 0.025, u0 + w + 0.025, v0 + w + 0.025, zT + 0.58, zT + 0.64, "#e3dcc8", "#b3ac98", "#98917f");
        const t = P(u0 + w / 2, v0 + w / 2, zT + 0.78);
        s += '<circle cx="' + r1(t[0]) + '" cy="' + r1(t[1]) + '" r="' + r1(S * 0.2) + '" fill="' + c.glow + '" opacity="0.28"/>' +
             '<circle cx="' + r1(t[0]) + '" cy="' + r1(t[1]) + '" r="' + r1(S * 0.085) + '" fill="' + c.glow + '" stroke="' + c.dark + '" stroke-width="1.2"/>' +
             '<circle cx="' + r1(t[0] - S * 0.025) + '" cy="' + r1(t[1] - S * 0.03) + '" r="' + r1(S * 0.03) + '" fill="#fff" opacity="0.8"/>';
      });
      return s;
    }

    function causewayDecal(di, dj, rand) {
      let s = "";
      for (let i = 0; i < 3; i++) {
        const x = 0.15 + rand() * 0.7, y = 0.15 + rand() * 0.7;
        s += '<path d="M' + r1(x) + " " + r1(y) + " l" + r1(0.12 + rand() * 0.14) + " " + r1(0.05 - rand() * 0.1) + " l" + r1(0.05) + " " + r1(0.1 + rand() * 0.08) + '" stroke="rgba(70,64,52,0.5)" stroke-width="0.012" fill="none"/>';
      }
      s += '<circle cx="' + r1(0.2 + rand() * 0.6) + '" cy="' + r1(0.2 + rand() * 0.6) + '" r="0.12" fill="#5f9e45" opacity="0.4"/>';
      return decal(di, dj, HL, s);
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
        ripples += '<path d="M' + r1(rx) + " " + r1(ry) + " q0.07 -0.05 0.14 0 q0.07 0.05 0.14 0" + '" stroke="rgba(255,255,255,0.55)" stroke-width="0.022" fill="none" stroke-linecap="round"/>';
      }
      ripples += '<circle cx="' + r1(0.2 + rand() * 0.6) + '" cy="' + r1(0.2 + rand() * 0.6) + '" r="0.015" fill="#fff" opacity="0.8"/>';
      s += decal(di, dj, HW, shadows + ripples);
      if (landN) s += '<polyline points="' + pts([P(di, dj, HW), P(di + 1, dj, HW)]) + '" stroke="rgba(255,255,255,0.7)" stroke-width="2" fill="none" stroke-linecap="round"/>';
      if (landW) s += '<polyline points="' + pts([P(di, dj, HW), P(di, dj + 1, HW)]) + '" stroke="rgba(255,255,255,0.6)" stroke-width="2" fill="none" stroke-linecap="round"/>';
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

    function drawCell(di, dj) {
      const [x, y] = toLogical(di, dj);
      const rand = rng(o.seed * 1000 + x * 13 + y * 101);
      let s = "";
      const river = isRiver(x, y);
      cells[x + "," + y] = {
        display: [di, dj],
        top: [P(di, dj, river ? HW : HL), P(di + 1, dj, river ? HW : HL), P(di + 1, dj + 1, river ? HW : HL), P(di, dj + 1, river ? HW : HL)],
        center: P(di + 0.5, dj + 0.5, river ? HW : HL)
      };
      if (river) return waterCell(di, dj, x, y, rand);

      const southWater = dj + 1 < ROWS && isRiver(...toLogical(di, dj + 1));
      const eastWater = di + 1 < COLS && isRiver(...toLogical(di + 1, dj));
      const southEdge = dj === ROWS - 1, eastEdge = di === COLS - 1;
      const wallKind = isCauseway(x, y) ? "wall" : null;
      s += vface([di, dj + 1], [di + 1, dj + 1], wallBands(HL, southEdge ? ZB : 0, southWater || wallKind ? "wall" : "dirt", 1, southEdge),
        southWater || wallKind ? [HL * 0.55] : (southEdge ? [0, ZB / 2] : []));
      s += vface([di + 1, dj], [di + 1, dj + 1], wallBands(HL, eastEdge ? ZB : 0, eastWater || wallKind ? "wall" : "dirt", 0.78, eastEdge),
        eastWater || wallKind ? [HL * 0.55] : (eastEdge ? [0, ZB / 2] : []));

      const trap = trapOwner(x, y), den = denOwner(x, y), par = (x + y) % 2;
      let topFill;
      if (den) topFill = "#bdb6a2";
      else if (trap) topFill = par ? "#7b7787" : "#726e80";
      else if (isCauseway(x, y)) topFill = par ? "#bdb8aa" : "#b0ab9c";
      else topFill = par ? "#80cc5b" : "#74c052";
      s += '<polygon points="' + pts([P(di, dj, HL), P(di + 1, dj, HL), P(di + 1, dj + 1, HL), P(di, dj + 1, HL)]) + '" fill="' + topFill + '"/>';
      // bevel: light on the back edges, dark on the front edges
      s += '<polyline points="' + pts([P(di, dj + 1, HL), P(di, dj, HL), P(di + 1, dj, HL)]) + '" stroke="rgba(255,255,255,0.32)" stroke-width="1.5" fill="none" stroke-linejoin="round"/>';
      s += '<polyline points="' + pts([P(di, dj + 1, HL), P(di + 1, dj + 1, HL), P(di + 1, dj, HL)]) + '" stroke="rgba(0,0,0,0.16)" stroke-width="1" fill="none" stroke-linejoin="round"/>';

      if (den) s += denStructure(di, dj, den);
      else if (trap) s += trapDecal(di, dj, trap);
      else if (isCauseway(x, y)) s += causewayDecal(di, dj, rand);
      else s += grassDecor(di, dj, HL, rand);

      const p = pieceAt[x + "," + y];
      if (p) s += pieceShape(p, di, dj, den ? HL + DAIS : HL);
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
      return g;
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
        bg += '<polygon points="' + pts([[cx0, vy], [cx0 + w, vy], [cx0 + w * 3 + vw * 0.08, vy + vh], [cx0 - w * 2 + vw * 0.08, vy + vh]]) + '" fill="#fff" opacity="0.06"/>';
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
        '<path d="M0 0 C16 -44 62 -64 106 -40 C84 -4 36 14 0 0 Z" fill="url(#ctIsoLeaf)" stroke="#1b4a2a" stroke-width="3.5" stroke-linejoin="round"/>' +
        '<path d="M4 -2 Q50 -26 100 -38" fill="none" stroke="#1b4a2a" stroke-width="2.5" opacity="0.55"/></g>';
      const k = S / 64;
      leaves += leaf(vx - 6, vy + vh + 6, -32, 1.5 * k, false) + leaf(vx + 26 * k, vy + vh + 10, -72, 1.1 * k, false) + leaf(vx + 80 * k, vy + vh + 8, -12, 0.95 * k, false);
      leaves += leaf(vx + vw + 6, vy + vh + 6, -148, 1.5 * k, false) + leaf(vx + vw - 26 * k, vy + vh + 10, -108, 1.1 * k, false) + leaf(vx + vw - 80 * k, vy + vh + 8, -168, 0.95 * k, false);
      leaves += leaf(vx - 4, vy - 2, 40, 1.2 * k, false) + leaf(vx + vw + 4, vy - 2, 140, 1.2 * k, false);
    }

    const defs =
      '<defs>' +
      '<linearGradient id="ctIsoSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#bff3ea"/><stop offset="55%" stop-color="#5fc9c0"/><stop offset="100%" stop-color="#1d7f84"/></linearGradient>' +
      '<linearGradient id="ctIsoLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7be07a"/><stop offset="100%" stop-color="#2b9a4b"/></linearGradient>' +
      '</defs>';

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.map(r1).join(" ") + '" width="' + r1(vb[2]) + '" height="' + r1(vb[3]) + '">' +
      defs + bg + cliff + board + vines + leaves + "</svg>";

    return { svg: svg, viewBox: vb, cells: cells, project: P, toDisplay: toDisplay, toLogical: toLogical };
  }

  const api = { render: render, COLS: COLS, ROWS: ROWS, isRiver: isRiver, trapOwner: trapOwner, denOwner: denOwner };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CTIso = api;
})(typeof window !== "undefined" ? window : this);
