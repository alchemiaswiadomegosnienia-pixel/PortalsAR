/**
 * ═══════════════════════════════════
 *  QUANTUM TELEPORT ENGINE v3.0
 *  
 *  - Brave compat
 *  - Orientation fix (koło, nie elipsa)
 *  - Audio integration
 *  - Both cameras on init
 *  - Multi-ring portal renderer
 *  - Admin sync
 * ═══════════════════════════════════
 */

class QuantumTeleporter {
    constructor() {
        this.portalPlaced = false;
        this.portalX = 0.5;
        this.portalY = 0.4;
        this.portalAngle = 0;
        this.portalAngle2 = 0;
        this.portalAngle3 = 0;
        this.portalPulse = 0;

        this.stepCount = 0;
        this.distanceWalked = 0;
        this.TRIGGER_DISTANCE = 8;

        this.smoothedMag = 9.81;
        this.lastStepTime = 0;
        this.STEP_COOLDOWN = 300;
        this.STEP_THRESHOLD = 1.2;
        this.motionActive = false;

        this.gyroAlpha = 0;
        this.gyroBeta = 0;
        this.gyroGamma = 0;
        this.gyroBase = null;
        this.gyroActive = false;

        this.gpsPosition = null;
        this.selfieDataURL = null;
        this.jumpId = this.makeId();
        this.animFrame = null;
        this.phase = "intro";

        this.isBrave = navigator.brave && navigator.brave.isBrave;

        this.init();
    }

    makeId() {
        const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let id = "QT-";
        for (let i = 0; i < 8; i++) id += c[Math.floor(Math.random() * c.length)];
        return id;
    }

    // ═════════════════════════
    //  INIT
    // ═════════════════════════
    async init() {
        // Brave detection
        if (this.isBrave || /Brave/i.test(navigator.userAgent)) {
            document.getElementById("brave-warning").style.display = "block";
        }

        this.grabGPS();

        // Test kamer (bez ich uruchomienia — tylko sprawdzenie)
        await this.checkCameras();

        const btn = document.getElementById("btn-start");
        btn.disabled = false;
        btn.addEventListener("click", () => this.requestAllPermissions());
    }

