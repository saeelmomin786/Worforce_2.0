/* banyan.js — the scroll-driven banyan.
 *
 * One point cloud, one shader, one draw call. Seven "beats" are generated at
 * load and packed into a single VBO, so morphing between them costs two
 * vertexAttribPointer calls and a uniform. Nothing uploads per frame.
 *
 * The geometry is the SAME skeleton drawn in site/design/tree.js, which is the
 * design target. An earlier version scattered points into random blobs and read
 * as fog: a banyan is only legible through structure — a thick braided trunk, a
 * dense billowing crown that HIDES most of the branchwork, and curtains of
 * aerial roots, some of which reach the ground and thicken into new trunks.
 *
 * No dependency. Three.js would be ~150KB gzipped for a scene with no lights,
 * no materials and no models.
 *
 * Loaded by boot.js only after it has decided this device should run it.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("world");
  if (!canvas) return;
  var gl = canvas.getContext("webgl2", { antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: true });
  if (!gl) { canvas.remove(); return; }

  var LIGHT = document.documentElement.getAttribute("data-3d") === "light";
  // Leaves, not dots: ~8x fewer elements. A shaped sprite carries the form a
  // dot cannot, so the canopy still reads with real gaps between leaves.
  // This is what lets the live scene run without a GPU at all.
  var N = LIGHT ? 14000 : 42000;
  var BEATS = 7;
  var HOME = document.body.classList.contains("home");

  var _s = 1337;
  function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; }
  function seedAt(v) { _s = v >>> 0; }

  /* ══ the skeleton ═════════════════════════════════════════════════════ */

  function buildTree() {
    seedAt(7);
    var limbs = [], roots = [], leaves = [];
    function seg(x1, y1, x2, y2, w, kind) { limbs.push({ x1: x1, y1: y1, x2: x2, y2: y2, w: w, kind: kind }); }

    // trunk: short, thick, braided from fused roots
    var tx = 0, ty = 0, tw = 1.05, TOP = 2.5, i, k, u;
    for (i = 0; i < 6; i++) {
      var ny = ty + TOP / 6, nx = tx + (rnd() - 0.5) * 0.16;
      seg(tx, ty, nx, ny, tw, "trunk"); tx = nx; ty = ny; tw *= 0.90;
    }
    for (i = 0; i < 16; i++) {                         // the ridges
      var a0 = rnd() * Math.PI * 2, px = Math.cos(a0) * 0.85, py = 0, a = a0;
      for (k = 0; k < 5; k++) {
        a += 0.34 + rnd() * 0.3;
        u = (k + 1) / 5;
        var nx2 = Math.cos(a) * 0.85 * (1 - u * 0.55), ny2 = u * TOP * 0.95;
        seg(px, py, nx2, ny2, 0.11, "trunk"); px = nx2; py = ny2;
      }
    }
    for (i = 0; i < 14; i++) {                         // surface roots
      var ar = (i / 14) * Math.PI * 2 + rnd() * 0.35, rx = 0, ry = 0.1, rw = 0.28;
      for (k = 0; k < 4; k++) {
        var rnx = rx + Math.cos(ar + (rnd() - 0.5) * 0.5) * (0.55 + rnd() * 0.4);
        seg(rx, ry, rnx, Math.max(-0.06, ry - 0.05), rw, "trunk");
        rx = rnx; ry = Math.max(-0.06, ry - 0.05); rw *= 0.66;
      }
    }

    function branch(x, y, ang, len, w, depth) {
      if (depth > 3 || len < 0.42) { leaves.push({ x: x, y: y }); return; }
      var cx = x, cy = y, aa = ang;
      for (var i2 = 0; i2 < 3; i2++) {
        aa += (rnd() - 0.5) * 0.34;
        var level = Math.cos(aa) >= 0 ? 0 : Math.PI;    // gravity, toward the nearer horizon
        aa = level + (aa - level) * (depth === 0 ? 0.93 : 0.80);
        var bx = cx + Math.cos(aa) * (len / 3), by = cy + Math.sin(aa) * (len / 3);
        seg(cx, cy, bx, by, w, "branch");
        cx = bx; cy = by; w *= 0.82;
        if (rnd() < 0.5) leaves.push({ x: cx, y: cy });
      }
      var kids = depth < 2 ? 3 : 2;
      for (var k2 = 0; k2 < kids; k2++)
        branch(cx, cy, aa + (k2 - (kids - 1) / 2) * (0.55 + rnd() * 0.3),
               len * (0.66 + rnd() * 0.15), w * 0.86, depth + 1);
    }
    for (i = 0; i < 8; i++) {
      var up = 0.70 + (i % 3) * 0.15;
      branch(tx * up, ty * up, Math.PI * (0.10 + (i / 7) * 0.80), 2.6 + rnd() * 0.9, 0.34, 0);
    }
    // limbs that arc OVER the middle, so the crown is one mass and not two bushes
    branch(tx, ty, Math.PI * 0.38, 2.7, 0.28, 0);
    branch(tx, ty, Math.PI * 0.62, 2.7, 0.28, 0);
    branch(tx, ty * 0.9, Math.PI * 0.47, 2.4, 0.24, 0);
    branch(tx, ty * 0.9, Math.PI * 0.53, 2.4, 0.24, 0);

    // aerial roots, hanging from the crown's underside
    var hosts = limbs.filter(function (l) { return l.kind === "branch" && l.y1 > 3.0; });
    for (i = 0; i < 120 && hosts.length; i++) {
      var h = hosts[Math.floor(rnd() * hosts.length)], t = rnd();
      var ox = h.x1 + (h.x2 - h.x1) * t, oy = h.y1 + (h.y2 - h.y1) * t;
      var reaches = rnd() < 0.13, len2 = reaches ? oy : oy * (0.25 + rnd() * 0.55);
      var drift = (rnd() - 0.5) * 0.5, pts = [];
      for (k = 0; k <= 9; k++) {
        var uu = k / 9;
        pts.push([ox + drift * uu * uu + Math.sin(uu * 2.2 + i) * 0.045, oy - len2 * uu]);
      }
      roots.push({ pts: pts, reaches: reaches });
    }

    // the crown, FITTED to the limbs so no branch tip pokes out of it
    var reach = 0, top = 0, low = 1e9;
    limbs.forEach(function (l) {
      if (l.kind !== "branch") return;
      reach = Math.max(reach, Math.abs(l.x2)); top = Math.max(top, l.y2); low = Math.min(low, l.y2);
    });
    reach *= 1.02;
    var CB = Math.max(1.9, low - 0.5), CT = top + 0.8, RX = reach, RZ = reach * 0.56;
    var billows = [];
    for (i = 0; i < 54; i++) {
      var ab = rnd() * Math.PI * 2, ub = Math.sqrt(rnd()) * 0.98;
      var dome = Math.sqrt(Math.max(0, 1 - ub * ub));
      billows.push({
        x: Math.cos(ab) * RX * ub, z: Math.sin(ab) * RZ * ub,
        y: CB + (CT - CB) * dome * (0.28 + rnd() * 0.74),
        r: 1.15 + rnd() * 1.25 * (1 - ub * 0.25),
      });
    }
    // six spawn roots, one per worker: canopy down to the ground
    var SPAWN_X = [-7.0, -4.2, -1.4, 1.4, 4.2, 7.0], spawn = [];
    for (i = 0; i < 6; i++) {
      var sx = SPAWN_X[i], hy = CB + 0.9 + rnd() * 0.7, sp = [];
      for (k = 0; k <= 18; k++) {
        var sv = k / 18;
        sp.push([sx + Math.sin(sv * 2.6 + i) * 0.28 * (1 - sv), hy * (1 - sv)]);
      }
      spawn.push(sp);
      roots.push({ pts: sp, reaches: true, spawn: true });
    }

    return { limbs: limbs, roots: roots, leaves: leaves, billows: billows, spawn: spawn,
             crown: { CB: CB, CT: CT, RX: RX, RZ: RZ }, trunkTop: [tx, ty] };
  }

  var T = buildTree();

  // A figure woven from root: strands spiralling around each limb, with mass.
  // Deliberately not the Marvel character — no ridged crown, no face, no eyes.
  function figureSegs(x, s, seed, pose) {
    seedAt(seed * 977 + 13);
    var L = [];
    function limb(x1, y1, x2, y2, r1, r2, n, twist) {
      var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len;
      for (var k = 0; k < n; k++) {
        var phase = (k / n) * Math.PI * 2 + rnd() * 0.4, px = null, py = null;
        for (var i = 0; i <= 7; i++) {
          var u = i / 7, rr = r1 + (r2 - r1) * u;
          var swell = 1 + Math.sin(u * Math.PI) * 0.34;
          var off = Math.cos(phase + u * twist) * rr * swell;
          var cx = x1 + dx * u + nx * off, cy = y1 + dy * u + ny * off * 0.35;
          if (px !== null) L.push({ x1: px, y1: py, x2: cx, y2: cy });
          px = cx; py = cy;
        }
      }
    }
    limb(x, 0.46 * s, x, 0.96 * s, 0.145 * s, 0.105 * s, 22, 3.4);            // torso
    // Arms. The hand end is posable: default is hanging at the side, but a
    // scene can raise a forearm to hold a cup or reach across to pass work.
    // Without this every figure has the same silhouette and nothing that is
    // placed near a hand reads as being held.
    var po = pose || {};
    var lhx = po.lx === undefined ? -0.20 : po.lx, lhy = po.ly === undefined ? 0.34 : po.ly;
    var rhx = po.rx === undefined ? 0.20 : po.rx, rhy = po.ry === undefined ? 0.34 : po.ry;
    limb(x - 0.10 * s, 0.92 * s, x + lhx * s, lhy * s, 0.050 * s, 0.036 * s, 7, 2.8);  // arms
    limb(x + 0.10 * s, 0.92 * s, x + rhx * s, rhy * s, 0.050 * s, 0.036 * s, 7, 2.8);
    limb(x - 0.06 * s, 0.50 * s, x - 0.10 * s, 0, 0.066 * s, 0.050 * s, 9, 2.6);         // legs
    limb(x + 0.06 * s, 0.50 * s, x + 0.10 * s, 0, 0.066 * s, 0.050 * s, 9, 2.6);
    limb(x, 1.03 * s, x, 1.22 * s, 0.082 * s, 0.068 * s, 13, 3.0);            // head, a woven knot
    return L;
  }

  /* ══ shapes ═══════════════════════════════════════════════════════════
     The tree stands in the first section. After that the camera drops below
     the canopy, the aerial roots keep streaming down from the top of frame,
     and the same points reassemble into whatever the section you are reading
     is about.

     Every shape fills the SAME N points, so a change is a morph rather than a
     spawn. Shapes are packed into one buffer and blended by offset, so nothing
     re-uploads while scrolling.

     kind: 0 canopy · 1 bark · 2 living · 3 mote                             */

  var __t0 = performance.now();
  var SHAPES = ["tree", "people", "org", "worker", "wave", "vault", "gate", "grove"];
  var STRIDE = N * 3;
  var pos = new Float32Array(STRIDE * SHAPES.length);
  var kind = new Float32Array(N * SHAPES.length);

  function Fill(si) {
    var base = si * STRIDE, kb = si * N, i = 0;
    var api = {
      n: function () { return i; },
      left: function () { return N - i; },
      at: function (x, y, z, k) {
        if (i >= N) return;
        pos[base + i * 3] = x; pos[base + i * 3 + 1] = y; pos[base + i * 3 + 2] = z;
        kind[kb + i] = k; i++;
      },
      // a solid bar, the workhorse for built structures
      box: function (n, cx, cy, cz, w, h, d, k) {
        for (var j = 0; j < n && i < N; j++) {
          // push samples toward the outside of the slab: a uniformly filled
          // volume reads as fog, a surface-weighted one reads as a solid.
          var sx = (rnd() - 0.5), sy = (rnd() - 0.5), sz = (rnd() - 0.5);
          var push = function (v) { return Math.sign(v) * Math.pow(Math.abs(v) * 2, 0.55) * 0.5; };
          api.at(cx + push(sx) * w, cy + push(sy) * h, cz + push(sz) * d, k);
        }
      },
      ring: function (n, cx, cy, r, thick, k) {
        for (var j = 0; j < n && i < N; j++) {
          var a = rnd() * Math.PI * 2;
          // bias toward the band centre so the stroke has a core and soft edges
          var t = (rnd() + rnd() + rnd()) / 3 - 0.5;
          api.at(cx + Math.cos(a) * (r + t * thick), cy + Math.sin(a) * (r + t * thick),
                 (rnd() - 0.5) * thick * 1.6, k);
        }
      },
      line: function (n, x1, y1, x2, y2, jit, k) {
        for (var j = 0; j < n && i < N; j++) {
          var u = rnd();
          // three samples averaged: a dense core with soft edges, so a stroke
          // reads as a drawn line rather than a scatter of dots along one
          var t = (rnd() + rnd() + rnd()) / 3 - 0.5;
          api.at(x1 + (x2 - x1) * u + t * jit * 2.2,
                 y1 + (y2 - y1) * u + t * jit * 2.2, t * jit * 2.2, k);
        }
      },
      person: function (n, x, y, s, seed, pose) {
        var segs = figureSegs(x, s, seed, pose);
        for (var j = 0; j < n && i < N; j++) {
          var g = segs[Math.floor(rnd() * segs.length)], u = rnd();
          api.at(g.x1 + (g.x2 - g.x1) * u, y + g.y1 + (g.y2 - g.y1) * u, (rnd() - 0.5) * 0.3, 2);
        }
      },
      // The curtain of aerial root that hangs into frame from the canopy above.
      // It is what carries the points down, so it is in every shape but the tree.
      curtain: function (n) {
        for (var j = 0; j < n && i < N; j++) {
          var x = (rnd() - 0.5) * 19, drop = rnd();
          api.at(x + Math.sin(drop * 3 + x) * 0.22 * (1 - drop),
                 9.5 - drop * (4.5 + rnd() * 4.5), (rnd() - 0.5) * 3.2, 1);
        }
      },
      fill: function (fn) { var g = 0; while (i < N && g++ < N * 3) fn(api); },
    };
    return api;
  }

  var build = {
    // ── the banyan, whole. The first thing you see and the only place it is. ──
    tree: function (F) {
      var cr = T.crown;
      for (var g = 0; F.n() < N * 0.36 && g < N * 8; g++) {
        var bl = T.billows[Math.floor(rnd() * T.billows.length)];
        var th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), rr = bl.r * Math.cbrt(rnd());
        var x = bl.x + rr * Math.sin(ph) * Math.cos(th);
        var y = bl.y + rr * Math.cos(ph) * 0.72;
        var z = bl.z + rr * Math.sin(ph) * Math.sin(th) * 0.7;
        var u = Math.hypot(x / cr.RX, z / cr.RZ);
        if (u > 1.04) continue;
        var ceil = cr.CB + (cr.CT - cr.CB) * Math.sqrt(Math.max(0, 1 - u * u)) + 0.5;
        if (y > ceil || y < cr.CB - 0.6) continue;
        F.at(x, y, z, 0);
      }
      var TR = T.limbs.filter(function (l) { return l.kind === "trunk"; });
      var BR = T.limbs.filter(function (l) { return l.kind === "branch"; });
      for (var i2 = 0; i2 < N * 0.10; i2++) {
        var tl = TR[Math.floor(rnd() * TR.length)], t = rnd();
        F.at(tl.x1 + (tl.x2 - tl.x1) * t, tl.y1 + (tl.y2 - tl.y1) * t,
             (rnd() - 0.5) * Math.max(0.35, tl.w * 1.6), 1);
      }
      for (i2 = 0; i2 < N * 0.17; i2++) {
        var lb = BR[Math.floor(rnd() * BR.length)], t2 = rnd();
        F.at(lb.x1 + (lb.x2 - lb.x1) * t2, lb.y1 + (lb.y2 - lb.y1) * t2, (rnd() - 0.5) * 0.9, 1);
      }
      for (i2 = 0; i2 < N * 0.20; i2++) {
        var rt = T.roots[Math.floor(rnd() * T.roots.length)];
        var k = Math.floor(rnd() * (rt.pts.length - 1)), t3 = rnd();
        var q0 = rt.pts[k], q1 = rt.pts[k + 1];
        F.at(q0[0] + (q1[0] - q0[0]) * t3, q0[1] + (q1[1] - q0[1]) * t3, (rnd() - 0.5) * 0.9, 4);
      }
      // the CEO, a bright knot up in the crown
      for (i2 = 0; i2 < N * 0.04; i2++) {
        var a = rnd() * Math.PI * 2, r1 = 0.85 * Math.cbrt(rnd()), p1 = Math.acos(2 * rnd() - 1);
        F.at(T.trunkTop[0] + r1 * Math.sin(p1) * Math.cos(a),
             T.trunkTop[1] + 1.5 + r1 * Math.cos(p1), r1 * Math.sin(p1) * Math.sin(a), 2);
      }
      F.fill(function (f) {
        var am = rnd() * Math.PI * 2, rm = 3.5 + rnd() * 6.5;
        f.at(Math.cos(am) * rm, 0.4 + rnd() * 7.5, Math.sin(am) * rm * 0.7, 3);
      });
    },

    // ── four people: which of these is you ──────────────────────────────
    people: function (F) {
      // Four standing together, each holding a cup: the near hand is raised
      // to chest height and the cup sits AT that hand. Spaced wide enough
      // that they stay four people and do not merge into one mass.
      var px = [-4.5, -1.5, 1.5, 4.5];
      var CUP = 1.42;
      for (var i = 0; i < 4; i++) {
        var inward = px[i] < 0 ? 1 : -1;
        var hx = 0.34 * inward;
        F.person(N * 0.135, px[i], 0, 2.3, i + 1,
                 { rx: inward > 0 ? hx : 0.20, ry: inward > 0 ? CUP / 2.3 : 0.34,
                   lx: inward > 0 ? -0.20 : hx, ly: inward > 0 ? 0.34 : CUP / 2.3 });
        F.ring(N * 0.011, px[i] + hx * 2.3, CUP, 0.15, 0.07, 0);
      }
      F.curtain(N * 0.20);
      F.fill(function (f) { f.at((rnd() - 0.5) * 18, rnd() * 6, (rnd() - 0.5) * 5, 3); });
    },

    // ── the org chart: assistant, CEO, workers, and who reports to whom ──
    org: function (F) {
      F.curtain(N * 0.22);
      F.ring(N * 0.10, 0, 6.6, 1.15, 0.34, 2);              // the CEO, alone at the top
      F.ring(N * 0.07, 0, 2.6, 0.75, 0.28, 2);              // the assistant, below it
      F.line(N * 0.05, 0, 5.4, 0, 3.4, 0.09, 1);            // the one line between them
      for (var i = 0; i < 5; i++) {                          // the workers, along the bottom
        var x = -6.4 + i * 3.2;
        F.ring(N * 0.045, x, -1.2, 0.62, 0.24, 2);
        F.line(N * 0.026, 0, 1.9, x, -0.5, 0.07, 1);
      }
      F.fill(function (f) { f.at((rnd() - 0.5) * 17, -2 + rnd() * 9, (rnd() - 0.5) * 4, 3); });
    },

    // ── one worker, close. The shape each engine section wears. ──────────
    worker: function (F) {
      F.curtain(N * 0.26);
      F.person(N * 0.52, 0, 0, 5.4, 3);
      F.fill(function (f) { f.at((rnd() - 0.5) * 16, rnd() * 8, (rnd() - 0.5) * 5, 3); });
    },

    // ── a spoken waveform: you talk to it ────────────────────────────────
    wave: function (F) {
      F.curtain(N * 0.24);
      for (var i = 0; i < N * 0.46 && F.left(); i++) {
        var x = (rnd() - 0.5) * 15;
        var env = Math.exp(-Math.pow(x / 5.4, 2) * 1.6);
        var amp = env * (2.9 * Math.sin(x * 1.5) * Math.sin(x * 0.42 + 1.1) + 0.25);
        F.at(x, 3.0 + amp * (rnd() * 2 - 1) * 0.5 + amp * 0.5 * Math.sign(rnd() - 0.5),
             (rnd() - 0.5) * 1.6, 2);
      }
      F.line(N * 0.06, -7.5, 3.0, 7.5, 3.0, 0.05, 1);
      F.fill(function (f) { f.at((rnd() - 0.5) * 17, rnd() * 8, (rnd() - 0.5) * 5, 3); });
    },

    // ── a strongbox under the ground line: your files stay here ──────────
    vault: function (F) {
      F.curtain(N * 0.16);
      F.line(N * 0.07, -9.5, 4.2, 9.5, 4.2, 0.07, 1);        // the ground line
      F.box(N * 0.10, 0, 1.2, 0, 7.4, 0.30, 4.0, 1);         // lid
      F.box(N * 0.10, 0, -3.4, 0, 7.4, 0.30, 4.0, 1);        // floor
      F.box(N * 0.09, -3.7, -1.1, 0, 0.30, 4.6, 4.0, 1);     // walls
      F.box(N * 0.09, 3.7, -1.1, 0, 0.30, 4.6, 4.0, 1);
      F.ring(N * 0.09, 0, -1.1, 1.15, 0.34, 2);              // the dial
      for (var i = 0; i < 8; i++) {                           // roots feeding into it
        var x = -7 + i * 2;
        F.line(N * 0.014, x, 8.5, x * 0.55, 1.5, 0.10, 1);
      }
      F.fill(function (f) { f.at((rnd() - 0.5) * 18, -4 + rnd() * 12, (rnd() - 0.5) * 5, 3); });
    },

    // ── a gate across the path: nothing leaves without you ───────────────
    gate: function (F) {
      F.curtain(N * 0.20);
      F.box(N * 0.11, -4.6, 1.4, 0, 0.55, 7.0, 0.9, 1);      // posts
      F.box(N * 0.11, 4.6, 1.4, 0, 0.55, 7.0, 0.9, 1);
      F.box(N * 0.16, 0, 2.2, 0, 8.8, 0.42, 0.7, 2);         // the barrier, down
      F.ring(N * 0.08, 0, 2.2, 0.72, 0.26, 2);               // the latch
      F.fill(function (f) { f.at((rnd() - 0.5) * 17, -1 + rnd() * 9, (rnd() - 0.5) * 5, 3); });
    },

    // ── the grove: everyone, working, under the roots that made them ─────
    grove: function (F) {
      // Five along one desk, work moving down the line. Each figure has its
      // inner hand DOWN ON the desk surface and the outer hand at its side,
      // so the documents are held rather than hovering.
      var gx = [-6.0, -3.0, 0, 3.0, 6.0];
      var DESK = 1.62;
      for (var i = 0; i < 5; i++) {
        // hand reaches toward the next person along, at desk height
        F.person(N * 0.112, gx[i], 0, 2.4, i + 1,
                 { rx: 0.46, ry: 0.62, lx: -0.24, ly: 0.42 });
      }
      // The desk: a slab with a lit front edge, deep enough to read as a top.
      F.box(N * 0.085, 0, DESK - 0.06, 1.1, 15.0, 0.07, 2.8, 4);
      F.line(N * 0.020, -7.5, DESK + 0.02, 7.5, DESK + 0.02, 0.04, 0);
      // A document under each reaching hand, lying flat on the surface.
      for (var d = 0; d < 5; d++) {
        F.box(N * 0.012, gx[d] + 1.50, DESK + 0.07, 1.1, 0.90, 0.02, 0.62, 0);
      }
      F.curtain(N * 0.06);
      F.fill(function (f) { f.at((rnd() - 0.5) * 19, rnd() * 6.5, (rnd() - 0.5) * 5, 3); });
    },
  };

  for (var si = 0; si < SHAPES.length; si++) {
    seedAt(9001 + si * 7919);
    var F = Fill(si);
    build[SHAPES[si]](F);
    F.fill(function (f) { f.at(0, -80, 0, 3); });
  }

  var seeds = new Float32Array(N);
  for (var sj = 0; sj < N; sj++) seeds[sj] = rnd();
  window.__banyanBuildMs = Math.round(performance.now() - __t0);

  /* ══ program ══════════════════════════════════════════════════════════ */
  var VS = [
    "#version 300 es",
    "in vec3 aA; in vec3 aB; in float aKA; in float aKB; in float aSeed;",
    "uniform mat4 uVP; uniform float uTime, uScale, uMix, uMotion, uMotionAmp;",
    "out float vSeed; out float vFade; out float vKind; out float vY;",
    "void main(){",
    // Staggered by seed, so the structure dissolves and reforms as a travelling
    // wave rather than sliding across rigidly. This is what reads as carried.
    "  float d = aSeed * 0.45;",
    "  float m = clamp((uMix - d) / 0.55, 0.0, 1.0);",
    "  m = m * m * (3.0 - 2.0 * m);",
    "  vec3 p = mix(aA, aB, m);",
    // and it dips on the way, as though it travelled down a root
    "  p.y -= sin(m * 3.14159) * 1.5 * (1.0 - abs(uMix - 0.5) * 2.0 + 0.35);",
    // Six engine sections in a row all wear the same worker, so nothing morphs
    // between them and they were six identical frames. Each one now carries its
    // own motion instead of its own shape: a second body in the buffer would
    // cost 12MB per variant, and what tells two workers apart is what they are
    // doing, not how they are built.
    "  float kNow = mix(aKA, aKB, m);",
    // Only the living points — the figure — move. The curtain of root behind it
    // and the motes around it hold still, or the whole frame swims.
    "  float amp = step(1.5, kNow) * (1.0 - step(2.5, kNow)) * uMotionAmp;",
    "  if (amp > 0.001) {",
    "    float h = clamp(p.y / 6.6, 0.0, 1.0);",
    // Where the work happens. Hands and forearms carry the motion; the
    // torso answers it faintly and the legs stay planted. Without this the
    // whole figure swings as one mass and reads as hanging, not working.
    "    float hand = smoothstep(0.42, 0.78, h) * (1.0 - smoothstep(0.86, 1.0, h));",
    "    float lean = smoothstep(0.30, 0.95, h) * 0.22;",
    // NOT sign(p.x): the body straddles the centreline, so that sends the
    // left and right halves opposite ways and tears the figure in two.
    // One direction for the whole figure, from its own motion id.
    "    float side = uMotion > 3.5 ? -1.0 : 1.0;",
    // One clock for all six workers, each offset, so the row reads as a
    // team on the same job rather than six unrelated loops.
    "    float T = uTime + uMotion * 0.7;",
    "    vec3 mv = vec3(0.0);",
    "    if (uMotion < 1.5) {",                    // 1 - sales: reaching out, offering
    "      float r = sin(T * 1.5) * 0.5 + 0.5;",
    "      mv.x += r * 0.62 * hand * side;",
    "      mv.z += r * 0.78 * hand;",
    "      mv.y += r * 0.16 * hand;",
    "      mv.z += r * 0.10 * lean;",
    "    } else if (uMotion < 2.5) {",             // 2 - marketing: setting a piece down and stepping back
    "      float c = fract(T * 0.24);",
    "      float place = smoothstep(0.0, 0.35, c) * (1.0 - smoothstep(0.55, 0.95, c));",
    "      mv.y -= place * 0.70 * hand;",
    "      mv.z += place * 0.66 * hand;",
    "      mv.z += place * 0.14 * lean;",
    "    } else if (uMotion < 3.5) {",             // 3 - inbox: hands working, one item after another
    "      float c = fract(T * 0.55);",
    "      float b1 = (c - 0.25) * 5.0; float b2 = (c - 0.72) * 5.0;",
    "      float beat = exp(-b1 * b1) + exp(-b2 * b2);",
    "      mv.x += beat * 0.34 * hand * side;",
    "      mv.y += beat * 0.30 * hand;",
    "      mv.z += beat * 0.22 * hand;",
    "    } else if (uMotion < 4.5) {",             // 4 - prices: scanning a line across, then back
    "      float sweep = sin(T * 0.85);",
    "      mv.x += sweep * 0.66 * hand;",
    "      mv.z += (1.0 - abs(sweep)) * 0.20 * hand;",
    "      mv.x += sweep * 0.10 * lean;",
    "    } else if (uMotion < 5.5) {",             // 5 - video: framing a shot, holding it steady
    "      float c = fract(T * 0.20);",
    "      float hold = smoothstep(0.05, 0.3, c) * (1.0 - smoothstep(0.62, 0.92, c));",
    "      mv.y += hold * 0.52 * hand;",
    "      mv.z += hold * 0.46 * hand;",
    "      mv.x += sin(T * 1.9) * 0.05 * hold * hand;",
    "    } else {",                                // 6 - jobs: taking one in, passing it on
    "      float c = fract(T * 0.40);",
    "      float q1 = (c - 0.2) * 4.5; float take = exp(-q1 * q1);",
    "      float q2 = (c - 0.68) * 4.5; float pass = exp(-q2 * q2);",
    "      mv.z += take * 0.60 * hand;",
    "      mv.x += pass * 0.58 * hand * side;",
    "      mv.y += (take + pass) * 0.20 * hand;",
    "    }",
    "    p += mv * amp;",
    "  }",
    "  vec4 clip = uVP * vec4(p, 1.0);",
    "  gl_Position = clip;",
    // Point size has to blend BOTH ends of the morph. Reading it off aKA alone
    // made the transition asymmetric: scrolling down from the tree drew every
    // point at canopy weight the whole way, scrolling back drew the same frames
    // at figure weight, so the two directions looked like different renderers.
    "  float fA = aKA < 0.5 ? 2.60 : (aKA < 1.5 ? 1.05 : (aKA < 2.5 ? 1.70 : (aKA < 3.5 ? 0.65 : 1.90)));",
    "  float fB = aKB < 0.5 ? 2.60 : (aKB < 1.5 ? 1.05 : (aKB < 2.5 ? 1.70 : (aKB < 3.5 ? 0.65 : 1.90)));",
    "  float fat = mix(fA, fB, m);",
    "  gl_PointSize = max(1.0, uScale * fat * (0.75 + aSeed * 0.9) / max(clip.w, 0.4));",
    "  vSeed = aSeed; vKind = mix(aKA, aKB, m); vY = p.y;",
    "  vFade = clamp(1.45 - clip.w * 0.030, 0.22, 1.0);",
    "}",
  ].join("\n");

  var FS = [
    "#version 300 es",
    "precision mediump float;",
    "in float vSeed; in float vFade; in float vKind; in float vY;",
    "out vec4 frag;",
    "const vec3 CANOPY_LO = vec3(0.110, 0.420, 0.480);",
    "const vec3 CANOPY_HI = vec3(0.420, 0.870, 0.930);",
    "const vec3 BARK      = vec3(0.557, 0.639, 0.776);",
    "const vec3 ROOT      = vec3(0.741, 0.792, 0.898);",
    "const vec3 CYAN      = vec3(0.000, 0.827, 0.847);",
    "const vec3 VIOLET    = vec3(0.545, 0.424, 1.000);",
    // A leaf, not a dot. Shape lives here because gl_PointCoord is free:
    // no texture, no extra geometry, no second draw call. Fewer, larger,
    // shaped sprites cover the same silhouette with far less vertex work,
    // and because a leaf reads as a leaf you can leave real gaps between
    // them - a dot cloud needs density just to look solid.
    "float leafMask(vec2 q, float seed){",
    // Rotate per point so a canopy is never a grid of aligned stamps.
    "  float a = seed * 6.2831853;",
    "  vec2 r = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));",
    // Ovate blade: widest below the middle, drawn to a tip at v = 1.
    // v runs 0 at the stem to 1 at the tip; half-width follows a lobe.
    "  float v = clamp(r.y + 0.5, 0.0, 1.0);",
    "  float w = 0.62 * sin(3.14159 * pow(v, 0.72)) * (1.0 - 0.28 * v);",
    "  float body = 1.0 - smoothstep(w * 0.72, w, abs(r.x));",
    // Fade the very base and tip so the blade ends softly instead of
    // stopping on a hard edge, which is what made the old discs look
    // stamped rather than lit.
    "  float ends = smoothstep(0.0, 0.16, v) * (1.0 - smoothstep(0.86, 1.0, v));",
    // A midrib, brightest along the spine, so a big sprite still has
    // internal structure rather than reading as a blob.
    "  float rib = (1.0 - smoothstep(0.0, 0.09, abs(r.x))) * ends * 0.55;",
    "  return clamp(body * ends + rib, 0.0, 1.0);",
    "}",
    // A strand: long, thin, tapered at both ends. The figures are already
    // woven from spiralling root strands (see figureSegs) - drawing them as
    // round dots is what hid that weave.
    "float strandMask(vec2 q, float seed){",
    "  float a = seed * 6.2831853;",
    "  vec2 r = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));",
    "  float v = clamp(r.y + 0.5, 0.0, 1.0);",
    "  float w = 0.15 * sin(3.14159 * v);",
    "  return (1.0 - smoothstep(w * 0.30, w, abs(r.x))) * smoothstep(0.0, 0.12, v) * (1.0 - smoothstep(0.88, 1.0, v));",
    "}",
    "void main(){",
    "  vec2 q = gl_PointCoord - 0.5;",
    "  float d = length(q);",
    "  if (d > 0.5) discard;",
    // A soft disc that reaches exactly zero at the rim. The previous version
    // used pow() against a hard discard, so every point ended on an aliased
    // edge and the whole cloud read as coarse. smoothstep fades out before the
    // cutoff, which is what makes a point look lit rather than stamped.
    "  float disc = smoothstep(0.5, 0.06, d);",
    "  float core;",
    "  if (vKind < 0.5)      core = leafMask(q, vSeed);",
    "  else if (vKind < 1.5) core = disc;",
    "  else if (vKind < 2.5) core = strandMask(q, vSeed);",
    "  else if (vKind < 3.5) core = disc;",
    "  else                  core = strandMask(q, vSeed);",
    "  if (core < 0.01) discard;",
    "  vec3 col; float amp;",
    "  float lift = pow(clamp((vY - 1.9) / 8.5, 0.0, 1.0), 1.6);",
    "  if (vKind < 0.5)      { col = mix(CANOPY_LO, CANOPY_HI, lift); amp = 0.20; }",
    "  else if (vKind < 1.5) { col = BARK;                     amp = 0.34; }",
    "  else if (vKind < 2.5) { col = mix(CYAN, VIOLET, vSeed); amp = 0.30; }",
    "  else if (vKind < 3.5) { col = mix(VIOLET, CYAN, vSeed); amp = 0.10; }",
    "  else                  { col = ROOT;                     amp = 0.38; }",
    "  frag = vec4(col, core * vFade * amp);",
    "}",
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { var st0 = document.getElementById("stage"); if (st0) st0.remove(); return; }
  gl.useProgram(prog);

  function mkBuf(data) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  var vboPos = mkBuf(pos), vboKind = mkBuf(kind), vboSeed = mkBuf(seeds);
  var lA = gl.getAttribLocation(prog, "aA"), lB = gl.getAttribLocation(prog, "aB");
  var lKA = gl.getAttribLocation(prog, "aKA"), lKB = gl.getAttribLocation(prog, "aKB");
  var lS = gl.getAttribLocation(prog, "aSeed");
  [lA, lB, lKA, lKB, lS].forEach(function (l) { gl.enableVertexAttribArray(l); });

  var uVP = gl.getUniformLocation(prog, "uVP"), uTime = gl.getUniformLocation(prog, "uTime"),
      uScale = gl.getUniformLocation(prog, "uScale"), uMix = gl.getUniformLocation(prog, "uMix"),
      uMotion = gl.getUniformLocation(prog, "uMotion"),
      uMotionAmp = gl.getUniformLocation(prog, "uMotionAmp");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.disable(gl.DEPTH_TEST);

  /* ══ scenes ═══════════════════════════════════════════════════════════
     A section says which shape it wants with [data-shape], and labels it with
     [data-cap]. The tree only ever belongs to the first one.                */

  var CAM = {   //      eyeX  eyeY   eyeZ  targetY
    tree:   [0,     5.0, 24.0,  4.8],
    people: [0.6,   3.4, 16.5,  2.2],
    org:    [0,     2.4, 19.5,  2.2],
    worker: [0,     3.2, 15.5,  3.0],
    wave:   [0,     3.0, 16.0,  3.0],
    vault:  [0,     0.6, 17.5,  0.4],
    gate:   [0,     2.4, 17.0,  2.2],
    grove:  [0.8,   4.2, 20.0,  2.0],
  };

  var from = 0, to = 0, mix = 1, mixTarget = 1;
  var motion = 0, motionWant = 0, motionAmp = 1;
  var shot = CAM.tree.slice(), want = CAM.tree.slice();
  var cap = document.querySelector("[data-cap]");
  var capBox = document.querySelector(".stage-cap");
  var current = null;

  function apply(el) {
    if (el === current) return;
    current = el;
    var name = el.getAttribute("data-shape") || "grove";
    var idx = SHAPES.indexOf(name);
    if (idx < 0) idx = SHAPES.indexOf("grove");
    if (idx !== to) {
      // whatever we are showing now becomes the start of the next morph
      from = mix >= 0.999 ? to : from;
      from = to; to = idx; mix = 0; mixTarget = 1;
    }
    motionWant = +(el.getAttribute("data-motion") || 0);
    want = (CAM[name] || CAM.grove).slice();
    // Each engine gets its own framing as well as its own motion, so two worker
    // sections running back to back are never the same shot.
    if (motionWant) { want[1] += (motionWant - 3.5) * 0.30; want[2] += (motionWant - 3.5) * 1.10; }
    wake();
    var text = el.getAttribute("data-cap");
    if (cap && capBox) {
      if (text) { cap.innerHTML = text; capBox.classList.add("in"); }
      else capBox.classList.remove("in");
    }
  }

  var scenes = document.querySelectorAll("[data-shape]");
  if (scenes.length && "IntersectionObserver" in window) {
    var live = [];
    function pick() {
      var mid = window.innerHeight / 2, best = null, bestD = 1e9;
      live.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) { bestD = d; best = el; }
      });
      if (best) apply(best);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var at = live.indexOf(en.target);
        if (en.isIntersecting && at < 0) live.push(en.target);
        if (!en.isIntersecting && at >= 0) live.splice(at, 1);
      });
      pick();
    }, { threshold: 0 });
    scenes.forEach(function (el) { io.observe(el); });
    window.addEventListener("scroll", pick, { passive: true });
    apply(scenes[0]);
    from = to = SHAPES.indexOf(scenes[0].getAttribute("data-shape") || "tree");
    if (from < 0) from = to = 0;
    mix = 1;
  } else {
    from = to = SHAPES.indexOf("grove"); mix = 1;
    want = CAM.grove.slice(); shot = want.slice();
  }

  /* ══ camera ═══════════════════════════════════════════════════════════ */
  var mat = new Float32Array(16);
  // Eye and target share an x, so the camera only ever pitches. A yawing
  // camera would need the general lookAt and buys nothing here.
  function viewProj(cx, ey, ez, ty, aspect) {
    var f = 1 / Math.tan(0.95 / 2), near = 0.1, far = 300;
    var zy = ey - ty, zz = ez, zl = Math.hypot(zy, zz) || 1;
    zy /= zl; zz /= zl;
    var ty2 = -(zz * ey - zy * ez);
    var tz2 = -(zy * ey + zz * ez);
    var p0 = f / aspect, p5 = f, p10 = (far + near) / (near - far), p14 = (2 * far * near) / (near - far);
    mat[0] = p0;        mat[1] = 0;         mat[2] = 0;                mat[3] = 0;
    mat[4] = 0;         mat[5] = p5 * zz;   mat[6] = p10 * zy;         mat[7] = -zy;
    mat[8] = 0;         mat[9] = -p5 * zy;  mat[10] = p10 * zz;        mat[11] = -zz;
    mat[12] = p0 * -cx; mat[13] = p5 * ty2; mat[14] = p10 * tz2 + p14; mat[15] = -tz2;
    return mat;
  }

  /* ══ loop ═════════════════════════════════════════════════════════════ */
  var dpr = Math.min(window.devicePixelRatio || 1, LIGHT ? 1.4 : 1.75);
  var W = 0, H = 0;
  function resize() {
    var cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
    W = Math.max(1, Math.floor(cw * dpr)); H = Math.max(1, Math.floor(ch * dpr));
    canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H);
  }
  resize();
  window.addEventListener("resize", function () { resize(); wake(); }, { passive: true });

  var elapsed = 0, running = true, t0 = performance.now();
  // The scene is a still except while something is easing. Drawing 330k points
  // for a picture that is not changing is the whole cost of this file, and it
  // was being paid on every section of the page, including with the canvas
  // scrolled out of sight. So the loop parks itself and wake() restarts it.
  var idle = false;
  function needsFrame() {
    for (var q = 0; q < 4; q++) if (Math.abs(want[q] - shot[q]) > 0.0005) return true;
    if (mix < 0.999) return true;
    if (motionWant !== motion) return true;
    return motion !== 0;
  }
  function wake() {
    if (!idle || !running) return;
    idle = false;
    t0 = performance.now() - elapsed * 1000;
    requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) { t0 = performance.now() - elapsed * 1000; idle = false; requestAnimationFrame(frame); }
  });

  function frame(now) {
    if (!running) return;
    elapsed = (now - t0) / 1000;
    for (var i = 0; i < 4; i++) {
      shot[i] += (want[i] - shot[i]) * 0.05;
      if (Math.abs(want[i] - shot[i]) < 0.0005) shot[i] = want[i];
    }
    mix += (mixTarget - mix) * 0.045;
    if (mix > 0.9995) { mix = 1; from = to; }
    // Cutting from one motion to another mid-stride snaps the figure. Let it
    // settle to rest, change there, then let the new one build.
    if (motionWant !== motion) {
      motionAmp += (0 - motionAmp) * 0.14;
      if (motionAmp < 0.03) motion = motionWant;
    } else motionAmp += (1 - motionAmp) * 0.05;

    gl.bindBuffer(gl.ARRAY_BUFFER, vboPos);
    gl.vertexAttribPointer(lA, 3, gl.FLOAT, false, 0, from * STRIDE * 4);
    gl.vertexAttribPointer(lB, 3, gl.FLOAT, false, 0, to * STRIDE * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboKind);
    gl.vertexAttribPointer(lKA, 1, gl.FLOAT, false, 0, from * N * 4);
    gl.vertexAttribPointer(lKB, 1, gl.FLOAT, false, 0, to * N * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboSeed);
    gl.vertexAttribPointer(lS, 1, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(uVP, false, viewProj(shot[0], shot[1], shot[2], shot[3], W / H));
    gl.uniform1f(uMix, mix);
    gl.uniform1f(uMotion, motion);
    gl.uniform1f(uMotionAmp, motionAmp);
    gl.uniform1f(uTime, elapsed);
    gl.uniform1f(uScale, 30 * dpr * (LIGHT ? 1.5 : 1));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);
    if (needsFrame()) requestAnimationFrame(frame);
    else idle = true;   // parked: wake() brings it back
  }
  requestAnimationFrame(frame);

  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault(); running = false;
    var st1 = document.getElementById("stage"); if (st1) st1.remove();
  });
})();
