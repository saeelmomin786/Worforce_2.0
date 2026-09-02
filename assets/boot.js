/* boot.js — the only script that runs on every page load.
   Nav, reveal-on-scroll, and deciding whether the 3D is allowed to run at all.
   Everything here is cheap. The expensive part loads later, or never. */
(function () {
  "use strict";

  /* ── nav ──────────────────────────────────────────────────────────────── */
  var toggle = document.querySelector(".navtoggle");
  var links = document.getElementById("navlinks");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // A link tap inside the open menu should close it, including same-page anchors.
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ── reveal ───────────────────────────────────────────────────────────── */
  var rv = document.querySelectorAll(".rv");
  if (rv.length) {
    if (!("IntersectionObserver" in window)) {
      // No observer means no animation. Content still has to be visible.
      for (var i = 0; i < rv.length; i++) rv[i].classList.add("in");
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
      rv.forEach(function (el) { io.observe(el); });
    }
  }

  /* ── copy the install command ─────────────────────────────────────────
     Above the 3D guard on purpose: that guard returns early on every page
     without a canvas, and anything below it would never run there. */
  var copiers = document.querySelectorAll("[data-copy]");
  for (var c = 0; c < copiers.length; c++) {
    copiers[c].addEventListener("click", function () {
      var btn = this, src = document.querySelector(btn.getAttribute("data-copy"));
      if (!src) return;
      var label = btn.textContent;
      var done = function () {
        btn.textContent = "Copied"; btn.classList.add("done");
        setTimeout(function () { btn.textContent = label; btn.classList.remove("done"); }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(src.textContent.trim()).then(done, select);
      else select();
      function select() {   // no clipboard permission: hand them a selection to copy
        var r = document.createRange(); r.selectNodeContents(src);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      }
    });
  }

  /* ── which 3D path is this device allowed? ────────────────────────────
     Three tiers, cheapest first. The decision is made before anything is
     fetched, so a phone on a train never downloads the renderer at all. */
  function tier() {
    var c = navigator.connection || {};
    var slow = /^(slow-2g|2g|3g)$/.test(c.effectiveType || "");
    // Two different ways of saying no, wanting opposite things. Data saver and
    // a 2G connection are asking for fewer bytes, so they get nothing at all.
    // Reduced motion and a machine without WebGL2 are asking for no MOVEMENT,
    // and they have the bandwidth for a picture, so they get a still.
    if (c.saveData || slow) return "none";

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return "poster";

    var canvas = document.createElement("canvas");
    var gl = null;
    try { gl = canvas.getContext("webgl2"); } catch (e) { /* blocked or unsupported */ }
    if (!gl) return "poster";

    // Having WebGL2 is not the same as having a GPU. With hardware acceleration
    // off — no driver, a VM, an old laptop, a locked-down machine, or Chrome
    // blocklisting the chip — getContext() still hands back a context and every
    // point is then rasterised on the CPU. Measured on exactly such a machine:
    // 2.2fps and 460ms frames, i.e. unusable. Plenty of visitors are in this
    // state, so it is a first-class case, not an edge case: give them the still.
    var soft = false;
    try {
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      var rend = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
      soft = /SwiftShader|Basic Render|llvmpipe|Software Adapter|Mesa OffScreen|Microsoft Basic/i.test(rend);
    } catch (e) { /* extension unavailable: fall through on the other signals */ }
    if (soft) return "poster";

    var small = window.matchMedia && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    // deviceMemory is undefined outside Chromium AND on some Chromium builds,
    // so the "|| 8" default quietly treated an unknown machine as a big one.
    // Fall back to core count, which is far more widely reported.
    var lowmem = (navigator.deviceMemory || 8) < 4 || (navigator.hardwareConcurrency || 8) <= 4;
    return (small || lowmem) ? "light" : "full";
  }

  var world = document.getElementById("world");
  if (!world) return;

  var t = tier();
  document.documentElement.setAttribute("data-3d", t);

  if (t === "none") {
    world.remove();     // fewest bytes wins; the page content carries the page
    return;
  }

  if (t === "poster") {
    // A still instead of the renderer. Set here rather than in the HTML so the
    // other tiers never download an image they paint over.
    var stage = document.getElementById("stage");
    var sections = document.querySelectorAll("[data-shape]");
    var shown = "";
    function show(shape) {
      if (!stage || !shape || shape === shown) return;
      shown = shape;
      stage.style.backgroundImage = "url(/assets/img/stage-" + shape + ".webp)";
    }
    show((sections[0] && sections[0].getAttribute("data-shape")) || "grove");

    // Follow the sections on scroll. This tier is now a first-class case, not a
    // rarity — a machine with no GPU acceleration lands here — so it gets the
    // same beat-by-beat imagery, just as stills. Swapping a background costs
    // nothing next to rendering a point cloud, and each shape is one small webp.
    if (sections.length > 1) {
      var ticking = false;
      var pick = function () {
        ticking = false;
        var mid = window.innerHeight / 2, best = null, bestD = 1e9;
        for (var i = 0; i < sections.length; i++) {
          var r = sections[i].getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) continue;
          var d = Math.abs(r.top + r.height / 2 - mid);
          if (d < bestD) { bestD = d; best = sections[i]; }
        }
        if (best) show(best.getAttribute("data-shape"));
      };
      window.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(pick);
      }, { passive: true });
      pick();
    }
    world.remove();
    return;
  }

  // Deferred, and only after the browser has finished with the real content.
  // The 3D is decoration; it must never compete with the first paint.
  var start = function () {
    var s = document.createElement("script");
    s.src = "/assets/banyan.js";
    s.defer = true;
    s.onerror = function () { world.remove(); };  // a missing renderer is not a broken page
    document.head.appendChild(s);
  };

  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2500 });
  else window.addEventListener("load", function () { setTimeout(start, 200); });
})();
