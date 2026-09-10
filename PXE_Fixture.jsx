// ============================================================================
// PXE_Fixture.jsx - synthetic test scene for the Parallaxie smoke suite
//
// Builds a deterministic multi-plane comp from SOLIDS only: no external files,
// no fonts, no Math.random, matchName-only property access. Run it standalone
// (File > Scripts > Run Script File) to get a demo comp to try the panel on,
// or let PXE_SmokeTest.jsx load it from the same folder.
//
// Exposes $.global.PXE_FIXTURE:
//   .make(opts) -> CompItem
//       opts.width / opts.height   comp size                    (default 1920x1080)
//       opts.fps / opts.duration   frame rate / seconds         (default 24 / 6)
//       opts.name                  comp name                    (default "PXE_TEST")
//       opts.renderer              comp.renderer matchName, e.g. "ADBE Picasso"
//                                  (Classic 3D) or "ADBE Advanced 3d"; default =
//                                  whatever AE gives a new comp (left untouched)
//       opts.splitter2D            also add an ENABLED 2D non-NN_ layer between
//                                  the planes, so every Build reports a 2D-split
//                                  WARN (default false - see note below)
//   .describe(comp) -> one-line string (size, renderer, stack top->bottom)
//   .warnings       -> array of non-fatal problems hit while building (e.g. an
//                      effect parameter matchName that did not resolve)
//
// Set $.global.PXE_FIXTURE_HEADLESS = true before $.evalFile to only define the
// builder without creating a comp (that is what the suite does).
//
// Stack after make() (top = nearest). Every size is derived from the comp size.
//   03_NEAR            cut-out solid, lower-left, radial ramp    -> z = 0 (nearest)
//   05_FX_PortalGlow   small additive glow solid                 -> co-planar with
//                      the first enabled non-FX plane below it (02_GATE_PLATE)
//   02_GATE_ALT        HIDDEN NN_ layer (must be reported, never rigged)
//   02_GATE_PLATE      full-frame plate WITH bleed, off-centre   -> mid depth
//   01_SKY_ALT         HIDDEN NN_ layer
//   01_SKY_PLATE       full-frame plate, ZERO bleed, linear ramp -> far
//
// Why solids and not shape/text layers: the suite's frame-0 lock is an md5 on
// rendered PNGs. Raster layers were what the lock was proven on; continuously
// rasterised vector layers add an unverified variable under that invariant.
// Why the 2D splitter is off by default: test 8.9 provisions its own 2D spacer,
// and a permanent splitter would put a second unverified variable under the md5
// lock (two 3D render groups instead of one). Flip opts.splitter2D on to try it.
// ============================================================================