    grabGPS() {
        if (!navigator.geolocation) {
            document.getElementById("gps-val").textContent = "NIEDOSTĘPNE";
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => {
                this.gpsPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                document.getElementById("gps-val").textContent =
                    `${pos.coords.latitude.toFixed(4)}°N ${pos.coords.longitude.toFixed(4)}°E`;
                document.getElementById("gps-val").style.color = "#0f8";
            },
            () => { document.getElementById("gps-val").textContent = "BRAK"; },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    async checkCameras() {
        const camVal = document.getElementById("camera-val");
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cams = devices.filter(d => d.kind === 'videoinput');
            camVal.textContent = `${cams.length} kamer znaleziono`;
            camVal.style.color = cams.length >= 2 ? "#0f8" : "#fa0";
        } catch(e) {
            camVal.textContent = "SPRAWDZAM...";
        }
    }

    // ═══════════════════════════════════
    //  PERMISSIONS — wszystko w 1 click
    // ═══════════════════════════════════
    async requestAllPermissions() {
        const btn = document.getElementById("btn-start");
        btn.disabled = true;
        btn.textContent = "⏳ SPRAWDZAM...";

        // 1. Audio (wymaga user gesture)
        audio.init();

        // 2. Tylna kamera
        const camVal = document.getElementById("camera-val");
        try {
            const backStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } }
            });
            // Od razu zatrzymaj — użyjemy później
            backStream.getTracks().forEach(t => t.stop());
            camVal.textContent = "✅ Tylna OK";
        } catch(e) {
            camVal.textContent = "❌ Tylna: " + e.message;
            camVal.style.color = "#f55";
        }

        // 3. Przednia kamera
        try {
            const frontStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" }
            });
            frontStream.getTracks().forEach(t => t.stop());
            camVal.textContent += " | ✅ Przednia OK";
        } catch(e) {
            camVal.textContent += " | ⚠️ Przednia brak";
        }

        // 4. DeviceMotion
        const sensorVal = document.getElementById("sensor-val");
        
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const perm = await DeviceMotionEvent.requestPermission();
                this.motionActive = (perm === 'granted');
            } catch(e) {
                this.motionActive = false;
            }
        } else {
            this.motionActive = true;
        }

        // 5. DeviceOrientation
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const perm = await DeviceOrientationEvent.requestPermission();
                this.gyroActive = (perm === 'granted');
            } catch(e) {
                this.gyroActive = false;
            }
        } else {
            this.gyroActive = true;
        }

        sensorVal.textContent = 
            `Motion: ${this.motionActive ? '✅' : '❌'} | Gyro: ${this.gyroActive ? '✅' : '❌'}`;
        sensorVal.style.color = (this.motionActive && this.gyroActive) ? "#0f8" : "#fa0";

        document.getElementById("status-val").textContent = "✅ GOTOWY";
        document.getElementById("status-val").style.color = "#0f8";

        // Start
        this.startAR();
    }

    // ═════════════════════════
    //  FAZA 1: AR
    // ═════════════════════════
    async startAR() {
        this.phase = "ar";

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            const video = document.getElementById("back-camera");
            video.srcObject = stream;
            await video.play();
            this.backStream = stream;
        } catch(e) {
            alert("Kamera: " + e.message);
            return;
        }

        this.switchScreen("screen-ar");
        this.setupCanvas();
        this.startSensors();

        // Tap
        document.getElementById("ar-canvas").addEventListener("click", (e) => {
            if (!this.portalPlaced) this.placePortal(e);
        });

        // Resize
        window.addEventListener("resize", () => this.setupCanvas());
        screen.orientation?.addEventListener("change", () => {
            setTimeout(() => this.setupCanvas(), 200);
        });

        this.renderLoop();
    }

    setupCanvas() {
        const canvas = document.getElementById("ar-canvas");
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        this.ctx = canvas.getContext("2d");
        this.canvasW = canvas.width;
        this.canvasH = canvas.height;
    }

    placePortal(e) {
        const rect = e.target.getBoundingClientRect();
        this.portalX = (e.clientX - rect.left) / rect.width;
        this.portalY = (e.clientY - rect.top) / rect.height;
        this.portalPlaced = true;
        this.distanceWalked = 0;
        this.stepCount = 0;

        this.gyroBase = {
            alpha: this.gyroAlpha,
            beta: this.gyroBeta,
            gamma: this.gyroGamma
        };

        document.getElementById("approach-bar-wrap").style.display = "block";
        document.getElementById("hud-status").textContent = "IDŹ KU PORTALOWI";

        audio.playPortalPlace();
        audio.startPortalAmbient();

        if (navigator.vibrate) navigator.vibrate(50);
    }

    // ═════════════════════════
    //  SENSORY
    // ═════════════════════════
    startSensors() {
        // ── Motion ──
        if (this.motionActive) {
            let fired = false;

            const handler = (e) => {
                fired = true;
                const a = e.acceleration || e.accelerationIncludingGravity;
                if (!a || a.x === null) return;
                this.processMotion(a.x || 0, a.y || 0, a.z || 0, !!e.acceleration);
            };

            window.addEventListener("devicemotion", handler, true);

            // Brave fallback check
            setTimeout(() => {
                if (!fired) {
                    console.warn("devicemotion nie strzela — Brave?");
                    this.motionActive = false;
                    window.removeEventListener("devicemotion", handler);
                    this.addFallbackButtons();
                }
            }, 2000);
        } else {
            this.addFallbackButtons();
        }

        // ── Gyro ──
        if (this.gyroActive) {
            let fired = false;

            const handler = (e) => {
                fired = true;
                if (e.alpha !== null) this.gyroAlpha = e.alpha;
                if (e.beta !== null) this.gyroBeta = e.beta;
                if (e.gamma !== null) this.gyroGamma = e.gamma;
            };

            window.addEventListener("deviceorientation", handler, true);

            setTimeout(() => {
                if (!fired) {
                    this.gyroActive = false;
                    window.removeEventListener("deviceorientation", handler);
                }
            }, 2000);
        }
    }

    processMotion(x, y, z, pure) {
        const mag = Math.sqrt(x*x + y*y + z*z);
        const alpha = 0.2;
        this.smoothedMag = alpha * mag + (1 - alpha) * this.smoothedMag;
        const delta = Math.abs(mag - this.smoothedMag);
        const threshold = pure ? this.STEP_THRESHOLD : this.STEP_THRESHOLD + 0.5;

        if (delta > threshold) {
            const now = Date.now();
            if (now - this.lastStepTime > this.STEP_COOLDOWN) {
                this.lastStepTime = now;
                this.registerStep();
            }
        }
    }

    registerStep() {
        this.stepCount++;
        this.distanceWalked = this.stepCount * 0.7;
        document.getElementById("hud-steps").textContent = `👟 ${this.stepCount}`;

        audio.playStep();

        if (navigator.vibrate) navigator.vibrate(15);
    }

    addFallbackButtons() {
        const wrap = document.getElementById("approach-bar-wrap");
        wrap.style.display = "block";

        if (document.getElementById("fallback-btns")) return;

        const row = document.createElement("div");
        row.id = "fallback-btns";
        row.style.cssText = `
            display:flex; justify-content:center; gap:10px;
            margin-bottom:10px; pointer-events:auto;
        `;

        const makeBtn = (text, clicks) => {
            const b = document.createElement("button");
            b.textContent = text;
            b.style.cssText = `
                background: rgba(0,212,255,0.15); color: #0df;
                border: 1px solid rgba(0,212,255,0.3);
                padding: 14px 28px; border-radius: 12px;
                font-size: 1rem; cursor: pointer;
            `;
            b.addEventListener("click", () => {
                for (let i = 0; i < clicks; i++) this.registerStep();
            });
            return b;
        };

        row.appendChild(makeBtn("👟 KROK", 1));
        row.appendChild(makeBtn("🏃 ×3", 3));
        row.appendChild(makeBtn("🚀 ×5", 5));
        wrap.prepend(row);

        const info = document.createElement("div");
        info.style.cssText = "color:#fa0; font-size:0.65rem; text-align:center; margin-bottom:6px;";
        info.textContent = "⚠️ Sensory ruchu zablokowane — użyj przycisków";
        wrap.prepend(info);
    }

    // ═════════════════════════
    //  RENDER
    // ═════════════════════════
    renderLoop() {
        this.animFrame = requestAnimationFrame(() => this.renderLoop());

        const ctx = this.ctx;
        if (!ctx) return;
        const W = this.canvasW;
        const H = this.canvasH;

        ctx.clearRect(0, 0, W, H);

        if (!this.portalPlaced) {
            this.drawHint(ctx, W, H);
            return;
        }

        // Pozycja z gyro
        let px = this.portalX;
        let py = this.portalY;

        if (this.gyroActive && this.gyroBase) {
            const dGamma = this.gyroGamma - this.gyroBase.gamma;
            const dBeta = this.gyroBeta - this.gyroBase.beta;
            px -= (dGamma / 90) * 0.5;
            py += (dBeta / 90) * 0.3;
        }

        px = Math.max(0.1, Math.min(0.9, px));
        py = Math.max(0.1, Math.min(0.9, py));

        // Rozmiar — ZAWSZE koło (min z W,H)
        const progress = Math.min(1, this.distanceWalked / this.TRIGGER_DISTANCE);
        const base = Math.min(W, H);
        const minR = base * 0.08;
        const maxR = base * 0.45;
        const radius = minR + (maxR - minR) * this.easeInOut(progress);

        // Pulsacja
        this.portalPulse += 0.05;
        const pulse = 1 + Math.sin(this.portalPulse) * 0.03 * (1 + progress);
        const r = radius * pulse;

        const sx = px * W;
        const sy = py * H;

        // Obroty ringów
        this.portalAngle += 0.015;
        this.portalAngle2 -= 0.022;
        this.portalAngle3 += 0.008;

        this.drawPortal(ctx, sx, sy, r, progress);
        this.updateHUD(progress);

        // Audio intensity
        audio.setAmbientIntensity(progress);

        if (progress >= 1) this.triggerTeleport();
    }

    easeInOut(t) {
        return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    }

    drawHint(ctx, W, H) {
        const t = Date.now() / 1000;
        ctx.fillStyle = `rgba(0,212,255,${0.3 + Math.sin(t*2)*0.15})`;
        ctx.font = `bold ${16 * devicePixelRatio}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("👆 TAPNIJ aby otworzyć portal", W/2, H*0.5);
    }

    // ══════════════════════════════
    //  NOWY RENDERER PORTALU
    // ══════════════════════════════
    drawPortal(ctx, cx, cy, r, progress) {
        const t = Date.now() / 1000;
        const dpr = devicePixelRatio;

        // ── 1. Zewnętrzna poświata ──
        const outerGlow = ctx.createRadialGradient(cx, cy, r*0.7, cx, cy, r*1.6);
        outerGlow.addColorStop(0, `rgba(0,212,255,${0.03 + progress*0.08})`);
        outerGlow.addColorStop(0.5, `rgba(123,47,255,${0.02 + progress*0.04})`);
        outerGlow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, r*1.6, 0, Math.PI*2);
        ctx.fill();

        // ── 2. Środek portalu (czarna dziura) ──
        const hole = ctx.createRadialGradient(cx, cy, 0, cx, cy, r*0.7);
        hole.addColorStop(0, `rgba(0,0,10,${0.85 + progress*0.1})`);
        hole.addColorStop(0.5, `rgba(5,5,30,${0.6 + progress*0.2})`);
        hole.addColorStop(0.8, `rgba(10,10,60,${0.3 + progress*0.1})`);
        hole.addColorStop(1, "rgba(0,212,255,0.05)");
        ctx.fillStyle = hole;
        ctx.beginPath();
        ctx.arc(cx, cy, r*0.7, 0, Math.PI*2);
        ctx.fill();

        // Spirala w środku
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.5);
        for (let i = 0; i < 3; i++) {
            const spiralR = r * 0.6;
            ctx.strokeStyle = `rgba(0,212,255,${0.05 + progress * 0.05})`;
            ctx.lineWidth = 1 * dpr;
            ctx.beginPath();
            for (let a = 0; a < Math.PI * 4; a += 0.1) {
                const sr = (a / (Math.PI * 4)) * spiralR;
                const sx = Math.cos(a + i * (Math.PI * 2/3)) * sr;
                const sy = Math.sin(a + i * (Math.PI * 2/3)) * sr;
                if (a === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
        }
        ctx.restore();

        // ── 3. Ring główny (XY plane) ──
        ctx.strokeStyle = `rgba(0,212,255,${0.7 + Math.sin(t*2)*0.2})`;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.stroke();

        // ── 4. Ring obrócony (symulacja 3D — elipsa X) ──
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.portalAngle);
        const tilt1 = 0.3 + Math.sin(t * 0.7) * 0.15;
        ctx.strokeStyle = `rgba(123,47,255,${0.5 + Math.sin(t*3)*0.2})`;
        ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath();
        ctx.ellipse(0, 0, r*0.92, r*0.92 * tilt1, 0, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();

        // ── 5. Ring obrócony (symulacja 3D — elipsa Y) ──
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.portalAngle2);
        const tilt2 = 0.4 + Math.sin(t * 0.5 + 1) * 0.2;
        ctx.strokeStyle = `rgba(255,45,85,${0.3 + progress*0.3 + Math.sin(t*2.5)*0.1})`;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.ellipse(0, 0, r*0.85 * tilt2, r*0.85, 0, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();

        // ── 6. Ring wewnętrzny (przerywany) ──
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.portalAngle3);
        ctx.strokeStyle = `rgba(0,255,136,${0.2 + progress*0.3})`;
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([8, 12]);
        ctx.beginPath();
        ctx.arc(0, 0, r*0.6, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // ── 7. Ring najdalszy (ghost) ──
        ctx.strokeStyle = `rgba(0,212,255,${0.1 + Math.sin(t*1.5)*0.05})`;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r*1.15 + Math.sin(t*2)*3, 0, Math.PI*2);
        ctx.stroke();

        // ── 8. Orbiting particles ──
        const numP = 12 + Math.floor(progress * 12);
        for (let i = 0; i < numP; i++) {
            const a = (i / numP) * Math.PI*2 + t * (0.8 + i*0.05);
            const orbitR = r * (0.75 + Math.sin(t*1.5 + i*0.7) * 0.2);

            // Niektóre na innych "orbitach"
            const layer = i % 3;
            let ppx, ppy;
            if (layer === 0) {
                ppx = cx + Math.cos(a) * orbitR;
                ppy = cy + Math.sin(a) * orbitR;
            } else if (layer === 1) {
                ppx = cx + Math.cos(a) * orbitR * 0.9;
                ppy = cy + Math.sin(a) * orbitR * 0.4; // spłaszczona orbita
            } else {
                ppx = cx + Math.cos(a) * orbitR * 0.4;
                ppy = cy + Math.sin(a) * orbitR * 0.9;
            }

            const sz = (1 + Math.sin(t*3 + i*2) * 0.8 + progress) * dpr;

            ctx.fillStyle = ['#00d4ff', '#7b2fff', '#ff2d55', '#00ff88'][i % 4];
            ctx.globalAlpha = 0.3 + Math.sin(t*4 + i) * 0.25 + progress*0.2;
            ctx.beginPath();
            ctx.arc(ppx, ppy, sz, 0, Math.PI*2);
            ctx.fill();

            // Ślad cząsteczki
            if (progress > 0.3) {
                ctx.globalAlpha *= 0.3;
                ctx.beginPath();
                const tailA = a - 0.3;
                const tx = layer === 0 ? cx + Math.cos(tailA)*orbitR :
                           layer === 1 ? cx + Math.cos(tailA)*orbitR*0.9 :
                                         cx + Math.cos(tailA)*orbitR*0.4;
                const ty = layer === 0 ? cy + Math.sin(tailA)*orbitR :
                           layer === 1 ? cy + Math.sin(tailA)*orbitR*0.4 :
                                         cy + Math.sin(tailA)*orbitR*0.9;
                ctx.moveTo(ppx, ppy);
                ctx.lineTo(tx, ty);
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = sz * 0.5;
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;

        // ── 9. Label ──
        const fs = Math.max(11, r * 0.1);
        ctx.font = `bold ${fs}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(0,212,255,${0.5 + progress*0.3})`;
        ctx.fillText("⟨ QUANTUM PORTAL ⟩", cx, cy - r - 14*dpr);

        // Dystans
        const dist = Math.max(0, this.TRIGGER_DISTANCE - this.distanceWalked);
        ctx.font = `bold ${fs * 1.2}px monospace`;
        ctx.fillStyle = dist < 2 ? "#00ff88" : dist < 4 ? "#00d4ff" : "#ffffff";
        ctx.fillText(`${dist.toFixed(1)}m`, cx, cy + r + 24*dpr);

        // ── 10. Screen-wide effects przy zbliżaniu ──
        if (progress > 0.5) {
            // Edge vignette
            const vig = ctx.createRadialGradient(
                cx, cy, Math.min(this.canvasW, this.canvasH) * 0.3,
                cx, cy, Math.min(this.canvasW, this.canvasH) * 0.8
            );
            vig.addColorStop(0, "rgba(0,0,0,0)");
            vig.addColorStop(1, `rgba(0,212,255,${(progress-0.5)*0.12})`);
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, this.canvasW, this.canvasH);
        }

        if (progress > 0.8) {
            // Screen shake symulacja — cały canvas drga
            const shake = (progress - 0.8) * 15;
            const offX = (Math.random() - 0.5) * shake;
            const offY = (Math.random() - 0.5) * shake;
            ctx.save();
            ctx.translate(offX, offY);
            ctx.restore();

            // Scan lines
            ctx.fillStyle = `rgba(0,212,255,${(progress-0.8)*0.03})`;
            for (let sy = 0; sy < this.canvasH; sy += 4*dpr) {
                ctx.fillRect(0, sy, this.canvasW, 1*dpr);
            }
        }
    }

    updateHUD(progress) {
        const dist = Math.max(0, this.TRIGGER_DISTANCE - this.distanceWalked);
        document.getElementById("hud-dist").textContent = `${dist.toFixed(1)} m`;

        document.getElementById("approach-fill").style.width = (progress*100) + "%";
        if (progress > 0.8) {
            document.getElementById("approach-fill").style.background =
                "linear-gradient(90deg, #0f8, #0ff)";
        }

        const txt = document.getElementById("approach-text");
        if (progress < 0.3) {
            txt.textContent = `Zbliżaj się do portalu... (${this.stepCount} kroków)`;
            txt.style.color = "rgba(255,255,255,0.6)";
        } else if (progress < 0.6) {
            txt.textContent = `⚡ Portal reaguje na Twoją obecność`;
            txt.style.color = "#0df";
        } else if (progress < 0.85) {
            txt.textContent = "⚡⚡ Pole kwantowe się stabilizuje...";
            txt.style.color = "#0df";
        } else if (progress < 0.95) {
            txt.textContent = "⚡⚡⚡ PRAWIE NA MIEJSCU ⚡⚡⚡";
            txt.style.color = "#0f8";
        } else {
            txt.textContent = "🌀 PRZEKRACZASZ PORTAL...";
            txt.style.color = "#0ff";
        }

        const status = document.getElementById("hud-status");
        if (progress < 0.3) status.textContent = "NAWIGACJA";
        else if (progress < 0.7) status.textContent = "⚡ ZBLIŻANIE";
        else if (progress < 0.9) status.textContent = "⚡⚡ SYNCHRONIZACJA";
        else status.textContent = "🌀 PRZEKROCZENIE";
    }

    // ═════════════════════════
    //  TELEPORTACJA
    // ═════════════════════════
    triggerTeleport() {
        if (this.phase === "teleporting") return;
        this.phase = "teleporting";

        cancelAnimationFrame(this.animFrame);

        if (this.backStream) this.backStream.getTracks().forEach(t => t.stop());

        audio.playTeleport();

        if (navigator.vibrate) navigator.vibrate([100,50,100,50,200,100,300]);

        this.switchScreen("screen-flash");
        this.animateFlash();

        setTimeout(() => this.startSelfie(), 3000);
    }

        animateFlash() {
        const canvas = document.getElementById("flash-canvas");
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        const ctx = canvas.getContext("2d");
        const W = canvas.width;
        const H = canvas.height;
        const start = Date.now();

        const texts = [
            "Stabilizacja koordynatów...",
            "Tunelowanie kwantowe...",
            "Dekompresja przestrzenna...",
            "Rekonstrukcja materii...",
            "Weryfikacja integralności..."
        ];

        const animate = () => {
            const elapsed = (Date.now() - start) / 1000;
            if (elapsed > 3) return; // koniec po 3s

            ctx.clearRect(0, 0, W, H);

            // Tło — pulsujące
            const intensity = Math.sin(elapsed * 8) * 0.5 + 0.5;
            const bgGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
            bgGrad.addColorStop(0, `rgba(0,212,255,${0.05 + intensity * 0.08})`);
            bgGrad.addColorStop(0.3, `rgba(123,47,255,${0.03 + intensity * 0.05})`);
            bgGrad.addColorStop(1, `rgba(0,0,0,0.95)`);
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);

            // Rozszerzający się ring
            const ringR = (elapsed / 3) * Math.max(W, H) * 0.8;
            const ringAlpha = Math.max(0, 1 - elapsed / 3);
            ctx.strokeStyle = `rgba(0,212,255,${ringAlpha * 0.5})`;
            ctx.lineWidth = 3 * devicePixelRatio;
            ctx.beginPath();
            ctx.arc(W/2, H/2, ringR, 0, Math.PI*2);
            ctx.stroke();

            // Drugi ring (opóźniony)
            if (elapsed > 0.3) {
                const r2 = ((elapsed - 0.3) / 2.7) * Math.max(W,H) * 0.8;
                ctx.strokeStyle = `rgba(123,47,255,${ringAlpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(W/2, H/2, r2, 0, Math.PI*2);
                ctx.stroke();
            }

            // Trzeci ring
            if (elapsed > 0.6) {
                const r3 = ((elapsed - 0.6) / 2.4) * Math.max(W,H) * 0.8;
                ctx.strokeStyle = `rgba(255,45,85,${ringAlpha * 0.3})`;
                ctx.beginPath();
                ctx.arc(W/2, H/2, r3, 0, Math.PI*2);
                ctx.stroke();
            }

            // Cząsteczki lecące od centrum
            for (let i = 0; i < 40; i++) {
                const angle = (i / 40) * Math.PI * 2 + elapsed * 2;
                const dist = (elapsed * 200 + i * 15) % Math.max(W, H);
                const px = W/2 + Math.cos(angle) * dist;
                const py = H/2 + Math.sin(angle) * dist;
                const alpha = Math.max(0, 1 - dist / Math.max(W, H));
                const size = (1 + Math.random()) * devicePixelRatio;

                ctx.fillStyle = i % 3 === 0 ? `rgba(0,212,255,${alpha})` :
                               i % 3 === 1 ? `rgba(123,47,255,${alpha})` :
                                              `rgba(255,45,85,${alpha})`;
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI*2);
                ctx.fill();
            }

            // Scan lines
            ctx.fillStyle = `rgba(0,212,255,${0.02 + intensity * 0.02})`;
            for (let sy = 0; sy < H; sy += 3 * devicePixelRatio) {
                ctx.fillRect(0, sy, W, 1);
            }

            // Flash na starcie
            if (elapsed < 0.3) {
                const flashAlpha = (1 - elapsed / 0.3) * 0.8;
                ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
                ctx.fillRect(0, 0, W, H);
            }

            // Aktualizuj tekst statusu
            const textIndex = Math.min(
                Math.floor(elapsed / 3 * texts.length),
                texts.length - 1
            );
            document.getElementById("flash-sub").textContent = texts[textIndex];

            requestAnimationFrame(animate);
        };

        animate();
    }

    // ═════════════════════════
    //  SELFIE
    // ═════════════════════════
    async startSelfie() {
        this.phase = "selfie";
        this.switchScreen("screen-selfie");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            const video = document.getElementById("front-camera");
            video.srcObject = stream;
            await video.play();
            this.frontStream = stream;

            document.getElementById("btn-capture")
                .addEventListener("click", () => this.captureSelfie(), { once: true });

            document.getElementById("btn-skip-selfie")
                .addEventListener("click", () => {
                    if (this.frontStream) this.frontStream.getTracks().forEach(t => t.stop());
                    this.generateCertificate(null);
                }, { once: true });

        } catch(e) {
            console.warn("Front camera error:", e);
            this.generateCertificate(null);
        }
    }

    captureSelfie() {
        audio.playShutter();

        // Flash efekt
        const overlay = document.querySelector(".selfie-overlay");
        overlay.style.background = "rgba(255,255,255,0.8)";
        setTimeout(() => overlay.style.background = "transparent", 150);

        if (navigator.vibrate) navigator.vibrate(50);

        const video = document.getElementById("front-camera");
        const canvas = document.getElementById("selfie-canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        // Lustro
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Overlay portalu na zdjęciu
        this.drawSelfieOverlay(ctx, canvas.width, canvas.height);

        if (this.frontStream) this.frontStream.getTracks().forEach(t => t.stop());

        this.selfieDataURL = canvas.toDataURL("image/jpeg", 0.92);
        
        // Małe opóźnienie na dramatyczny efekt
        setTimeout(() => {
            this.generateCertificate(this.selfieDataURL);
        }, 500);
    }

    drawSelfieOverlay(ctx, w, h) {
        // Gradient wokół
        const g = ctx.createRadialGradient(
            w/2, h/2, Math.min(w,h)*0.2,
            w/2, h/2, Math.min(w,h)*0.6
        );
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.5, "rgba(0,212,255,0.05)");
        g.addColorStop(0.8, "rgba(123,47,255,0.15)");
        g.addColorStop(1, "rgba(0,0,0,0.4)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // Ring portalu
        ctx.strokeStyle = "rgba(0,212,255,0.6)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(w/2, h/2, Math.min(w,h)*0.38, 0, Math.PI*2);
        ctx.stroke();

        // Drugi ring
        ctx.strokeStyle = "rgba(123,47,255,0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w/2, h/2, Math.min(w,h)*0.42, 0, Math.PI*2);
        ctx.stroke();

        // Timestamp
        ctx.fillStyle = "rgba(0,212,255,0.6)";
        ctx.font = `bold ${Math.round(w*0.025)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText("⚡ QUANTUM JUMP ⚡", w/2, h*0.06);

        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = `${Math.round(w*0.02)}px monospace`;
        ctx.fillText(new Date().toISOString(), w/2, h*0.96);
        ctx.fillText(this.jumpId, w/2, h*0.93);
    }

    // ═════════════════════════
    //  CERTYFIKAT
    // ═════════════════════════
    generateCertificate(selfieURL) {
        this.phase = "certificate";
        this.switchScreen("screen-cert");
        audio.playSuccess();

        // Zapisz skok do localStorage (historia + admin sync)
        this.saveJump();

        const canvas = document.getElementById("cert-canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 1080;
        canvas.height = 1920;

        if (selfieURL) {
            const img = new Image();
            img.onload = () => {
                this.drawCert(ctx, canvas, img);
                this.setupCertButtons(canvas);
            };
            img.src = selfieURL;
        } else {
            this.drawCert(ctx, canvas, null);
            this.setupCertButtons(canvas);
        }
    }

    saveJump() {
        try {
            const jumps = JSON.parse(localStorage.getItem("qt-jumps") || "[]");
            jumps.push({
                id: this.jumpId,
                timestamp: new Date().toISOString(),
                steps: this.stepCount,
                distance: this.distanceWalked,
                gps: this.gpsPosition,
                hasSelfie: !!this.selfieDataURL
            });
            localStorage.setItem("qt-jumps", JSON.stringify(jumps));
        } catch(e) {
            console.warn("Save error:", e);
        }
    }

        drawCert(ctx, canvas, selfieImg) {
        const W = canvas.width;
        const H = canvas.height;
        const now = new Date();

        // ── Tło ──
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, "#050510");
        bg.addColorStop(0.4, "#0a0a2e");
        bg.addColorStop(0.7, "#0d0520");
        bg.addColorStop(1, "#050515");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Siatka
        ctx.strokeStyle = "rgba(0,212,255,0.03)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 40; i++) {
            ctx.beginPath(); ctx.moveTo(0, i*(H/40)); ctx.lineTo(W, i*(H/40)); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i*(W/25), 0); ctx.lineTo(i*(W/25), H); ctx.stroke();
        }

        // Ramki
        const m = 40;
        ctx.strokeStyle = "rgba(0,212,255,0.15)";
        ctx.lineWidth = 1;
        ctx.strokeRect(m, m, W-m*2, H-m*2);
        ctx.strokeStyle = "rgba(123,47,255,0.08)";
        ctx.strokeRect(m+10, m+10, W-m*2-20, H-m*2-20);

        // Narożniki
        ctx.strokeStyle = "#00d4ff";
        ctx.lineWidth = 3;
        const cs = 40;
        [[m,m,1,1],[W-m,m,-1,1],[m,H-m,1,-1],[W-m,H-m,-1,-1]].forEach(([x,y,dx,dy]) => {
            ctx.beginPath();
            ctx.moveTo(x, y+dy*cs); ctx.lineTo(x, y); ctx.lineTo(x+dx*cs, y);
            ctx.stroke();
        });

        let y = 80;

        // ── Logo + Tytuł ──
        ctx.textAlign = "center";
        ctx.font = "64px serif";
        ctx.fillStyle = "#fff";
        ctx.fillText("🌀", W/2, y); y += 55;

        ctx.font = "bold 46px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("CERTYFIKAT", W/2, y); y += 44;

        ctx.font = "bold 28px Arial";
        const tg = ctx.createLinearGradient(W*0.15, 0, W*0.85, 0);
        tg.addColorStop(0, "#00d4ff");
        tg.addColorStop(0.5, "#7b2fff");
        tg.addColorStop(1, "#ff2d55");
        ctx.fillStyle = tg;
        ctx.fillText("SKOKU KWANTOWEGO", W/2, y); y += 22;

        ctx.font = "12px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillText("QUANTUM TELEPORTATION CERTIFICATE", W/2, y); y += 20;

        this.drawCertLine(ctx, W, y); y += 18;

        // ── Selfie ──
        if (selfieImg) {
            const pw = 420, ph = 315;
            const px = (W - pw) / 2;

            ctx.strokeStyle = "rgba(0,212,255,0.3)";
            ctx.lineWidth = 2;
            ctx.strokeRect(px-4, y-4, pw+8, ph+8);

            ctx.strokeStyle = "#00d4ff";
            ctx.lineWidth = 2;
            const pcs = 15;
            [[px,y,1,1],[px+pw,y,-1,1],[px,y+ph,1,-1],[px+pw,y+ph,-1,-1]].forEach(([x2,y2,dx,dy]) => {
                ctx.beginPath();
                ctx.moveTo(x2, y2+dy*pcs); ctx.lineTo(x2, y2); ctx.lineTo(x2+dx*pcs, y2);
                ctx.stroke();
            });

            const sa = selfieImg.width / selfieImg.height;
            const da = pw / ph;
            let sx=0,sy2=0,sw=selfieImg.width,sh=selfieImg.height;
            if (sa > da) { sw=sh*da; sx=(selfieImg.width-sw)/2; }
            else { sh=sw/da; sy2=(selfieImg.height-sh)/2; }
            ctx.drawImage(selfieImg, sx,sy2,sw,sh, px,y,pw,ph);

            y += ph + 14;
            ctx.font = "9px monospace";
            ctx.fillStyle = "rgba(255,255,255,0.18)";
            ctx.textAlign = "center";
            ctx.fillText("REJESTRACJA MOMENTU PRZEKROCZENIA PORTALU", W/2, y);
            y += 18;
        }

        this.drawCertLine(ctx, W, y); y += 20;

        // ── Dane podstawowe ──
        ctx.textAlign = "left";
        const dx = m + 50;

        const field = (label, value, color) => {
            ctx.font = "bold 9px monospace";
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillText(label, dx, y); y += 18;
            ctx.font = "bold 17px monospace";
            ctx.fillStyle = color || "#00d4ff";
            ctx.fillText(value, dx, y); y += 28;
        };

        field("IDENTYFIKATOR SKOKU", this.jumpId);
        field("DATA I CZAS", now.toLocaleString("pl-PL"));
        field("DYSTANS PRZEJŚCIOWY",
            `${this.distanceWalked.toFixed(1)}m · ${this.stepCount} kroków`);

        if (this.gpsPosition) {
            field("WSPÓŁRZĘDNE ORIGIN",
                `${this.gpsPosition.lat.toFixed(6)}°N  ${this.gpsPosition.lng.toFixed(6)}°E`);
        }

        field("STATUS", "✅ TELEPORTACJA ZAKOŃCZONA SUKCESEM!", "#00ff88");

        y += 5;
        this.drawCertLine(ctx, W, y); y += 15;

        // ══════════════════════════════════════════
        //  QUANTUM SIGNATURE BLOCK
        //  Przygotowane pod przyszłe podłączenie
        //  do zewnętrznego silnika kwantowego
        // ══════════════════════════════════════════

        // Generuj dane kwantowe (teraz algorytmicznie, 
        // docelowo z API silnika)
        const qData = this.generateQuantumSignature();

        // Nagłówek bloku
        ctx.textAlign = "center";
        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "rgba(0,212,255,0.4)";
        ctx.fillText("◈ QUANTUM SIGNATURE BLOCK ◈", W/2, y); y += 18;

        // Ramka bloku
        const blockX = m + 30;
        const blockW = W - m*2 - 60;
        const blockY = y - 5;
        const blockH = 200;

        ctx.strokeStyle = "rgba(0,212,255,0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(blockX, blockY, blockW, blockH);
        ctx.setLineDash([]);

        // Małe narożniki bloku
        ctx.strokeStyle = "rgba(0,212,255,0.3)";
        ctx.lineWidth = 2;
        const bcs = 10;
        [[blockX,blockY,1,1],
         [blockX+blockW,blockY,-1,1],
         [blockX,blockY+blockH,1,-1],
         [blockX+blockW,blockY+blockH,-1,-1]
        ].forEach(([bx,by,ddx,ddy]) => {
            ctx.beginPath();
            ctx.moveTo(bx, by+ddy*bcs); ctx.lineTo(bx, by); ctx.lineTo(bx+ddx*bcs, by);
            ctx.stroke();
        });

        // Dane kwantowe
        ctx.textAlign = "left";
        const qx = blockX + 15;

        const qField = (label, value, valueColor) => {
            ctx.font = "bold 8px monospace";
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillText(label, qx, y); 

            ctx.font = "11px monospace";
            ctx.fillStyle = valueColor || "rgba(0,212,255,0.6)";
            ctx.fillText(value, qx + 195, y);
            y += 16;
        };

        qField("ORIGIN TIMELINE",      qData.originTimeline);
        qField("DESTINATION TIMELINE",  qData.destTimeline);
        qField("COHERENCE INDEX",       qData.coherenceIndex,    "rgba(0,255,136,0.6)");
        qField("DECOHERENCE TIME",      qData.decoherenceTime);
        qField("OBSERVER HASH",         qData.observerHash,      "rgba(123,47,255,0.6)");
        qField("ENTANGLEMENT STATE",    qData.entanglementState, "rgba(0,255,136,0.6)");
        qField("PLANCK OFFSET",         qData.planckOffset);
        qField("BRANCH SIGNATURE",      qData.branchSignature,   "rgba(255,45,85,0.6)");
        qField("MULTIVERSE SECTOR",     qData.multiverseSector);
        qField("ENGINE STATUS",         qData.engineStatus,      "rgba(255,170,0,0.6)");

        y = blockY + blockH + 15;

        // ── QR placeholder ──
        // (docelowo prawdziwy QR z linkiem weryfikacyjnym)
        const qrSize = 70;
        const qrX = W - m - 55 - qrSize;
        const qrY = blockY + blockH + 10;

        ctx.strokeStyle = "rgba(0,212,255,0.15)";
        ctx.lineWidth = 1;
        ctx.strokeRect(qrX, qrY, qrSize, qrSize);

        // Symulacja QR (pattern)
        this.drawFakeQR(ctx, qrX, qrY, qrSize, this.jumpId);

        ctx.font = "7px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.textAlign = "center";
        ctx.fillText("SCAN TO VERIFY", qrX + qrSize/2, qrY + qrSize + 10);

        // ── Stopka ──
        y = H - 80;
        this.drawCertLine(ctx, W, y); y += 16;

        ctx.textAlign = "center";
        ctx.font = "8px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.15)";

        const fullSig = `${this.jumpId}-${qData.branchSignature}-${Date.now().toString(36).toUpperCase()}`;
        ctx.fillText(`SYGNATURA PEŁNA: ${fullSig}`, W/2, y); y += 12;
        ctx.fillText("Quantum Teleport Interface v3.0 · Protokół Rekalibracji Koordynatów", W/2, y); y += 12;
        ctx.fillText("Ten dokument potwierdza pomyślne dokonanie skoku kwantowego.", W/2, y); y += 12;
        ctx.fillText("Weryfikacja integralności wymaga podłączenia do silnika kwantowego.", W/2, y);

        y = H - 25;
        ctx.font = "24px serif";
        ctx.fillText("🌀", W/2, y);
    }

    // ══════════════════════════════════
    //  QUANTUM SIGNATURE GENERATOR
    //  
    //  Teraz: deterministyczny z danych skoku
    //  Docelowo: z API silnika kwantowego
    // ══════════════════════════════════
    generateQuantumSignature() {
        const now = Date.now();
        const seed = this.jumpId + now.toString();

        // Pseudo-hash function
        const hash = (str, len) => {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = ((h << 5) - h) + str.charCodeAt(i);
                h = h & h;
            }
            const hex = Math.abs(h).toString(16).toUpperCase().padStart(len, '0');
            return hex.substring(0, len);
        };

        // Generuj timeline IDs (format: TL-XXXX-XXXX)
        const originTL = `TL-${hash(seed + "origin", 4)}-${hash(seed + "o2", 4)}`;
        const destTL = `TL-${hash(seed + "dest", 4)}-${hash(seed + "d2", 4)}`;

        // Coherence index (0.000 - 1.000)
        const coherence = (0.847 + (this.stepCount % 100) / 1000).toFixed(4);

        // Decoherence time
        const decoMs = 12.4 + (this.distanceWalked * 0.7);

        // Observer hash
        const obsHash = hash(
            seed + navigator.userAgent + (this.gpsPosition?.lat || 0).toString(),
            12
        );

        // Branch signature
        const branchSig = hash(seed + "branch" + this.stepCount, 8);

        // Multiverse sector (format: Σ-XXX.XXX)
        const sector = `Σ-${(Math.abs(parseInt(hash(seed + "sector", 4), 16)) % 999).toString().padStart(3,'0')}.${(Math.abs(parseInt(hash(seed + "sub", 4), 16)) % 999).toString().padStart(3,'0')}`;

        return {
            originTimeline: originTL,
            destTimeline: destTL,
            coherenceIndex: coherence,
            decoherenceTime: `${decoMs.toFixed(1)}ms`,
            observerHash: `0x${obsHash}`,
            entanglementState: "VERIFIED ◈",
            planckOffset: `±${(1.616255e-35 * (1 + this.stepCount * 0.01)).toExponential(3)}m`,
            branchSignature: branchSig,
            multiverseSector: sector,
            engineStatus: "⧗ AWAITING CONNECTION"
        };
    }

    // ══════════════════════════════
    //  FAKE QR (pattern generowany z ID)
    // ══════════════════════════════
    drawFakeQR(ctx, x, y, size, data) {
        const cells = 15;
        const cellSize = size / cells;

        // Generuj pattern z danych
        let bits = '';
        for (let i = 0; i < data.length; i++) {
            bits += data.charCodeAt(i).toString(2).padStart(8, '0');
        }
        // Powtórz żeby wystarczyło
        while (bits.length < cells * cells) bits += bits;

        ctx.fillStyle = "rgba(0,212,255,0.5)";

        for (let row = 0; row < cells; row++) {
            for (let col = 0; col < cells; col++) {
                // Narożniki QR zawsze wypełnione (jak prawdziwy QR)
                const isCorner =
                    (row < 3 && col < 3) ||
                    (row < 3 && col >= cells-3) ||
                    (row >= cells-3 && col < 3);

                const bitIndex = row * cells + col;
                const isFilled = isCorner || bits[bitIndex % bits.length] === '1';

                if (isFilled) {
                    ctx.fillRect(
                        x + col * cellSize,
                        y + row * cellSize,
                        cellSize - 0.5,
                        cellSize - 0.5
                    );
                }
            }
        }
    }

    setupCertButtons(canvas) {
        // Download
        document.getElementById("btn-download").addEventListener("click", () => {
            const link = document.createElement("a");
            link.download = `quantum-teleport-${this.jumpId}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        }, { once: true });

        // Share
        const shareBtn = document.getElementById("btn-share");
        if (navigator.share && navigator.canShare) {
            shareBtn.style.display = "block";
            shareBtn.addEventListener("click", () => {
                canvas.toBlob(async (blob) => {
                    const file = new File([blob],
                        `quantum-teleport-${this.jumpId}.png`,
                        { type: "image/png" }
                    );
                    try {
                        await navigator.share({
                            title: "Certyfikat Skoku Kwantowego 🌀",
                            text: `Dokonałem skoku kwantowego! ID: ${this.jumpId}`,
                            files: [file]
                        });
                    } catch(e) { /* cancelled */ }
                });
            }, { once: true });
        }

        // Again
        document.getElementById("btn-again").addEventListener("click", () => {
            location.reload();
        }, { once: true });
    }

    // ═════════════════════════
    //  UTILS
    // ═════════════════════════
    switchScreen(id) {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        document.getElementById(id).classList.add("active");
    }
}

// ═══ START ═══
const teleporter = new QuantumTeleporter();
