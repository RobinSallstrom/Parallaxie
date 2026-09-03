// ============================================================================
// PARALLAXIE v1.0
// 2.5D parallax rig-and-animate panel for After Effects
// Robin Sallstrom x Claude - 2026 - successor to Z Space Controller v2
//
// Core is scriptable at $.global.PXE (see bottom of file for API list).
// Run as dockable panel (ScriptUI Panels folder) or File > Scripts.
// Set $.global.PXE_HEADLESS = true before evaluating to suppress the UI.
// ============================================================================

(function parallaxie(thisObj) {

    // ------------------------------------------------------------ constants
    var VERSION = "1.2";
    var FX_TOKEN = "_FX";              // layers containing this ride co-planar
    var NAME_RX = /^(\d\d)_/;          // plane naming convention 01_ ... 0N_
    var CAM_NAME = "PXE_Camera";
    var NULL_NAME = "PXE_CAM";
    var FOG_PREFIX = "PXE_FOG_";
    var FOCAL_MM = 50, FILM_MM = 36;
    var EFX_Z = "Z Space";             // ZSC v2-compatible slider name
    var EFX_SC = "Scale Center";
    var EFX_BP = "P Base Position";    // replaces valueAtTime(0)  [ZSC bug #3 fix]

    var PRESETS = { "Room": 1500, "Exterior": 5000, "Epic Vista": 8000, "Custom": 5000 };
    var MOVES = ["Push-In", "Pull-Back", "Drift L", "Drift R", "Rise", "Sink"];

    // ------------------------------------------------------------ expressions
    var SCALE_EXPR =
        "cam = thisComp.activeCamera;\n" +
        "z = effect(\"" + EFX_Z + "\")(\"Slider\");\n" +
        "f = ((cam.zoom + z) / cam.zoom) * 100;\n" +
        "[f, f, 100];";

    var POS_EXPR =
        "z = effect(\"" + EFX_Z + "\")(\"Slider\");\n" +
        "sc = effect(\"" + EFX_SC + "\")(\"Point\");\n" +
        "bp = effect(\"" + EFX_BP + "\")(\"Point\");\n" +
        "cam = thisComp.activeCamera;\n" +
        "f = (cam.zoom + z) / cam.zoom;\n" +
        "[sc[0] + (bp[0] - sc[0]) * f, sc[1] + (bp[1] - sc[1]) * f, z];";

    // ------------------------------------------------------------ helpers
    function activeComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }
    function isCamOrLight(l) { return (l instanceof CameraLayer) || (l instanceof LightLayer); }
    function nameNum(l) { var m = l.name.match(NAME_RX); return m ? parseInt(m[1], 10) : null; }
    function isFx(l) { return l.name.toUpperCase().indexOf(FX_TOKEN) !== -1; }
    function isFog(l) { return l.name.indexOf(FOG_PREFIX) === 0; }
    function isRigged(l) {
        try { return l.effect(EFX_Z) !== null; } catch (e) { return false; }
    }
    function getZ(l) { return l.effect(EFX_Z)("Slider").value; }
    function setZraw(l, z) { l.effect(EFX_Z)("Slider").setValue(z); }

    // all convention layers, enabled, non-cam; each entry {layer, num, fx, fog}
    function sceneLayers(comp) {
        var out = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            if (isCamOrLight(l) || !l.enabled) continue;
            if (nameNum(l) === null && !isFog(l)) continue;
            out.push({ layer: l, num: nameNum(l), fx: isFx(l), fog: isFog(l) });
        }
        return out;
    }
    function planesOnly(comp) { // rig targets that get auto depth (not FX, not fog)
        var s = sceneLayers(comp), out = [];
        for (var i = 0; i < s.length; i++) if (!s[i].fx && !s[i].fog) out.push(s[i]);
        return out;
    }

    // ---- diagnostics (v1.1) -------------------------------------------------
    // NN_ layers the artist left hidden. buildFromComp silently skips these,
    // which is how a 10-plane shot rigs 2 planes and still reports OK.
    function hiddenPlaneNames(comp) {
        var out = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            if (isCamOrLight(l)) continue;
            if (nameNum(l) !== null && !l.enabled) out.push(l.name);
        }
        return out;
    }

    // How the NN_ numbering runs relative to AE stacking order.
    // "back-to-front" = 01 at the bottom = farthest  (the 01_SKY house convention)
    // "front-to-back" = 01 at the top    = nearest   (inverse; common in export stacks)
    function nameStackRelation(comp) {
        var p = planesOnly(comp);
        if (p.length < 2) return "n/a";
        p.sort(function (a, b) { return a.layer.index - b.layer.index; });
        var asc = true, desc = true;
        for (var i = 1; i < p.length; i++) {
            if (p[i].num < p[i - 1].num) asc = false;
            if (p[i].num > p[i - 1].num) desc = false;
        }
        if (desc && !asc) return "back-to-front";
        if (asc && !desc) return "front-to-back";
        return "mixed";
    }

    // Enabled 2D layers sitting BETWEEN rigged 3D layers. AE terminates a 3D
    // render group at any 2D layer, so these silently break depth sorting:
    // planes above and below composite in separate groups by stacking order.
    function twoDSplitters(comp) {
        var first = 0, last = 0, i;
        for (i = 1; i <= comp.numLayers; i++)
            if (isRigged(comp.layer(i))) { if (!first) first = i; last = i; }
        var out = [];
        if (!first) return out;
        for (i = first + 1; i < last; i++) {
            var l = comp.layer(i);
            if (isCamOrLight(l) || !l.enabled) continue;
            if (!l.threeDLayer) out.push(l.name);
        }
        return out;
    }

    // Move a rigged layer to the stack slot its depth implies: just below the
    // deepest layer that is still nearer than it. Returns the anchor name.
    function restackByDepth(comp, l) {
        if (!isRigged(l)) return null;
        var z = getZ(l), anchor = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            var c = comp.layer(i);
            if (c === l || isCamOrLight(c) || !isRigged(c)) continue;
            if (getZ(c) < z) anchor = c;
        }
        if (anchor) l.moveAfter(anchor);
        return anchor ? anchor.name : null;
    }

    // Fog cards whose stacking slot contradicts their depth.
    function misstackedFog(comp) {
        var out = [], i, j;
        for (i = 1; i <= comp.numLayers; i++) {
            var f = comp.layer(i);
            if (!isFog(f) || !isRigged(f)) continue;
            var fz = getZ(f);
            for (j = 1; j <= comp.numLayers; j++) {
                var c = comp.layer(j);
                if (c === f || isCamOrLight(c) || !isRigged(c) || isFog(c)) continue;
                // a nearer plane must never sit BELOW the fog in the stack
                if (getZ(c) < fz && c.index > f.index) { out.push(f.name); break; }
            }
        }
        return out;
    }
    function riggedLayers(comp) {
        var out = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            if (!isCamOrLight(l) && isRigged(l)) out.push(l);
        }
        return out;
    }
    function findLayer(comp, name) {
        for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return comp.layer(i);
        return null;
    }
    function zoomPx(comp) { return comp.width * FOCAL_MM / FILM_MM; }

    function ensureRig(comp) { // camera + null; returns {cam, ctrl}
        var cx = comp.width / 2, cy = comp.height / 2, zm = zoomPx(comp);
        var ctrl = findLayer(comp, NULL_NAME);
        if (!ctrl) {
            ctrl = comp.layers.addNull(comp.duration);
            ctrl.name = NULL_NAME;
            ctrl.threeDLayer = true;
            ctrl.position.setValue([cx, cy, 0]);
            ctrl.moveToBeginning();
        }
        var cam = findLayer(comp, CAM_NAME);
        if (!cam) {
            cam = comp.layers.addCamera(CAM_NAME, [cx, cy]);
            cam.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
            cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(zm);
            cam.parent = ctrl;
            cam.position.setValue([0, 0, -zm]);
            cam.moveToBeginning();
        }
        return { cam: cam, ctrl: ctrl };
    }

    function rigLayer(comp, l, depth) {
        var cx = comp.width / 2, cy = comp.height / 2;
        if (!l.threeDLayer) l.threeDLayer = true;
        var fx = l.property("ADBE Effect Parade");
        var p0 = l.position.value;
        if (!isRigged(l)) {
            // NOTE: addProperty INVALIDATES previously-fetched sibling effect refs.
            // Add all three first, then re-fetch fresh by name to set values.
            fx.addProperty("ADBE Slider Control").name = EFX_Z;
            fx.addProperty("ADBE Point Control").name = EFX_SC;
            fx.addProperty("ADBE Point Control").name = EFX_BP;
            l.effect(EFX_SC)("ADBE Point Control-0001").setValue([cx, cy]);
            l.effect(EFX_BP)("ADBE Point Control-0001").setValue([p0[0], p0[1]]);
        }
        setZraw(l, depth);
        l.scale.expression = SCALE_EXPR;
        l.position.expression = POS_EXPR;
    }

    function unrigLayer(l) {
        l.scale.expression = "";
        l.position.expression = "";
        try { if (l.effect(EFX_Z)) l.effect(EFX_Z).remove(); } catch (e) {}
        try { if (l.effect(EFX_SC)) l.effect(EFX_SC).remove(); } catch (e) {}
        try { if (l.effect(EFX_BP)) l.effect(EFX_BP).remove(); } catch (e) {}
    }

    function easeKeys(prop, k1, k2) {
        // Spatial properties (position) take ONE KeyframeEase element;
        // non-spatial multi-dim properties take one per dimension.
        var e = new KeyframeEase(0, 66);
        var n = prop.isSpatial ? 1 : (prop.propertyValueType === PropertyValueType.ThreeD ? 3 :
               (prop.propertyValueType === PropertyValueType.TwoD ? 2 : 1));
        var a = []; for (var i = 0; i < n; i++) a.push(e);
        prop.setTemporalEaseAtKey(k1, a, a);
        prop.setTemporalEaseAtKey(k2, a, a);
    }

    function meanPlaneDepth(comp) {
        var p = planesOnly(comp), sum = 0, n = 0;
        for (var i = 0; i < p.length; i++) if (isRigged(p[i].layer)) { sum += getZ(p[i].layer); n++; }
        return n ? sum / n : 1000;
    }

    // ------------------------------------------------------------ CORE (PXE)
    var PXE = {};
    PXE.version = VERSION;
    PXE.far = 5000;

    // BUILD: rig every convention layer.
    // v1.1: depth comes from AE STACKING ORDER by default (top = nearest), because
    // that is how the artist actually composited the frame and it cannot lie.
    // NN_ numbering is metadata that may run either way; opts.order overrides:
    //   "stack" (default) | "name-asc" (01 = farthest) | "name-desc" (01 = nearest)
    // FX layers inherit depth of first non-FX plane BELOW them in the stack.
    PXE.buildFromComp = function (far, opts) {
        var comp = activeComp(); if (!comp) return "ERROR: no active comp";
        if (far) PXE.far = far;
        if (!opts) opts = {};
        var order = opts.order || "stack";
        app.beginUndoGroup("PXE Build");
        try {
            ensureRig(comp);
            var planes = planesOnly(comp);
            if (planes.length === 0) return "ERROR: no NN_ convention layers found";

            var warn = [], i, d;
            var hidden = hiddenPlaneNames(comp);
            if (hidden.length && !opts.allowHidden)
                warn.push("WARN " + hidden.length + " NN_ layer(s) hidden and NOT rigged: " + hidden.join(", "));

            var nUnits;
            if (order === "stack") {
                // nearest = topmost. Ties impossible; every layer gets its own slot.
                var byStack = [];
                for (i = 0; i < planes.length; i++) byStack.push(planes[i]);
                byStack.sort(function (a, b) { return a.layer.index - b.layer.index; });
                nUnits = byStack.length;
                for (i = 0; i < byStack.length; i++) {
                    var zS = (nUnits === 1) ? 0 : PXE.far * i / (nUnits - 1);
                    try { rigLayer(comp, byStack[i].layer, zS); }
                    catch (eR1) { return "ERROR rigging '" + byStack[i].layer.name + "': " + eR1.toString(); }
                }
                var rel = nameStackRelation(comp);
                if (rel === "front-to-back")
                    warn.push("NOTE numbering runs front-to-back (01 = nearest), inverse of the 01_SKY convention - stack order used");
                else if (rel === "mixed")
                    warn.push("NOTE NN_ numbers are not monotonic with stack order - stack order used");
            } else {
                var nums = [], seen = {};
                for (i = 0; i < planes.length; i++) {
                    if (!seen[planes[i].num]) { seen[planes[i].num] = true; nums.push(planes[i].num); }
                }
                nums.sort(function (a, b) { return a - b; });
                nUnits = nums.length;
                var depthOf = {};
                for (d = 0; d < nums.length; d++) {
                    var frac = (nums.length === 1) ? 0 :
                        ((order === "name-desc") ? d / (nums.length - 1)
                                                 : (nums.length - 1 - d) / (nums.length - 1));
                    depthOf[nums[d]] = PXE.far * frac;
                }
                for (i = 0; i < planes.length; i++) {
                    try { rigLayer(comp, planes[i].layer, depthOf[planes[i].num]); }
                    catch (eRig) { return "ERROR rigging '" + planes[i].layer.name + "': " + eRig.toString(); }
                }
            }
            // FX: co-planar with first rigged non-FX plane below in stack
            var s = sceneLayers(comp), rigged = 0;
            for (i = 0; i < s.length; i++) {
                if (!s[i].fx) continue;
                var below = null;
                for (var j = s[i].layer.index + 1; j <= comp.numLayers; j++) {
                    var cand = comp.layer(j);
                    if (!isCamOrLight(cand) && cand.enabled && nameNum(cand) !== null &&
                        !isFx(cand) && isRigged(cand)) { below = cand; break; }
                }
                var z = below ? getZ(below) : 0;
                rigLayer(comp, s[i].layer, z);
            }
            for (i = 0; i < s.length; i++) if (isRigged(s[i].layer)) rigged++;

            var split = twoDSplitters(comp);
            if (split.length)
                warn.push("WARN 2D layer(s) split the 3D group (depth sorting breaks across them): " + split.join(", "));

            return "OK: rigged " + rigged + " layers (" + nUnits + " depth planes), far=" +
                   Math.round(PXE.far) + ", order=" + order +
                   (warn.length ? "\n" + warn.join("\n") : "");
        } catch (err) { return "ERROR: " + err.toString(); }
        finally { app.endUndoGroup(); }
    };

    PXE.setDepth = function (layerName, z) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        var l = findLayer(comp, layerName);
        if (!l || !isRigged(l)) return "ERROR: layer not rigged: " + layerName;
        app.beginUndoGroup("PXE Depth");
        setZraw(l, z);
        app.endUndoGroup();
        return "OK";
    };

    // Bulk depth setter: PXE.setDepths({"09_CHAR_THAROK":0, "01_SKY":4000})
    // Art direction beats even spacing; this is how you place heroes deliberately.
    PXE.setDepths = function (map) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        var ok = 0, miss = [];
        app.beginUndoGroup("PXE Depths");
        try {
            for (var name in map) {
                if (!map.hasOwnProperty(name)) continue;
                var l = findLayer(comp, name);
                if (!l || !isRigged(l)) { miss.push(name); continue; }
                setZraw(l, map[name]); ok++;
            }
        } finally { app.endUndoGroup(); }
        return "OK: set " + ok + " depth(s)" + (miss.length ? "; not rigged: " + miss.join(", ") : "");
    };

    // Distribute by STACKING ORDER (bottom = farthest).  [ZSC bug #2 fix]
    // v1.1: optional bias exponent. 1 = even. >1 clusters planes toward camera
    // and pushes the depth budget to the back - which is what you want when
    // three heroes share one leap and the scenery needs the room.
    PXE.distribute = function (near, far, bias) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        if (near === undefined) near = 0;
        if (far === undefined) far = PXE.far;
        if (!bias || bias <= 0) bias = 1;
        var p = planesOnly(comp), rig = [];
        for (var i = 0; i < p.length; i++) if (isRigged(p[i].layer)) rig.push(p[i].layer);
        if (rig.length < 2) return "ERROR: need 2+ rigged planes";
        rig.sort(function (a, b) { return a.index - b.index; }); // top first = nearest
        app.beginUndoGroup("PXE Distribute");
        for (i = 0; i < rig.length; i++)
            setZraw(rig[i], near + (far - near) * Math.pow(i / (rig.length - 1), bias));
        app.endUndoGroup();
        return "OK: distributed " + rig.length + " planes " + near + ".." + far +
               (bias === 1 ? "" : " (bias " + bias + ")");
    };

    PXE.randomize = function (band) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        if (!band) band = 200;
        var p = planesOnly(comp), n = 0;
        app.beginUndoGroup("PXE Randomize");
        for (var i = 0; i < p.length; i++) {
            if (!isRigged(p[i].layer)) continue;
            var z = getZ(p[i].layer) + (Math.random() * 2 - 1) * band;
            setZraw(p[i].layer, Math.max(0, z)); n++;
        }
        app.endUndoGroup();
        return "OK: randomized " + n + " planes +/-" + band;
    };

    // ONE motivated move per shot. strengthPct = apparent scale change (%)
    // of the mean-depth plane (push/pull) or % of comp size (drifts).
    PXE.applyMove = function (type, durationSec, strengthPct) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        var rig = ensureRig(comp), ctrl = rig.ctrl;
        if (!durationSec) durationSec = comp.duration;
        var s = (strengthPct === undefined ? 5 : strengthPct) / 100;
        var zm = zoomPx(comp);
        var p0 = ctrl.position.value, p1 = [p0[0], p0[1], p0[2]];
        if (type === "Push-In") p1[2] = p0[2] + s * (zm + meanPlaneDepth(comp)) / (1 + s);
        else if (type === "Pull-Back") p1[2] = p0[2] - s * (zm + meanPlaneDepth(comp)) / (1 - s);
        else if (type === "Drift L") p1[0] = p0[0] - s * comp.width;
        else if (type === "Drift R") p1[0] = p0[0] + s * comp.width;
        else if (type === "Rise") p1[1] = p0[1] - s * comp.height;
        else if (type === "Sink") p1[1] = p0[1] + s * comp.height;
        else return "ERROR: unknown move " + type;
        app.beginUndoGroup("PXE Move");
        try {
            PXE.clearMove();
            var t1 = Math.min(durationSec, comp.duration) - comp.frameDuration;
            ctrl.position.setValueAtTime(0, p0);
            ctrl.position.setValueAtTime(t1, p1);
            easeKeys(ctrl.position, 1, 2);
            return "OK: " + type + " " + (s * 100) + "% over " + durationSec + "s";
        } catch (err) { return "ERROR: " + err.toString(); }
        finally { app.endUndoGroup(); }
    };

    PXE.clearMove = function () {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        var ctrl = findLayer(comp, NULL_NAME); if (!ctrl) return "OK: no rig";
        var pos = ctrl.position;
        while (pos.numKeys > 0) pos.removeKey(1);
        pos.setValue([comp.width / 2, comp.height / 2, 0]);
        return "OK: move cleared";
    };

    // Fog card: comp-sized fractal-noise solid at depth z, Screen, self-drifting.
    // v1.1: colour is a parameter (the hardcoded teal wrecks warm plates), and the
    // card is restacked to the slot its depth implies - addSolid drops it at the
    // TOP of the comp, where it Screens over every plane in front of it.
    PXE.addFogCard = function (z, opacityPct, colorRGB) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        if (z === undefined) z = Math.round(meanPlaneDepth(comp) / 2);
        if (!opacityPct) opacityPct = 12;
        if (!colorRGB || colorRGB.length !== 3) colorRGB = [0.72, 0.86, 0.86];
        app.beginUndoGroup("PXE Fog Card");
        try {
            ensureRig(comp);
            var n = 1; while (findLayer(comp, FOG_PREFIX + (n < 10 ? "0" : "") + n)) n++;
            var name = FOG_PREFIX + (n < 10 ? "0" : "") + n;
            var sol = comp.layers.addSolid(colorRGB, name, comp.width, comp.height, 1, comp.duration);
            var fn = sol.property("ADBE Effect Parade").addProperty("ADBE Fractal Noise");
            try {
                fn.property("ADBE Fractal Noise-0003").setValue(120);  // contrast
                fn.property("ADBE Fractal Noise-0004").setValue(-25);  // brightness
                fn.property("ADBE Fractal Noise-0010").expression = "time * 12;"; // evolution
            } catch (e) {}
            sol.blendingMode = BlendingMode.SCREEN;
            sol.opacity.setValue(opacityPct);
            rigLayer(comp, sol, z);
            // gentle lateral self-drift via Base Position (possible thanks to bug-#3 fix)
            sol.effect(EFX_BP)("Point").expression =
                "value + [Math.sin(time * 0.15) * 30, Math.cos(time * 0.11) * 12];";
            var anchor = restackByDepth(comp, sol);
            return "OK: " + name + " at z=" + z + ", " + opacityPct + "%" +
                   (anchor ? ", stacked below " + anchor : ", stacked at top (nearest card)");
        } catch (err) { return "ERROR: " + err.toString(); }
        finally { app.endUndoGroup(); }
    };

    // Audit: solo one plane + camera, jump to the move extreme.
    PXE._audit = null;
    PXE.auditOn = function (layerName) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        var target = layerName ? findLayer(comp, layerName) :
            (comp.selectedLayers.length ? comp.selectedLayers[0] : null);
        if (!target) return "ERROR: no plane (select one or pass a name)";
        if (PXE._audit) PXE.auditOff();
        // v1.1: snapshot by LAYER REFERENCE, not index. bake/addFogCard/restack all
        // change layer count, and an index-keyed restore then reassigns solo flags
        // to the wrong layers.
        var entries = [], i, l;
        for (i = 1; i <= comp.numLayers; i++) entries.push({ layer: comp.layer(i), solo: comp.layer(i).solo });
        PXE._audit = { entries: entries, time: comp.time, compId: comp.id };
        for (i = 1; i <= comp.numLayers; i++) {
            l = comp.layer(i);
            if (!l.enabled) continue; // AE forbids solo on disabled layers
            l.solo = (l === target || l.name === CAM_NAME || l.name === NULL_NAME);
        }
        var ctrl = findLayer(comp, NULL_NAME);
        comp.time = (ctrl && ctrl.position.numKeys > 1)
            ? ctrl.position.keyTime(ctrl.position.numKeys)
            : comp.duration - comp.frameDuration;
        return "OK: auditing " + target.name + " at move extreme (t=" + comp.time.toFixed(2) + "s)";
    };
    PXE.auditOff = function () {
        var comp = activeComp(); if (!comp || !PXE._audit) return "OK: nothing to restore";
        for (var i = 0; i < PXE._audit.entries.length; i++) {
            var e = PXE._audit.entries[i];
            try { if (e.layer && e.layer.enabled) e.layer.solo = e.solo; } catch (eDead) {}
        }
        comp.time = PXE._audit.time;
        PXE._audit = null;
        return "OK: audit off, state restored";
    };

    // Bake: sample POST-EXPRESSION values, then strip.  [ZSC bug #1 fix]
    PXE.bake = function () {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        var rig = riggedLayers(comp), n = 0;
        app.beginUndoGroup("PXE Bake");
        try {
            for (var i = 0; i < rig.length; i++) {
                var l = rig[i];
                var sVal = l.scale.value;      // post-expression
                var pVal = l.position.value;   // post-expression
                l.scale.expression = "";
                l.position.expression = "";
                l.scale.setValue(sVal);
                l.position.setValue(pVal);
                try { if (l.effect(EFX_BP)("Point").expression) l.effect(EFX_BP)("Point").expression = ""; } catch (e) {}
                unrigLayer(l); n++;
            }
            return "OK: baked " + n + " layers (post-expression sampled, no layout shift)";
        } catch (err) { return "ERROR: " + err.toString(); }
        finally { app.endUndoGroup(); }
    };

    // Reset: back to flat 2D state.
    PXE.reset = function () {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        var rig = riggedLayers(comp), n = 0;
        app.beginUndoGroup("PXE Reset");
        try {
            for (var i = 0; i < rig.length; i++) {
                var l = rig[i];
                var bp = null;
                try { bp = l.effect(EFX_BP)("Point").value; } catch (e) {}
                unrigLayer(l);
                l.scale.setValue([100, 100, 100]);
                if (bp) l.position.setValue([bp[0], bp[1], 0]);
                l.threeDLayer = false; n++;
            }
            return "OK: reset " + n + " layers to flat";
        } catch (err) { return "ERROR: " + err.toString(); }
        finally { app.endUndoGroup(); }
    };

    // ---- geometry (v1.2) ----------------------------------------------------
    // Camera dolly for a push/pull at strength s, matching applyMove exactly.
    function dollyFor(comp, type, s) {
        var zm = zoomPx(comp), mz = meanPlaneDepth(comp);
        if (type === "Push-In") return s * (zm + mz) / (1 + s);
        if (type === "Pull-Back") return -s * (zm + mz) / (1 - s);
        return 0;
    }
    // Lateral camera travel, matching applyMove exactly.
    function lateralFor(comp, type, s) {
        if (type === "Drift L" || type === "Drift R") return s * comp.width;
        if (type === "Rise" || type === "Sink") return s * comp.height;
        return 0;
    }
    function isRadial(type) { return type === "Push-In" || type === "Pull-Back"; }
    // Screen magnification of a plane at depth z at the move extreme.
    function magAt(zm, z, dz) { return (zm + z) / (zm + z - dz); }

    // A plane's footprint in the FLAT frame. The rig is screen-locked at t=0, so
    // this is exactly what the layer covers before the move starts.
    function flatRect(l) {
        var sr, bp, an;
        try { sr = l.sourceRectAtTime(0, false); } catch (e) { return null; }
        try { bp = l.effect(EFX_BP)("Point").value; } catch (e2) { bp = [l.position.value[0], l.position.value[1]]; }
        an = l.anchorPoint.value;
        return { left: bp[0] + (sr.left - an[0]), top: bp[1] + (sr.top - an[1]),
                 width: sr.width, height: sr.height };
    }

    // BANDS: reveal width per cut, for a given move. Replaces hand arithmetic.
    // Lateral moves expose a strip; push/pull expose radially and the two are NOT
    // the same formula. The doc shorthand d*(zf-zn)/(zoom+zf) is the lateral case
    // with z_near ~ 0 - it is wrong for interior cuts and meaningless for a push.
    PXE.bands = function (moveType, strengthPct) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        if (!moveType) moveType = "Push-In";
        var s = (strengthPct === undefined ? 5 : strengthPct) / 100;
        var p = planesOnly(comp), rig = [], i;
        for (i = 0; i < p.length; i++) if (isRigged(p[i].layer)) rig.push(p[i].layer);
        if (rig.length < 2) return "ERROR: need 2+ rigged planes";
        rig.sort(function (a, b) { return getZ(a) - getZ(b); });   // near -> far

        var zm = zoomPx(comp), out = [], radial = isRadial(moveType);
        var dz = dollyFor(comp, moveType, s), d = lateralFor(comp, moveType, s);
        var rMax = Math.sqrt(comp.width * comp.width + comp.height * comp.height) / 2;

        out.push("bands: " + moveType + " " + (s * 100) + "%   comp " + comp.width + "x" +
                 comp.height + "   zoom " + Math.round(zm));
        out.push(radial
            ? "  radial: band = r x (m_near - m_far), r_corner = " + Math.round(rMax) +
              ", dolly = " + Math.round(dz)
            : "  lateral: band = d x zoom x (zf-zn) / ((zoom+zn)(zoom+zf)), d = " + Math.round(d));

        for (i = 1; i < rig.length; i++) {
            var zn = getZ(rig[i - 1]), zf = getZ(rig[i]), band;
            if (radial) band = rMax * Math.abs(magAt(zm, zn, dz) - magAt(zm, zf, dz));
            else band = Math.abs(d) * zm * (zf - zn) / ((zm + zn) * (zm + zf));
            out.push("  " + rig[i - 1].name + " (z" + Math.round(zn) + ") -> " +
                     rig[i].name + " (z" + Math.round(zf) + "):  " + Math.round(band) + " px");
        }
        var z0 = getZ(rig[0]), zN = getZ(rig[rig.length - 1]), tot;
        if (radial) tot = rMax * Math.abs(magAt(zm, z0, dz) - magAt(zm, zN, dz));
        else tot = Math.abs(d) * zm * (zN - z0) / ((zm + z0) * (zm + zN));
        out.push("  near->far total: " + Math.round(tot) + " px = " +
                 (100 * tot / comp.width).toFixed(2) + "% of comp width");
        if (radial)
            out.push("  NOTE push/pull exposes only on centre-facing edges; edges facing" +
                     " away from centre are covered, not revealed.");
        return out.join("\n");
    };

    // CHECKMOVE: will this move pull empty canvas into frame? Answers per plane,
    // and reports the strength at which each one first fails.
    PXE.checkMove = function (moveType, strengthPct) {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        if (!moveType) moveType = "Push-In";
        var s = (strengthPct === undefined ? 5 : strengthPct) / 100;
        var rig = riggedLayers(comp), zm = zoomPx(comp), out = [], bad = 0, i;
        var dz = dollyFor(comp, moveType, s), d = lateralFor(comp, moveType, s);
        var cx = comp.width / 2, cy = comp.height / 2, radial = isRadial(moveType);
        var limit = Infinity, limitBy = "";

        out.push("checkMove: " + moveType + " " + (s * 100) + "% on " + rig.length + " rigged layer(s)");
        var cutouts = 0;
        for (i = 0; i < rig.length; i++) {
            var l = rig[i], z = getZ(l), R = flatRect(l);
            if (!R) continue;
            // A plane that does not cover the frame when flat is a CUT-OUT, not a
            // plate. It never backed the frame, so it cannot "expose" anything -
            // whatever sits behind it does. Only full plates are load-bearing.
            var coversFlat = (R.left <= 0.5) && (R.top <= 0.5) &&
                             (R.left + R.width >= comp.width - 0.5) &&
                             (R.top + R.height >= comp.height - 0.5);
            if (!coversFlat) { cutouts++; continue; }
            var L, T, W, H;
            if (radial) {
                var m = magAt(zm, z, dz);
                L = cx + (R.left - cx) * m; T = cy + (R.top - cy) * m;
                W = R.width * m; H = R.height * m;
            } else {
                var shift = Math.abs(d) * zm / (zm + z);
                var sx = 0, sy = 0;
                if (moveType === "Drift L") sx = shift; else if (moveType === "Drift R") sx = -shift;
                else if (moveType === "Rise") sy = shift; else if (moveType === "Sink") sy = -shift;
                L = R.left + sx; T = R.top + sy; W = R.width; H = R.height;
            }
            var gapL = -L, gapT = -T, gapR = (L + W) - comp.width, gapB = (T + H) - comp.height;
            var worst = Math.min(gapL, gapT, gapR, gapB);
            if (worst < 0) {
                bad++;
                out.push("  EXPOSES  " + l.name + " (z" + Math.round(z) + "): " +
                         Math.round(-worst) + " px of empty canvas");
            }
            // strength at which this plane first fails (lateral only; push never fails)
            if (!radial) {
                // Camera left  -> content right -> the LEFT edge is uncovered.
                // The margin that matters is on the edge the move actually exposes.
                var sh = Math.abs(d) * zm / (zm + z);
                var margin = (moveType === "Drift L") ? gapL + sh
                          : (moveType === "Drift R") ? gapR + sh
                          : (moveType === "Rise") ? gapT + sh
                          : gapB + sh;
                var span = (moveType === "Drift L" || moveType === "Drift R") ? comp.width : comp.height;
                var sMax = margin * (zm + z) / (zm * span);
                if (sMax < limit) { limit = sMax; limitBy = l.name; }
            }
        }
        if (cutouts) out.push("  (" + cutouts + " cut-out plane(s) skipped - not full-frame plates)");
        if (!bad) out.push("  CLEAR - no full-frame plate loses coverage at this strength");
        if (radial && moveType === "Push-In")
            out.push("  push-in scales every plane outward from centre: margin grows monotonically, no failure percentage");
        else if (limit !== Infinity)
            out.push("  first failure at " + (limit * 100).toFixed(1) + "% (" + limitBy + ")");
        return out.join("\n");
    };

    // PREFLIGHT: everything that will silently ruin a build, reported BEFORE you
    // spend a render or a Firefly credit. Run this first, every time.
    PXE.preflight = function () {
        var comp = activeComp(); if (!comp) return "ERROR: no active comp";
        var out = [], i;

        var planes = planesOnly(comp);
        var hidden = hiddenPlaneNames(comp);
        var unnamed = [];
        for (i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            if (isCamOrLight(l) || !l.enabled) continue;
            if (l.name === CAM_NAME || l.name === NULL_NAME) continue;
            if (nameNum(l) === null && !isFog(l)) unnamed.push(l.name);
        }

        out.push("comp: " + comp.name + " " + comp.width + "x" + comp.height +
                 "  " + comp.frameRate + "fps  " + comp.duration.toFixed(2) + "s");
        out.push("planes that WILL rig: " + planes.length);

        if (!planes.length)
            out.push("BLOCKER  no NN_ convention layers found - nothing will rig");
        if (hidden.length)
            out.push("BLOCKER  " + hidden.length + " NN_ layer(s) hidden; build skips them silently: " + hidden.join(", "));
        if (unnamed.length)
            out.push("INFO     " + unnamed.length + " enabled layer(s) without NN_ prefix, left untouched: " + unnamed.join(", "));

        var rel = nameStackRelation(comp);
        if (rel === "front-to-back")
            out.push("WARN     numbering runs FRONT-TO-BACK (01 = nearest) - inverse of the 01_SKY convention.");
        else if (rel === "mixed")
            out.push("WARN     NN_ numbers are not monotonic with stack order.");

        var split = twoDSplitters(comp);
        if (split.length)
            out.push("WARN     2D layer(s) inside the 3D stack break depth sorting: " + split.join(", "));

        var badFog = misstackedFog(comp);
        if (badFog.length)
            out.push("WARN     fog card(s) stacked in front of nearer planes: " + badFog.join(", "));

        var cam = findLayer(comp, CAM_NAME);
        if (cam && comp.activeCamera && comp.activeCamera !== cam)
            out.push("WARN     PXE_Camera is not the active camera for this comp");

        var probs = 0;
        for (i = 0; i < out.length; i++)
            if (out[i].indexOf("BLOCKER") === 0 || out[i].indexOf("WARN") === 0) probs++;
        out.push(probs ? ("--> " + probs + " issue(s) to resolve") : "--> clean");
        return out.join("\n");
    };

    // Re-seat every fog card into the stack slot its depth implies.
    PXE.restackFog = function () {
        var comp = activeComp(); if (!comp) return "ERROR: no comp";
        var moved = [], i;
        app.beginUndoGroup("PXE Restack Fog");
        try {
            for (i = comp.numLayers; i >= 1; i--) {
                var l = comp.layer(i);
                if (!isFog(l) || !isRigged(l)) continue;
                var a = restackByDepth(comp, l);
                if (a) moved.push(l.name + "->below " + a);
            }
        } finally { app.endUndoGroup(); }
        return "OK: " + (moved.length ? moved.join(", ") : "nothing to move");
    };

    PXE.status = function () {
        var comp = activeComp(); if (!comp) return "no active comp";
        var rig = riggedLayers(comp), rows = [];
        for (var i = 0; i < rig.length; i++)
            rows.push(rig[i].name + " z=" + Math.round(getZ(rig[i])) +
                      " scale=" + Math.round(rig[i].scale.value[0] * 10) / 10);
        var ctrl = findLayer(comp, NULL_NAME);
        var keys = ctrl ? ctrl.position.numKeys : 0;
        return "comp=" + comp.name + " " + comp.width + "x" + comp.height +
               " cam=" + (findLayer(comp, CAM_NAME) ? "yes" : "no") +
               " moveKeys=" + keys + "\n" + rows.join("\n");
    };

    $.global.PXE = PXE;

    // ------------------------------------------------------------ UI
    if ($.global.PXE_HEADLESS === true) return;

    function buildUI(tObj) {
        var pal = (tObj instanceof Panel) ? tObj :
            new Window("palette", "Parallaxie v" + VERSION, undefined, { resizeable: true });
        pal.spacing = 6; pal.margins = 10;
        pal.alignChildren = ["fill", "top"];

        function row(parent) { var g = parent.add("group"); g.spacing = 5; g.alignment = ["fill", "top"]; return g; }
        var status;
        function say(msg) { status.text = String(msg).split("\n")[0]; }

        // -- BUILD
        var pnlB = pal.add("panel", undefined, "1. Build");
        pnlB.alignChildren = ["fill", "top"]; pnlB.margins = 8;
        var rB = row(pnlB);
        rB.add("statictext", undefined, "Scene:");
        var ddPreset = rB.add("dropdownlist", undefined, ["Room", "Exterior", "Epic Vista", "Custom"]);
        ddPreset.selection = 1;
        rB.add("statictext", undefined, "Far:");
        var etFar = rB.add("edittext", undefined, "5000"); etFar.characters = 6;
        ddPreset.onChange = function () { etFar.text = PRESETS[this.selection.text]; };
        var btBuild = pnlB.add("button", undefined, "BUILD FROM COMP");
        btBuild.onClick = function () { say(PXE.buildFromComp(parseFloat(etFar.text) || 5000)); refreshList(); };

        // -- DEPTH
        var pnlD = pal.add("panel", undefined, "2. Depth");
        pnlD.alignChildren = ["fill", "top"]; pnlD.margins = 8;
        var listG = pnlD.add("group"); listG.orientation = "column";
        listG.alignChildren = ["fill", "top"]; listG.spacing = 3;
        var rD = row(pnlD);
        var btRefresh = rD.add("button", undefined, "Refresh"); btRefresh.preferredSize = [70, 24];
        var btDist = rD.add("button", undefined, "Distribute"); btDist.preferredSize = [80, 24];
        var btRand = rD.add("button", undefined, "Random"); btRand.preferredSize = [70, 24];
        btDist.onClick = function () { say(PXE.distribute(0, parseFloat(etFar.text) || 5000)); refreshList(); };
        btRand.onClick = function () { say(PXE.randomize(200)); refreshList(); };
        btRefresh.onClick = refreshList;

        function refreshList() {
            while (listG.children.length > 0) listG.remove(listG.children[0]);
            var comp = activeComp();
            if (!comp) { listG.add("statictext", undefined, "No active comp"); pal.layout.layout(true); return; }
            var rig = riggedLayers(comp);
            if (!rig.length) listG.add("statictext", undefined, "Nothing rigged - click Build");
            var far = parseFloat(etFar.text) || 5000;
            for (var i = 0; i < rig.length; i++) {
                (function (l) {
                    var g = listG.add("group"); g.spacing = 4; g.alignment = ["fill", "top"];
                    var nm = g.add("statictext", undefined, l.name); nm.preferredSize = [120, 16];
                    var et = g.add("edittext", undefined, String(Math.round(getZ(l)))); et.characters = 5;
                    var sl = g.add("slider", undefined, getZ(l), 0, far); sl.preferredSize = [110, 16];
                    sl.onChanging = function () { et.text = Math.round(sl.value); setZraw(l, sl.value); };
                    et.onChange = function () { var v = parseFloat(et.text) || 0; sl.value = v; setZraw(l, v); };
                })(rig[i]);
            }
            pal.layout.layout(true);
        }

        // -- CAMERA MOVE
        var pnlC = pal.add("panel", undefined, "3. Camera Move (one per shot)");
        pnlC.alignChildren = ["fill", "top"]; pnlC.margins = 8;
        var rC = row(pnlC);
        var ddMove = rC.add("dropdownlist", undefined, MOVES); ddMove.selection = 0;
        rC.add("statictext", undefined, "s:");
        var etDur = rC.add("edittext", undefined, "6"); etDur.characters = 3;
        rC.add("statictext", undefined, "%:");
        var etStr = rC.add("edittext", undefined, "5"); etStr.characters = 3;
        var rC2 = row(pnlC);
        var btMove = rC2.add("button", undefined, "Apply Move"); btMove.preferredSize = [120, 26];
        var btClr = rC2.add("button", undefined, "Clear Move"); btClr.preferredSize = [120, 26];
        btMove.onClick = function () {
            say(PXE.applyMove(ddMove.selection.text, parseFloat(etDur.text) || 6, parseFloat(etStr.text) || 5));
        };
        btClr.onClick = function () { say(PXE.clearMove()); };

        // -- FX / AUDIT / BAKE
        var pnlX = pal.add("panel", undefined, "4. Atmosphere + QA");
        pnlX.alignChildren = ["fill", "top"]; pnlX.margins = 8;
        var rX = row(pnlX);
        var btFog = rX.add("button", undefined, "Add Fog Card"); btFog.preferredSize = [110, 24];
        rX.add("statictext", undefined, "z:");
        var etFogZ = rX.add("edittext", undefined, ""); etFogZ.characters = 5;
        btFog.onClick = function () {
            var z = parseFloat(etFogZ.text);
            say(PXE.addFogCard(isNaN(z) ? undefined : z)); refreshList();
        };
        var rX2 = row(pnlX);
        var btAudOn = rX2.add("button", undefined, "Audit Band"); btAudOn.preferredSize = [110, 24];
        var btAudOff = rX2.add("button", undefined, "Audit Off"); btAudOff.preferredSize = [110, 24];
        btAudOn.onClick = function () { say(PXE.auditOn()); };
        btAudOff.onClick = function () { say(PXE.auditOff()); };
        var rX3 = row(pnlX);
        var btBake = rX3.add("button", undefined, "Bake"); btBake.preferredSize = [110, 24];
        var btReset = rX3.add("button", undefined, "Reset (flat)"); btReset.preferredSize = [110, 24];
        btBake.onClick = function () {
            if (confirm("Bake converts the rig to plain keyable values (post-expression sampled - no layout shift). Continue?"))
                { say(PXE.bake()); refreshList(); }
        };
        btReset.onClick = function () {
            if (confirm("Reset removes the rig and returns layers to flat 2D. Continue?"))
                { say(PXE.reset()); refreshList(); }
        };

        status = pal.add("statictext", undefined, "Parallaxie v" + VERSION + " ready");

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        if (pal instanceof Window) { pal.center(); pal.show(); }
        return pal;
    }

    buildUI(thisObj);

})(this);

// ---------------------------------------------------------------------------
// Scriptable API (after evaluating this file with $.global.PXE_HEADLESS=true):
//   PXE.preflight()                          <-- run this FIRST, every time
//   PXE.buildFromComp(far, {order:"stack"|"name-asc"|"name-desc", allowHidden:bool})
//   PXE.setDepth(name, z)         PXE.setDepths({name: z, ...})
//   PXE.distribute(near, far, bias)          bias>1 = depth budget to the back
//   PXE.randomize(band)
//   PXE.bands(type, pct)          reveal width per cut, correct per move class
//   PXE.checkMove(type, pct)      does this move pull empty canvas into frame?
//   PXE.applyMove(type, sec, pct) PXE.clearMove()
//   PXE.addFogCard(z, opacity, [r,g,b])      auto-restacked by depth
//   PXE.restackFog()
//   PXE.auditOn(name) / PXE.auditOff()
//   PXE.bake()                    PXE.reset()
//   PXE.status()
// Moves: "Push-In" "Pull-Back" "Drift L" "Drift R" "Rise" "Sink"
// ---------------------------------------------------------------------------
