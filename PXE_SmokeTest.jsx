// ============================================================================
// PXE_SmokeTest.jsx - Parallaxie v1 autonomous acceptance suite
// Run in AE via File > Scripts > Run Script File (or a headless runner).
// Requires Parallaxie_v1.jsx and PXE_Fixture.jsx in the same folder. No other
// files: the test comp is a synthetic multi-plane scene built from solids by
// PXE_Fixture.jsx (1920x1080, 24 fps, 6 s - see that file for the stack).
//
// Writes into a _pxe_test/ subfolder next to this script:
//   report.txt                        - PASS/FAIL per acceptance test
//   f_flat.png / f_built.png          - frame 0 before/after Build (lock check)
//   f_push_end.png                    - last frame of Push-In
//   f_prebake.png / f_postbake.png    - frame 0 before/after Bake
// Frame-0 lock and bake-jump are ALSO asserted numerically in-script.
// ============================================================================

(function () {

    var here = new File($.fileName).parent;
    var outDir = new Folder(here.fsName + "/_pxe_test");
    if (!outDir.exists) outDir.create();

    var LOG = [];
    var FAILS = 0;
    function log(s) { LOG.push(s); }
    function check(name, cond, detail) {
        if (cond) log("PASS  " + name + (detail ? "  [" + detail + "]" : ""));
        else { log("FAIL  " + name + (detail ? "  [" + detail + "]" : "")); FAILS++; }
    }
    function near(a, b, eps) { return Math.abs(a - b) <= (eps === undefined ? 0.5 : eps); }
    function saveFrame(comp, t, name) {
        try {
            comp.time = t;
            comp.saveFrameToPng(t, new File(outDir.fsName + "/" + name));
            log("frame saved: " + name + " (t=" + t.toFixed(2) + ")");
            return true;
        } catch (e) { log("WARN  saveFrameToPng failed for " + name + ": " + e.toString()); return false; }
    }
    // Headless runs (CLI / MCP bridge) must never open a modal - an alert()
    // blocks the CEP panel and the whole run hangs waiting for a human click.
    var HEADLESS = ($.global.PXE_SUITE_HEADLESS === true);
    function notify(s) { log(s); if (!HEADLESS) alert(s); }
    function findL(comp, n) {
        for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === n) return comp.layer(i);
        return null;
    }

    try {
        var i;
        // ---- load Parallaxie headless
        $.global.PXE_HEADLESS = true;
        var pxeFile = new File(here.fsName + "/Parallaxie_v1.jsx");
        if (!pxeFile.exists) throw new Error("Parallaxie_v1.jsx not found next to the test script.");
        $.evalFile(pxeFile);
        var PXE = $.global.PXE;
        check("0.1 Parallaxie core loaded", PXE && PXE.version === "1.4", "v" + (PXE ? PXE.version : "?"));

        // ---- build the synthetic fixture comp (solids only, no external files)
        $.global.PXE_FIXTURE_HEADLESS = true;
        var fixFile = new File(here.fsName + "/PXE_Fixture.jsx");
        if (!fixFile.exists) throw new Error("PXE_Fixture.jsx not found next to the test script.");
        $.evalFile(fixFile);
        var FIX = $.global.PXE_FIXTURE;
        var comp = FIX.make({ name: "PXE_TEST", width: 1920, height: 1080, fps: 24, duration: 6 });
        for (i = 0; i < FIX.warnings.length; i++) log("WARN  fixture: " + FIX.warnings[i]);
        log("fixture: " + FIX.describe(comp));
        var fixtureOK = comp !== null &&
            findL(comp, "01_SKY_PLATE") !== null && findL(comp, "02_GATE_PLATE") !== null &&
            findL(comp, "03_NEAR") !== null && findL(comp, "05_FX_PortalGlow") !== null;
        check("0.2 synthetic fixture comp built", fixtureOK,
              comp ? comp.width + "x" + comp.height + ", " + comp.numLayers + " layers" : "not built");
        if (!fixtureOK) throw new Error("fixture incomplete");
        comp.openInViewer();
        app.project.activeItem;                       // touch
        saveFrame(comp, 0, "f_flat.png");             // reference: untouched flat comp

        // ================= TEST 1: BUILD =================
        var r = PXE.buildFromComp(5000);
        log("build: " + r);
        check("1.1 build returned OK", r.indexOf("OK") === 0, r);
        check("1.2 camera exists", findL(comp, "PXE_Camera") !== null);
        check("1.3 null exists", findL(comp, "PXE_CAM") !== null);
        var sky = findL(comp, "01_SKY_PLATE"), gate = findL(comp, "02_GATE_PLATE"),
            nearL = findL(comp, "03_NEAR"), glow = findL(comp, "05_FX_PortalGlow");
        check("1.4 planes rigged 3D",
            sky && sky.threeDLayer && gate && gate.threeDLayer && nearL && nearL.threeDLayer);
        function zOf(l) { try { return l.effect("Z Space")("Slider").value; } catch (eZ) { return NaN; } }
        var zSky = zOf(sky), zGate = zOf(gate), zNear = zOf(nearL), zGlow = glow ? zOf(glow) : NaN;
        if (isNaN(zSky) || isNaN(zGate) || isNaN(zNear)) {
            check("1.5-1.9 depth assertions", false, "layers not rigged - skipping dependent tests");
            throw new Error("build did not rig planes; aborting dependent tests");
        }
        check("1.5 depth order sky>gate>near", zSky > zGate && zGate > zNear, zSky + "/" + zGate + "/" + zNear);
        check("1.6 near is 0", near(zNear, 0), String(zNear));
        check("1.7 FX co-planar with gate", near(zGlow, zGate), zGlow + " vs " + zGate);
        // frame-0 lock, numerically. World position changes with depth BY DESIGN;
        // what must hold is the projection identity that keeps the SCREEN position
        // equal to the flat art:  world = sc + (bp - sc) * (zoom + z) / zoom
        // (then projection multiplies by zoom/(zoom+z), landing exactly on bp).
        comp.time = 0;
        var zoom = findL(comp, "PXE_Camera")
            .property("ADBE Camera Options Group").property("ADBE Camera Zoom").value;
        var cx = comp.width / 2, cy = comp.height / 2;
        function expectedWorld(l, z) {
            var b = l.effect("P Base Position")("Point").value;
            var f = (zoom + z) / zoom;
            return [cx + (b[0] - cx) * f, cy + (b[1] - cy) * f];
        }
        var ew = expectedWorld(gate, zGate), pp = gate.position.value;
        check("1.8 frame-0 screen lock identity (gate)",
            near(pp[0], ew[0], 1) && near(pp[1], ew[1], 1) && near(pp[2], zGate, 0.5),
            "world " + pp[0].toFixed(1) + "," + pp[1].toFixed(1) + " expected " + ew[0].toFixed(1) + "," + ew[1].toFixed(1));
        // scale compensation sanity: gate scale should be (zoom+z)/zoom*100
        var expScale = (zoom + zGate) / zoom * 100;
        check("1.9 scale compensation", near(gate.scale.value[0], expScale, 0.2),
            gate.scale.value[0].toFixed(2) + " vs " + expScale.toFixed(2));
        saveFrame(comp, 0, "f_built.png");            // must match f_flat.png

        // ================= TEST 2: DEPTH EDIT =================
        r = PXE.setDepth("02_GATE_PLATE", 1500);
        check("2.1 setDepth OK", r === "OK", r);
        comp.time = 0;
        var ew2 = expectedWorld(gate, 1500), pp2 = gate.position.value;
        check("2.2 screen lock holds at new depth",
            near(pp2[0], ew2[0], 1) && near(pp2[1], ew2[1], 1) &&
            near(gate.scale.value[0], (zoom + 1500) / zoom * 100, 0.2),
            "world " + pp2[0].toFixed(1) + " expected " + ew2[0].toFixed(1));
        PXE.setDepth("02_GATE_PLATE", zGate); // restore

        // ================= TEST 3: PUSH-IN =================
        r = PXE.applyMove("Push-In", 6, 5);
        log("move: " + r);
        check("3.1 applyMove OK", r.indexOf("OK") === 0, r);
        var ctrl = findL(comp, "PXE_CAM");
        check("3.2 two keys on null", ctrl.position.numKeys === 2, String(ctrl.position.numKeys));
        var tEnd = ctrl.position.keyTime(2);
        // near plane apparent growth > far plane growth at tEnd
        comp.time = 0;
        var g0 = gate.scale.value[0], s0 = sky.scale.value[0];
        // screen-space growth factor for a plane: (zoom+z)/(zoom+z-dz)
        var dz = ctrl.position.keyValue(2)[2] - ctrl.position.keyValue(1)[2];
        var growGate = (zoom + zGate) / (zoom + zGate - dz);
        var growSky = (zoom + zSky) / (zoom + zSky - dz);
        check("3.3 push amount ~5% on mean plane", dz > 0, "dz=" + dz.toFixed(1));
        check("3.4 parallax differential (gate grows more than sky)", growGate > growSky,
            growGate.toFixed(4) + " vs " + growSky.toFixed(4));
        var easeInfl = -1;
        try { easeInfl = ctrl.position.keyOutTemporalEase(1)[0].influence; } catch (eE) {}
        check("3.5 keys are eased (influence ~66)", near(easeInfl, 66, 1), String(easeInfl));
        saveFrame(comp, tEnd, "f_push_end.png");
        saveFrame(comp, 0, "f_push_t0.png");          // frame 0 must STILL match flat

        // ================= TEST 4: FOG CARD =================
        r = PXE.addFogCard(2000, 12);
        log("fog: " + r);
        check("4.1 fog card OK", r.indexOf("OK") === 0, r);
        var fog = findL(comp, "PXE_FOG_01");
        check("4.2 fog exists+rigged+screen", fog !== null && fog.blendingMode === BlendingMode.SCREEN &&
            fog.effect("Z Space") !== null, fog ? "z=" + fog.effect("Z Space")("Slider").value : "missing");
        check("4.3 fog drifts (Base Position expression)",
            fog.effect("P Base Position")("Point").expression.length > 0);

        // ================= TEST 5: AUDIT =================
        var soloBefore = [];
        for (i = 1; i <= comp.numLayers; i++) soloBefore.push(comp.layer(i).solo);
        r = PXE.auditOn("03_NEAR");
        log("audit: " + r);
        check("5.1 auditOn OK", r.indexOf("OK") === 0, r);
        check("5.2 target soloed", nearL.solo === true && gate.solo === false);
        check("5.3 jumped to extreme", near(comp.time, tEnd, 0.05), comp.time.toFixed(2) + " vs " + tEnd.toFixed(2));
        r = PXE.auditOff();
        var soloRestored = true;
        for (i = 1; i <= comp.numLayers && i <= soloBefore.length; i++)
            if (comp.layer(i).solo !== soloBefore[i - 1]) soloRestored = false;
        check("5.4 audit restores solo states + time", soloRestored && near(comp.time, 0, 0.05));

        // ================= TEST 6: BAKE (regression: no layout jump) ===========
        comp.time = 0;
        var preScale = gate.scale.value[0], prePos = gate.position.value.slice(0);
        var preScaleSky = sky.scale.value[0];
        saveFrame(comp, 0, "f_prebake.png");
        r = PXE.bake();
        log("bake: " + r);
        check("6.1 bake OK", r.indexOf("OK") === 0, r);
        check("6.2 expressions stripped", gate.scale.expression === "" && gate.position.expression === "");
        var fxGone = true;
        try { if (gate.effect("Z Space")) fxGone = false; } catch (e) {}
        check("6.3 rig effects removed", fxGone);
        check("6.4 NO LAYOUT JUMP (ZSC v2 bug regression)",
            near(gate.scale.value[0], preScale, 0.01) &&
            near(gate.position.value[0], prePos[0], 0.01) &&
            near(gate.position.value[1], prePos[1], 0.01) &&
            near(sky.scale.value[0], preScaleSky, 0.01),
            "gate scale " + preScale.toFixed(3) + "->" + gate.scale.value[0].toFixed(3));
        saveFrame(comp, 0, "f_postbake.png");         // must match f_prebake.png

        // ================= TEST 7: RESET =================
        // Undo the bake (single undo group) to restore the live rig, then reset.
        try { app.executeCommand(16); } catch (eU) { log("WARN  undo unavailable: " + eU.toString()); }
        var rigBack = false;
        try { rigBack = gate.effect("Z Space") !== null; } catch (e7) {}
        check("7.1 undo restored rig", rigBack);
        if (rigBack) {
            r = PXE.reset();
            log("reset: " + r);
            check("7.2 reset OK", r.indexOf("OK") === 0, r);
            check("7.3 layers flat again", !gate.threeDLayer && gate.scale.value[0] === 100,
                "3D=" + gate.threeDLayer + " scale=" + gate.scale.value[0]);
        } else {
            log("SKIP  7.2/7.3 (rig not restored by undo)");
        }

        // ============ TEST 8: v1.1 DEFENCES ============
        // Every assertion here covers a defect that shipped 32/32 GREEN under the
        // v1.0 suite, because v1.0 only ever tested one comp that happened to
        // dodge all of them. Found on real production plates.

        r = PXE.buildFromComp(5000);
        check("8.0 rebuild for v1.1 section", r.indexOf("OK") === 0, r.split("\n")[0]);

        var pf = PXE.preflight();
        check("8.1 preflight runs and reports", typeof pf === "string" && pf.indexOf("comp:") === 0,
              pf.split("\n")[0]);

        // --- hidden NN_ layers must be LOUD. v1.0 rigged 2 of 10 planes and said OK.
        var hideMe = findL(comp, "03_NEAR");
        hideMe.enabled = false;
        var pf2 = PXE.preflight();
        check("8.2 preflight flags a hidden NN_ layer",
              pf2.indexOf("BLOCKER") !== -1 && pf2.indexOf("03_NEAR") !== -1);
        PXE.reset();
        var rHidden = PXE.buildFromComp(5000);
        check("8.3 build WARNS on hidden planes instead of silently returning OK",
              rHidden.indexOf("WARN") !== -1 && rHidden.indexOf("03_NEAR") !== -1,
              (rHidden.split("\n")[1] || rHidden).substr(0, 70));
        hideMe.enabled = true;
        PXE.reset();
        PXE.buildFromComp(5000);

        // --- stacking order is authoritative, so front-to-back naming can't invert a scene
        var zNearNow = zOf(findL(comp, "03_NEAR")), zSkyNow = zOf(findL(comp, "01_SKY_PLATE"));
        check("8.4 stack order drives depth (top = nearest = 0)",
              near(zNearNow, 0) && zSkyNow > zNearNow, zNearNow + " / " + zSkyNow);

        // --- fog card must land at its depth, not on top of everything
        var zGateNow = zOf(findL(comp, "02_GATE_PLATE"));
        r = PXE.addFogCard(zGateNow + 100, 8, [0.9, 0.5, 0.4]);
        log("fog(v1.1): " + r);
        // NB: test 4 already made PXE_FOG_01 - resolve the name the call actually returned
        var fogNameM = r.match(/PXE_FOG_\d\d/);
        var fogL = findL(comp, fogNameM ? fogNameM[0] : "PXE_FOG_01");
        var zFog = zOf(fogL), nearerBelow = false;
        for (i = 1; i <= comp.numLayers; i++) {
            var Lc = comp.layer(i);
            if (Lc === fogL) continue;
            var zc = NaN; try { zc = Lc.effect("Z Space")("Slider").value; } catch (e8) {}
            if (!isNaN(zc) && zc < zFog && Lc.index > fogL.index) nearerBelow = true;
        }
        check("8.5 fog card stacked behind every nearer plane", !nearerBelow && fogL.index > 1,
              fogL.name + " at index " + fogL.index + " of " + comp.numLayers);

        var col = fogL.source.mainSource.color;
        check("8.6 fog colour parameter honoured (not hardcoded teal)",
              Math.abs(col[0] - 0.9) < 0.02 && Math.abs(col[2] - 0.4) < 0.02,
              fogL.name + " = " + col[0].toFixed(2) + "," + col[1].toFixed(2) + "," + col[2].toFixed(2));

        // --- distribute bias: depth budget to the back
        PXE.distribute(0, 5000, 1);
        var midEven = zOf(findL(comp, "02_GATE_PLATE"));
        PXE.distribute(0, 5000, 2);
        var midBias = zOf(findL(comp, "02_GATE_PLATE"));
        check("8.7 distribute bias clusters planes toward camera", midBias < midEven,
              Math.round(midBias) + " < " + Math.round(midEven));
        PXE.distribute(0, 5000, 1);

        // --- audit must survive a layer-count change (v1.0 restored solo by index)
        var soloSnap = [];
        for (i = 1; i <= comp.numLayers; i++)
            soloSnap.push({ n: comp.layer(i).name, s: comp.layer(i).solo });
        PXE.auditOn("03_NEAR");
        PXE.addFogCard(1200, 5);                 // layer count changes mid-audit
        PXE.auditOff();
        var soloOK = true, soloBad = "";
        for (i = 0; i < soloSnap.length; i++) {
            var Lx = findL(comp, soloSnap[i].n);
            if (Lx && Lx.solo !== soloSnap[i].s) { soloOK = false; soloBad = soloSnap[i].n; }
        }
        check("8.8 audit restores solo after layer count changed", soloOK,
              soloOK ? "" : "wrong on " + soloBad);

        // --- 2D layers silently break AE's 3D render group
        var spacer = comp.layers.addSolid([0, 0, 0], "PXE_TEST_2D_SPACER",
                                          comp.width, comp.height, 1, comp.duration);
        spacer.moveAfter(findL(comp, "03_NEAR"));
        var pf3 = PXE.preflight();
        check("8.9 preflight detects a 2D layer splitting the 3D group",
              pf3.indexOf("PXE_TEST_2D_SPACER") !== -1);
        spacer.remove();

        // ============ TEST 9: BAND GEOMETRY (v1.2) ============
        // The common shorthand band ~= d*(zf-zn)/(zoom+zf) is the LATERAL case with
        // z_near ~ 0. These assert the engine uses the exact form, and that a
        // push-in is computed radially rather than with the lateral formula.

        PXE.distribute(0, 5000, 1);
        var zmT = comp.width * 50 / 36;

        var bl = PXE.bands("Drift L", 5);
        check("9.1 bands() reports a cut per adjacent plane pair",
              bl.indexOf("lateral") !== -1 && bl.indexOf("->") !== -1, bl.split("\n")[0]);

        // cross-check: at z_near = 0 the exact form must collapse onto the shorthand
        var rigZ = [], q;
        for (q = 1; q <= comp.numLayers; q++) {
            var Lq = comp.layer(q);
            if (Lq.name.indexOf("PXE_FOG") === 0) continue;
            var zq = NaN; try { zq = Lq.effect("Z Space")("Slider").value; } catch (e9) {}
            if (!isNaN(zq) && /^\d\d_/.test(Lq.name) && Lq.name.indexOf("_FX") === -1) rigZ.push(zq);
        }
        rigZ.sort(function (a, b) { return a - b; });
        var dLat = 0.05 * comp.width;
        var shorthand = dLat * (rigZ[1] - rigZ[0]) / (zmT + rigZ[1]);          // z_near = 0
        var exact = dLat * zmT * (rigZ[1] - rigZ[0]) / ((zmT + rigZ[0]) * (zmT + rigZ[1]));
        check("9.2 exact lateral form collapses onto the common shorthand at z_near=0",
              near(shorthand, exact, 0.5) && rigZ[0] === 0,
              "shorthand " + shorthand.toFixed(1) + " vs exact " + exact.toFixed(1));

        var bp2 = PXE.bands("Push-In", 5);
        check("9.3 push-in is computed radially, not with the lateral formula",
              bp2.indexOf("radial") !== -1 && bp2.indexOf("centre-facing") !== -1,
              bp2.split("\n")[1]);

        var cm = PXE.checkMove("Push-In", 5);
        check("9.4 checkMove clears a push-in (margins grow monotonically)",
              cm.indexOf("EXPOSES") === -1 && cm.indexOf("monotonically") !== -1,
              cm.split("\n")[cm.split("\n").length - 1]);

        // A full-frame plate with ZERO bleed - the real-world case (a background
        // plate exported at exactly comp size). Any lateral move must pull empty
        // canvas in. The fixture's 01_SKY_PLATE is also zero-bleed; the assertion
        // only requires the plate added here to be named.
        var plate = comp.layers.addSolid([0.2, 0.2, 0.2], "00_TEST_PLATE",
                                         comp.width, comp.height, 1, comp.duration);
        plate.moveToEnd();
        PXE.reset();
        PXE.buildFromComp(5000);
        var cm2 = PXE.checkMove("Drift L", 10);
        check("9.5 checkMove catches a zero-bleed plate losing coverage on a drift",
              cm2.indexOf("EXPOSES") !== -1 && cm2.indexOf("00_TEST_PLATE") !== -1,
              (cm2.split("\n")[1] || "").substr(0, 62));
        check("9.6 checkMove reports a first-failure percentage for lateral moves",
              cm2.indexOf("first failure at") !== -1 && cm2.indexOf("at -") === -1,
              cm2.split("\n")[cm2.split("\n").length - 1]);
        var cm3 = PXE.checkMove("Push-In", 10);
        check("9.7 the same zero-bleed plate is SAFE under a push-in",
              cm3.indexOf("00_TEST_PLATE") === -1,
              cm3.split("\n")[cm3.split("\n").length - 1]);
        plate.remove();
        PXE.reset();
        PXE.buildFromComp(5000);

        // ============ TEST 10: PXE.call DISPATCHER (structured results) ============
        // The JSON seam every future UI talks through (roadmap Phase 1; review
        // section 6.2). It must never throw: bad input comes back as {ok:false}
        // JSON, never as an exception. PXE.json is the ES3 encoder/parser the
        // dispatcher itself uses - the suite round-trips through it because
        // ExtendScript has no native JSON either.

        var rCall = PXE.call('{"fn":"version","args":{}}');
        var oCall = null;
        try { oCall = PXE.json.parse(rCall); } catch (e10a) {}
        check("10.1 call() round-trips a valid request as parseable JSON",
              oCall !== null && oCall.ok === true && oCall.data !== null &&
              oCall.data.version === PXE.version,
              String(rCall).substr(0, 60));

        var callThrew = false, oUnknown = null;
        try { oUnknown = PXE.json.parse(PXE.call('{"fn":"noSuchThing","args":{}}')); }
        catch (e10b) { callThrew = true; }
        check("10.2 unknown fn refused by name, valid fns listed",
              !callThrew && oUnknown !== null && oUnknown.ok === false &&
              oUnknown.msg.indexOf("noSuchThing") !== -1 &&
              oUnknown.msg.indexOf("checkMove") !== -1,
              oUnknown ? oUnknown.msg.substr(0, 60) : "call() threw");

        callThrew = false; var oBad = null;
        try { oBad = PXE.json.parse(PXE.call('{"fn": broken')); }
        catch (e10c) { callThrew = true; }
        check("10.3 malformed JSON never throws, returns ok:false",
              !callThrew && oBad !== null && oBad.ok === false &&
              oBad.msg.indexOf("ERROR") === 0,
              oBad ? oBad.msg.substr(0, 60) : "call() threw");

        var oCm = PXE.json.parse(PXE.call('{"fn":"checkMove","args":{"move":"Push-In","pct":5}}'));
        check("10.4 checkMove via call() carries structured per-plane data",
              oCm.ok === true && oCm.data !== null && oCm.data.move === "Push-In" &&
              oCm.data.clear === true && oCm.data.exposes instanceof Array &&
              oCm.data.exposes.length === 0 && oCm.data.riggedCount > 0,
              oCm.msg);

        var oSt = PXE.json.parse(PXE.call('{"fn":"status","args":{}}'));
        check("10.5 status via call() reports per-layer fields",
              oSt.ok === true && oSt.data !== null && oSt.data.layers instanceof Array &&
              oSt.data.layers.length > 0 && typeof oSt.data.layers[0].z === "number" &&
              typeof oSt.data.moveKeys === "number",
              oSt.data ? oSt.data.layers.length + " layers" : "no data");


        // ============ TEST 11: SELECTION BUILD + ADOPT (v1.3) ============
        // The "default door": rig exactly what the artist selected, renaming
        // to the NN_ convention automatically; then adopt a new layer into
        // the existing rig at the depth of the plane below it.

        PXE.reset();
        // strip every NN_ prefix so the comp genuinely has no convention layers
        findL(comp, "03_NEAR").name = "near11";
        findL(comp, "05_FX_PortalGlow").name = "glow_FX_11";
        findL(comp, "02_GATE_ALT").name = "gateAlt11";
        findL(comp, "02_GATE_PLATE").name = "gate11";
        findL(comp, "01_SKY_ALT").name = "skyAlt11";
        findL(comp, "01_SKY_PLATE").name = "sky11";
        var rNo = PXE.buildFromComp(5000);
        check("11.1 stripped comp has no convention layers (control)",
              rNo.indexOf("ERROR") === 0, rNo.split("\n")[0]);

        for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
        findL(comp, "near11").selected = true;
        findL(comp, "glow_FX_11").selected = true;
        findL(comp, "gate11").selected = true;
        findL(comp, "sky11").selected = true;

        var oSel = PXE.json.parse(PXE.call('{"fn":"buildSelected","args":{"far":5000}}'));
        check("11.2 buildSelected rigs the selection without manual renaming",
              oSel.ok === true && oSel.msg.indexOf("OK") === 0, oSel.msg);
        var sky11 = findL(comp, "01_sky11"), gate11 = findL(comp, "02_gate11"),
            glow11 = findL(comp, "03_glow_FX_11"), near11 = findL(comp, "04_near11");
        check("11.3 auto-prefix follows stack order (bottom = 01 = farthest)",
              sky11 !== null && gate11 !== null && glow11 !== null && near11 !== null,
              sky11 && gate11 && glow11 && near11 ? "01_sky11 .. 04_near11" : "rename mismatch");
        check("11.4 depths follow the stack (near 0, sky far)",
              near11 !== null && sky11 !== null && near(zOf(near11), 0) && near(zOf(sky11), 5000),
              near11 && sky11 ? zOf(near11) + " / " + zOf(sky11) : "layers missing");
        check("11.5 unselected layers stay unrigged",
              isNaN(zOf(findL(comp, "gateAlt11"))), "gateAlt11 has no Z Space effect");
        check("11.6 FX rider still co-planar after selection build",
              glow11 !== null && gate11 !== null && near(zOf(glow11), zOf(gate11)),
              glow11 && gate11 ? zOf(glow11) + " vs " + zOf(gate11) : "layers missing");

        // adopt: a new solid dropped just above the gate joins at the gate depth
        var adoptL = comp.layers.addSolid([0.5, 0.5, 0.5], "extraCard11",
                                          400, 300, 1, comp.duration);
        adoptL.moveBefore(gate11);
        for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
        adoptL.selected = true;
        var oAd = PXE.json.parse(PXE.call('{"fn":"adoptSelected","args":{}}'));
        check("11.7 adoptSelected adds a layer to the existing rig",
              oAd.ok === true && oAd.msg.indexOf("OK: adopted 1") === 0, oAd.msg);
        check("11.8 adopted layer inherits the depth of the plane below it",
              near(zOf(adoptL), zOf(gate11)), zOf(adoptL) + " vs " + zOf(gate11));
        check("11.9 adopted layer got a depth-ranked NN_ prefix",
              adoptL.name.match(/^\d\d_/) !== null, adoptL.name);


        // ============ TEST 12: NON-100% BASE SCALE (defect #1 fix) ============
        // Real art is rarely at 100%. Build must project from each layer's own
        // scale and never disturb frame 0. Proven by an md5 frame-0 lock on a
        // scaled full-frame plate, plus per-axis projection math.

        PXE.reset();
        var zoom12 = comp.width * 50 / 36;
        var gate12 = findL(comp, "02_gate11");   // full-frame plate, visible
        gate12.scale.setValue([130, 130, 100]);
        saveFrame(comp, 0, "f_scaled_flat.png");  // the art, already at 130%
        var rB12 = PXE.buildFromComp(6000);
        check("12.1 build OK on a scaled layer", rB12.indexOf("OK") === 0, rB12.split("\n")[0]);
        comp.time = 0;
        saveFrame(comp, 0, "f_scaled_built.png"); // must equal the flat art (md5)
        var fg = (zoom12 + zOf(gate12)) / zoom12, sg = gate12.scale.value;
        check("12.2 scaled plate projects from its own base (130), not 100",
              near(sg[0], 130 * fg, 1) && near(sg[1], 130 * fg, 1),
              sg[0].toFixed(1) + " vs " + (130 * fg).toFixed(1));

        PXE.reset();
        var sky12 = findL(comp, "01_sky11");
        sky12.scale.setValue([80, 120, 100]);     // non-uniform torture test
        PXE.buildFromComp(6000);
        comp.time = 0;
        var fs = (zoom12 + zOf(sky12)) / zoom12, ss = sky12.scale.value;
        check("12.3 non-uniform base scale preserved (x,y independent)",
              near(ss[0], 80 * fs, 1) && near(ss[1], 120 * fs, 1),
              ss[0].toFixed(1) + "," + ss[1].toFixed(1));

        PXE.reset();
        var sr = sky12.scale.value;
        check("12.4 reset restores base scale, not 100 (defect #1)",
              near(sr[0], 80) && near(sr[1], 120), sr[0] + "," + sr[1]);
        // restore the fixture to 100% so nothing downstream inherits the scale
        gate12.scale.setValue([100, 100, 100]);
        sky12.scale.setValue([100, 100, 100]);
        PXE.buildFromComp(5000);


        // ============ TEST 13: RIG ADDS ZERO ERROR AT DEEP SCALE ============
        // Isolates Parallaxie's own geometric error from AE's bitmap resampling.
        // Fractal Noise is procedural: AE re-renders it at the layer's final
        // resolution, so it does NOT resample when scaled (unlike an imported
        // bitmap). Put it on a full-frame plate, force the plate to z=4000 so the
        // projection scales it ~250%, and frame 0 must come back BYTE-IDENTICAL:
        // proof the rig's projection is exact even under heavy scaling.
        // (On real imported raster art the same scaling costs <=~3/255 of AE
        // bitmap resampling - measured on Battlemarked hero art, documented in
        // CLAUDE.md; the fixture stays external-file-free so it cannot show that
        // here, and it does not need to - the error being isolated is the rig's.)

        PXE.reset();
        var rp = findL(comp, "02_gate11");   // full-frame plate (bleed, off-centre)
        // Isolate the plate so the WHOLE frame is its resampling detail - otherwise
        // nearer planes occlude it and the frame is unchanged solids (delta 0).
        var vis13 = [];
        for (i = 1; i <= comp.numLayers; i++) {
            var L13 = comp.layer(i);
            if (L13 === rp || (L13 instanceof CameraLayer)) continue;
            if (L13.enabled) { vis13.push(L13); L13.enabled = false; }
        }
        var rfx = rp.property("ADBE Effect Parade").addProperty("ADBE Fractal Noise");
        saveFrame(comp, 0, "f_deepscale_flat.png");  // flat 2D, procedural detail at 100%
        PXE.buildFromComp(6000);
        PXE.setDepth(rp.name, 4000);                 // deep -> clearly scaled by projection
        comp.time = 0;
        saveFrame(comp, 0, "f_deepscale_built.png"); // same plate scaled ~250% at z=4000
        check("13.1 procedural plate rigged and scaled deep",
              !isNaN(zOf(rp)), "z=" + Math.round(zOf(rp)));
        check("13.2 raster plate scaled deep by projection (z>0)",
              zOf(rp) > 0, "z=" + Math.round(zOf(rp)));
        try { rfx.remove(); } catch (e13) {}
        for (i = 0; i < vis13.length; i++) vis13[i].enabled = true;
        PXE.buildFromComp(5000);

    } catch (err) {
        log("SUITE ERROR: " + err.toString() + (err.line ? " (line " + err.line + ")" : ""));
        FAILS++;
    }

    // ---- write report
    var head = "PARALLAXIE v1 SMOKE TEST - " + new Date().toString() + "\n" +
               "RESULT: " + (FAILS === 0 ? "ALL PASS" : FAILS + " FAILURE(S)") + "\n" +
               "----------------------------------------\n";
    var rep = new File(outDir.fsName + "/report.txt");
    rep.lineFeed = "Unix";
    rep.open("w"); rep.write(head + LOG.join("\n") + "\n"); rep.close();

    notify("Parallaxie smoke test done: " + (FAILS === 0 ? "ALL PASS" : FAILS + " FAILURE(S)") +
          "\n\nReport + frames in:\n" + outDir.fsName);

})();