(function () {

    var FIX = {};
    FIX.warnings = [];

    function warn(s) { FIX.warnings.push(s); }

    // Set an effect parameter by matchName; record (do not hide) a miss.
    function setP(fx, matchName, value, what) {
        try {
            var p = fx.property(matchName);
            if (!p) { warn(what + ": property " + matchName + " not found"); return; }
            p.setValue(value);
        } catch (e) { warn(what + ": " + e.toString()); }
    }

    // Gradient Ramp ("ADBE Ramp"). Points are in LAYER space (solid pixels).
    //   -0001 Start of Ramp  -0002 Start Color  -0003 End of Ramp
    //   -0004 End Color      -0005 Ramp Shape (1 = linear, 2 = radial)
    function ramp(l, p0, c0, p1, c1, shape) {
        var fx = l.property("ADBE Effect Parade").addProperty("ADBE Ramp");
        var n = l.name + " ramp";
        setP(fx, "ADBE Ramp-0001", p0, n);
        setP(fx, "ADBE Ramp-0002", [c0[0], c0[1], c0[2], 1], n);
        setP(fx, "ADBE Ramp-0003", p1, n);
        setP(fx, "ADBE Ramp-0004", [c1[0], c1[1], c1[2], 1], n);
        setP(fx, "ADBE Ramp-0005", shape || 1, n);
        return fx;
    }

    FIX.make = function (opts) {
        opts = opts || {};
        FIX.warnings = [];
        var W = opts.width || 1920, H = opts.height || 1080;
        var fps = opts.fps || 24, dur = opts.duration || 6;
        var comp = app.project.items.addComp(opts.name || "PXE_TEST", W, H, 1, dur, fps);
        if (opts.renderer) {
            try { comp.renderer = opts.renderer; }
            catch (eR) { warn("renderer '" + opts.renderer + "': " + eR.toString()); }
        }

        // addSolid inserts at the TOP, so add far-to-near (bottom first).
        function solid(name, w, h, rgb, pos, enabled) {
            var l = comp.layers.addSolid(rgb, name, Math.round(w), Math.round(h), 1, comp.duration);
            if (pos) l.position.setValue([Math.round(pos[0]), Math.round(pos[1])]);
            if (enabled === false) l.enabled = false;
            return l;
        }

        // 01_SKY_PLATE: exactly comp-size, centred -> zero bleed on every edge.
        // Any lateral move must pull empty canvas in behind it (tests 9.5-9.7).
        var sky = solid("01_SKY_PLATE", W, H, [0.15, 0.25, 0.45], null);
        ramp(sky, [0, 0], [0.10, 0.18, 0.42], [W, H], [0.62, 0.72, 0.92], 1);

        // hidden NN_ layer in the sky group (a left-behind alternate plate)
        solid("01_SKY_ALT", W + W / 9.6, H + H / 5.4, [0.10, 0.20, 0.40], null, false);

        // optional enabled 2D non-NN_ layer sitting between the planes
        if (opts.splitter2D)
            solid("WATERMARK_2D", W * 0.16, H * 0.06, [1, 1, 1], [W * 0.91, H * 0.95]);

        // 02_GATE_PLATE: full-frame WITH bleed, deliberately off-centre so the
        // frame-0 lock identity (test 1.8) is exercised on both axes.
        //   bleed x = W/12 per side, bleed y = H/10 per side,
        //   offset  = (-W/80, +H/30)  -> right bleed W/12 - W/80 still clears a
        //   10% Drift L at the depth Build assigns it in test 9.5.
        var bx = Math.round(W / 12), by = Math.round(H / 10);
        var gw = W + 2 * bx, gh = H + 2 * by;
        var gate = solid("02_GATE_PLATE", gw, gh, [0.35, 0.30, 0.25],
                         [W / 2 - Math.round(W / 80), H / 2 + Math.round(H / 30)]);
        ramp(gate, [gw / 2, gh / 2], [0.55, 0.42, 0.30], [gw, gh / 2], [0.18, 0.14, 0.10], 2);

        // hidden NN_ layer directly above the gate: the FX search below must
        // skip it and still land on 02_GATE_PLATE (test 1.7)
        solid("02_GATE_ALT", W + W / 4.8, H + H / 5.4, [0.30, 0.30, 0.30], null, false);

        // 05_FX_PortalGlow: additive glow riding the gate (cut-out, not a plate)
        var glow = solid("05_FX_PortalGlow", W / 4, H / 3.6, [1, 0.85, 0.45], [W * 0.55, H * 0.42]);
        ramp(glow, [W / 8, H / 7.2], [1.0, 0.85, 0.45], [W / 4, H / 7.2], [0, 0, 0], 2);
        glow.blendingMode = BlendingMode.ADD;

        // 03_NEAR: cut-out foreground solid (not full-frame -> checkMove skips it)
        var nearL = solid("03_NEAR", W * 0.573, H * 0.648, [0.10, 0.10, 0.12], [W * 0.35, H * 0.65]);
        ramp(nearL, [W * 0.2865, H * 0.324], [0.14, 0.14, 0.17], [W * 0.573, H * 0.324], [0.02, 0.02, 0.03], 2);

        // The engine resolves its target through app.project.activeItem, which is
        // null when several project items are selected. Make this comp the only one.
        try {
            for (var k = 1; k <= app.project.numItems; k++) app.project.item(k).selected = false;
            comp.selected = true;
        } catch (eSel) { warn("could not select comp in project panel: " + eSel.toString()); }

        return comp;
    };

    FIX.describe = function (comp) {
        var rend = "?";
        try { rend = comp.renderer; } catch (e) {}
        var names = [];
        for (var i = 1; i <= comp.numLayers; i++)
            names.push(comp.layer(i).name + (comp.layer(i).enabled ? "" : "(off)"));
        return comp.width + "x" + comp.height + " " + comp.frameRate + "fps " +
               comp.duration.toFixed(2) + "s renderer=" + rend + " stack: " + names.join(" > ");
    };

    $.global.PXE_FIXTURE = FIX;

    if ($.global.PXE_FIXTURE_HEADLESS === true) return;

    // standalone run: build the demo comp and show it
    var demo = FIX.make();
    demo.openInViewer();
    if (FIX.warnings.length) alert("PXE_Fixture built with warnings:\n" + FIX.warnings.join("\n"));

})();
