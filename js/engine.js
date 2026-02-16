/**
 * ═══════════════════════════════════════
 *  QUANTUM TELEPORT ENGINE v2.2
 *  
 *  FIX: motion detection
 * ═══════════════════════════════════════
 */

class QuantumTeleporter {
    constructor() {
        // Portal
        this.portalPlaced = false;
        this.portalX = 0.5;
        this.portalY = 0.4;
        this.portalAngle = 0;
        this.portalPulse = 0;

        // Ruch
        this.stepCount = 0;
        this.distanceWalked = 0;
        this.TRIGGER_DISTANCE = 8;
        
        // Detekcja kroków
        this.accelBuffer = [];
        this.lastStepTime = 0;
        this.STEP_COOLDOWN = 300;    // ms między krokami
        this.STEP_THRESHOLD = 1.5;   // czułość (niżej = czulej)
        this.motionAvailable = false;
        this.motionDebug = { x: 0, y: 0, z: 0, mag: 0, delta: 0 };
        this.smoothedMagnitude = 9.81; // gravity

        // Gyro
        this.gyroAlpha = 0;
        this.gyroBeta = 0;
        this.gyroGamma = 0;
        this.gyroBaseAlpha = null;
        this.gyroBaseBeta = null;
        this.gyroBaseGamma = null;
        this.gyroAvailable = false;

        // GPS
        this.gpsPosition = null;

        // Selfie
        this.selfieDataURL = null;

        // Meta
        this.jumpId = this.makeId();
        this.animFrame = null;

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
    init() {
        this.grabGPS();
        this.preparePermissions();
    }

    grabGPS() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            pos => {
                this.gpsPosition = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
                document.getElementById("gps-val").textContent =
                    `${pos.coords.latitude.toFixed(4)}°N ${pos.coords.longitude.toFixed(4)}°E`;
            },
            () => {
                document.getElementById("gps-val").textContent = "NIEDOSTĘPNE";
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    async preparePermissions() {
        const statusEl = document.getElementById("status-val");
        
        // Na iOS trzeba poprosić o permission PRZEZ user gesture (kliknięcie)
        // Więc nie robimy tego tu — robimy to w btn-start click handler
        
        // Sprawdź czy eventy w ogóle istnieją
        const hasMotion = 'DeviceMotionEvent' in window;
        const hasOrientation = 'DeviceOrientationEvent' in window;
        
        if (hasMotion && hasOrientation) {
            statusEl.textContent = "✅ GOTOWY";
            statusEl.style.color = "#0f8";
        } else if (hasMotion || hasOrientation) {
            statusEl.textContent = "⚠️ CZĘŚCIOWO GOTOWY";
            statusEl.style.color = "#fa0";
        } else {
            statusEl.textContent = "⚠️ BRAK SENSORÓW (fallback)";
            statusEl.style.color = "#fa0";
        }

        const btn = document.getElementById("btn-start");
        btn.disabled = false;
        btn.addEventListener("click", () => this.requestPermissionsAndStart());
    }

    // ═════════════════════════════════════
    //  PERMISSIONS (musi być w click handler!)
    // ═════════════════════════════════════
    async requestPermissionsAndStart() {
        const btn = document.getElementById("btn-start");
        btn.disabled = true;
        btn.textContent = "⏳ INICJALIZACJA...";

        // ── iOS DeviceMotion permission ──
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const motionPerm = await DeviceMotionEvent.requestPermission();
                this.motionAvailable = (motionPerm === 'granted');
                console.log("DeviceMotion permission:", motionPerm);
            } catch (e) {
                console.warn("DeviceMotion permission error:", e);
                this.motionAvailable = false;
            }
        } else {
            // Android — nie wymaga permission
            this.motionAvailable = true;
        }

        // ── iOS DeviceOrientation permission ──
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const orientPerm = await DeviceOrientationEvent.requestPermission();
                this.gyroAvailable = (orientPerm === 'granted');
                console.log("DeviceOrientation permission:", orientPerm);
            } catch (e) {
                console.warn("DeviceOrientation permission error:", e);
                this.gyroAvailable = false;
            }
        } else {
            this.gyroAvailable = true;
        }

        console.log(`Sensors: motion=${this.motionAvailable}, gyro=${this.gyroAvailable}`);

        // Teraz uruchom AR
        this.startAR();
    }

    // ═════════════════════════
    //  FAZA 1: AR
    // ═════════════════════════
    async startAR() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
            const video = document.getElementById("back-camera");
            video.srcObject = stream;
            await video.play();
            this.backStream = stream;
        } catch (e) {
            alert("Brak dostępu do kamery: " + e.message);
            return;
        }

        this.switchScreen("screen-ar");

        // Canvas
        const canvas = document.getElementById("ar-canvas");
        // Poczekaj chwilę aż layout się ustali
        await new Promise(r => setTimeout(r, 100));
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        this.ctx = canvas.getContext("2d");
        this.canvasW = canvas.width;
        this.canvasH = canvas.height;

        // Tap to place
        canvas.addEventListener("click", (e) => {
            if (!this.portalPlaced) {
                this.placePortal(e);
            }
        });

        // ── Start sensorów (PO uzyskaniu permissions) ──
        this.startMotionDetection();
        this.startGyro();

        // Render loop
        this.renderLoop();
    }

    placePortal(e) {
        const rect = e.target.getBoundingClientRect();
        this.portalX = (e.clientX - rect.left) / rect.width;
        this.portalY = (e.clientY - rect.top) / rect.height;
        this.portalPlaced = true;
        this.distanceWalked = 0;
        this.stepCount = 0;

        this.gyroBaseAlpha = this.gyroAlpha;
        this.gyroBaseBeta = this.gyroBeta;
        this.gyroBaseGamma = this.gyroGamma;

        document.getElementById("approach-bar-wrap").style.display = "block";
        document.getElementById("hud-status").textContent = "IDŹ KU PORTALOWI";

        if (navigator.vibrate) navigator.vibrate(50);
    }

    // ═══════════════════════════════════════
    //  MOTION DETECTION — naprawione
    // ═══════════════════════════════════════
    startMotionDetection() {
        if (!this.motionAvailable) {
            console.warn("Motion niedostępny — włączam fallback");
            this.startManualFallback();
            return;
        }

        let eventFired = false;

        const handler = (event) => {
            eventFired = true;

            // Użyj accelerationIncludingGravity (szersze wsparcie)
            // LUB acceleration (bez grawitacji — lepsze do kroków)
            const acc = event.acceleration || event.accelerationIncludingGravity;
            
            if (!acc || acc.x === null) {
                // Niektóre przeglądarki podają event ale null values
                return;
            }

            const x = acc.x || 0;
            const y = acc.y || 0;
            const z = acc.z || 0;

            this.processMotion(x, y, z, !!event.acceleration);
        };

        window.addEventListener("devicemotion", handler, true);

        // Sprawdź po 2s czy event w ogóle strzelił
        setTimeout(() => {
            if (!eventFired) {
                console.warn("devicemotion nie strzelił — fallback");
                window.removeEventListener("devicemotion", handler);
                this.motionAvailable = false;
                this.startManualFallback();
            } else {
                console.log("✅ devicemotion działa");
            }
        }, 2000);
    }

    processMotion(x, y, z, isWithoutGravity) {
        const magnitude = Math.sqrt(x*x + y*y + z*z);

        // Debug
        this.motionDebug = {
            x: x.toFixed(2),
            y: y.toFixed(2),
            z: z.toFixed(2),
            mag: magnitude.toFixed(2),
            smooth: this.smoothedMagnitude.toFixed(2),
            steps: this.stepCount
        };

        // Wygładź sygnał (low-pass filter)
        const alpha = 0.2;
        this.smoothedMagnitude = alpha * magnitude + (1 - alpha) * this.smoothedMagnitude;

        // Oblicz odchylenie od wygładzonej wartości
        const delta = Math.abs(magnitude - this.smoothedMagnitude);

        this.motionDebug.delta = delta.toFixed(2);

        // Próg detekcji kroku
        // Jeśli mamy "czyste" przyspieszenie (bez grawitacji) → niższy próg
        const threshold = isWithoutGravity ? this.STEP_THRESHOLD : this.STEP_THRESHOLD + 0.5;

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
        this.distanceWalked = this.stepCount * 0.7; // ~70cm na krok

        // Drobna wibracja przy kroku (feedback)
        if (navigator.vibrate && this.stepCount <= 20) {
            navigator.vibrate(15);
        }

        console.log(`👟 Krok #${this.stepCount} → ${this.distanceWalked.toFixed(1)}m`);
    }

    // ── Fallback: przyciski ręczne ──
    startManualFallback() {
        console.log("🔧 Manual fallback aktywny");

        // Dodaj przycisk "krok" na ekranie
        const wrap = document.getElementById("approach-bar-wrap");
        
        const fallbackInfo = document.createElement("div");
        fallbackInfo.style.cssText = `
            color: #fa0; font-size: 0.7rem; margin-bottom: 8px;
            text-align: center;
        `;
        fallbackInfo.textContent = "⚠️ Sensory niedostępne — użyj przycisków:";

        const btnWalk = document.createElement("button");
        btnWalk.textContent = "👟 KROK";
        btnWalk.style.cssText = `
            background: rgba(0,212,255,0.2);
            color: #0df; border: 1px solid rgba(0,212,255,0.4);
            padding: 14px 40px; border-radius: 12px;
            font-size: 1rem; cursor: pointer;
            margin: 6px; pointer-events: auto;
        `;
        btnWalk.addEventListener("click", () => {
            this.registerStep();
            if (navigator.vibrate) navigator.vibrate(15);
        });

        const btnRun = document.createElement("button");
        btnRun.textContent = "🏃 ×5";
        btnRun.style.cssText = btnWalk.style.cssText;
        btnRun.addEventListener("click", () => {
            for (let i = 0; i < 5; i++) this.registerStep();
            if (navigator.vibrate) navigator.vibrate([15,30,15]);
        });

        wrap.style.display = "block";
        wrap.prepend(fallbackInfo);
        
        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex; justify-content:center; gap:8px; margin-bottom:8px;";
        btnRow.appendChild(btnWalk);
        btnRow.appendChild(btnRun);
        wrap.prepend(btnRow);
    }

    // ═════════════════════════
    //  ŻYROSKOP
    // ═════════════════════════
    startGyro() {
        if (!this.gyroAvailable) {
            console.warn("Gyro niedostępny");
            return;
        }

        let eventFired = false;

        const handler = (e) => {
            eventFired = true;
            if (e.alpha !== null) this.gyroAlpha = e.alpha;
            if (e.beta !== null) this.gyroBeta = e.beta;
            if (e.gamma !== null) this.gyroGamma = e.gamma;
        };

        window.addEventListener("deviceorientation", handler, true);

        setTimeout(() => {
            if (!eventFired) {
                console.warn("deviceorientation nie strzelił");
                this.gyroAvailable = false;
            } else {
                console.log("✅ deviceorientation działa");
            }
        }, 2000);
    }

    // ═════════════════════════
    //  RENDER LOOP
    // ═════════════════════════
    renderLoop() {
        this.animFrame = requestAnimationFrame(() => this.renderLoop());

        const ctx = this.ctx;
        const W = this.canvasW;
        const H = this.canvasH;

        ctx.clearRect(0, 0, W, H);

        if (!this.portalPlaced) {
            this.drawHint(ctx, W, H);
            this.drawDebugOverlay(ctx, W, H);
            return;
        }

        // Pozycja portalu z gyro
        let px = this.portalX;
        let py = this.portalY;

        if (this.gyroAvailable && this.gyroBaseGamma !== null) {
            const dGamma = this.gyroGamma - this.gyroBaseGamma;
            const dBeta = this.gyroBeta - this.gyroBaseBeta;
            px -= (dGamma / 90) * 0.5;
            py += (dBeta / 90) * 0.3;
        }

        px = Math.max(0.1, Math.min(0.9, px));
        py = Math.max(0.1, Math.min(0.9, py));

        // Rozmiar
        const progress = Math.min(1, this.distanceWalked / this.TRIGGER_DISTANCE);
        const minR = Math.min(W, H) * 0.08;
        const maxR = Math.min(W, H) * 0.45;
        const radius = minR + (maxR - minR) * this.easeInOut(progress);

        this.portalAngle += 0.02;
        this.portalPulse += 0.05;
        const pulse = 1 + Math.sin(this.portalPulse) * 0.03 * (1 + progress);

        const screenX = px * W;
        const screenY = py * H;
        const r = radius * pulse;

        this.drawPortal(ctx, screenX, screenY, r, progress);
        this.updateHUD(progress);
        this.drawDebugOverlay(ctx, W, H);

        if (progress >= 1) {
            this.triggerTeleport();
        }
    }

    easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    drawHint(ctx, W, H) {
        const t = Date.now() / 1000;
        ctx.fillStyle = `rgba(0,212,255,${0.3 + Math.sin(t * 2) * 0.15})`;
        ctx.font = `${18 * devicePixelRatio}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("👆 TAPNIJ aby postawić portal", W / 2, H * 0.5);
    }

    // ══════════════════════════════
    //  DEBUG OVERLAY (na canvasie)
    // ══════════════════════════════
    drawDebugOverlay(ctx, W, H) {
        const d = this.motionDebug;
        const fontSize = 10 * devicePixelRatio;
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(0,255,136,0.7)";

        let y = 60 * devicePixelRatio;
        const x = 10 * devicePixelRatio;
        const lineH = fontSize * 1.3;

        // Tło pod debug
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(x - 4, y - fontSize, 280 * devicePixelRatio, lineH * 10);

        ctx.fillStyle = "rgba(0,255,136,0.8)";

        const lines = [
            `MOTION: ${this.motionAvailable ? '✅ ON' : '❌ OFF'}`,
            `GYRO:   ${this.gyroAvailable ? '✅ ON' : '❌ OFF'}`,
            `ACC:    x=${d.x} y=${d.y} z=${d.z}`,
            `MAG:    ${d.mag}  smooth=${d.smooth}`,
            `DELTA:  ${d.delta}  threshold=${this.STEP_THRESHOLD}`,
            `STEPS:  ${this.stepCount}`,
            `DIST:   ${this.distanceWalked.toFixed(1)}m / ${this.TRIGGER_DISTANCE}m`,
            `PORTAL: ${this.portalPlaced ? 'PLACED' : 'WAITING'}`,
            `GYRO β: ${this.gyroBeta.toFixed(1)} γ: ${this.gyroGamma.toFixed(1)}`
        ];

        lines.forEach(line => {
            ctx.fillText(line, x, y);
            y += lineH;
        });
    }

    // ══════════════════════════════
    //  RYSOWANIE PORTALU
    // ══════════════════════════════
    drawPortal(ctx, cx, cy, r, progress) {
        const time = Date.now() / 1000;

        // Poświata zewnętrzna
        const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.4);
        glow.addColorStop(0, `rgba(0,212,255,${0.05 + progress * 0.1})`);
        glow.addColorStop(1, "rgba(0,212,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Ciemny środek
        const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.75);
        inner.addColorStop(0, `rgba(5,5,20,${0.7 + progress * 0.25})`);
        inner.addColorStop(0.7, `rgba(10,10,50,${0.5 + progress * 0.2})`);
        inner.addColorStop(1, "rgba(0,212,255,0.1)");
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
        ctx.fill();

        // Ring 1
        ctx.strokeStyle = `rgba(0,212,255,${0.6 + Math.sin(time * 2) * 0.2})`;
        ctx.lineWidth = 3 * devicePixelRatio;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Ring 2 obrócony
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.portalAngle);
        ctx.strokeStyle = `rgba(123,47,255,${0.5 + Math.sin(time * 3) * 0.2})`;
        ctx.lineWidth = 2 * devicePixelRatio;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.9, r * 0.85, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Ring 3
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-this.portalAngle * 0.7);
        ctx.strokeStyle = `rgba(255,45,85,${0.3 + progress * 0.3})`;
        ctx.lineWidth = 1.5 * devicePixelRatio;
        ctx.setLineDash([10, 15]);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.6, r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Cząsteczki
        const numP = 10 + Math.floor(progress * 10);
        for (let i = 0; i < numP; i++) {
            const a = (i / numP) * Math.PI * 2 + time * (1 + i * 0.1);
            const d = r * (0.8 + Math.sin(time * 2 + i) * 0.15);
            const ppx = cx + Math.cos(a) * d;
            const ppy = cy + Math.sin(a) * d;
            const sz = (1.5 + Math.sin(time * 3 + i * 2) * 1) * devicePixelRatio;

            ctx.fillStyle = i % 3 === 0 ? "#00d4ff" : i % 3 === 1 ? "#7b2fff" : "#ff2d55";
            ctx.globalAlpha = 0.4 + Math.sin(time * 4 + i) * 0.3;
            ctx.beginPath();
            ctx.arc(ppx, ppy, sz, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Label
        const fs = Math.max(12, r * 0.12);
        ctx.font = `bold ${fs}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,212,255,0.7)";
        ctx.fillText("QUANTUM PORTAL", cx, cy - r - 12 * devicePixelRatio);

        // Dystans
        const dist = Math.max(0, this.TRIGGER_DISTANCE - this.distanceWalked);
        ctx.font = `${fs * 0.8}px monospace`;
        ctx.fillStyle = dist < 2 ? "#0f8" : "#fff";
        ctx.fillText(`${dist.toFixed(1)}m`, cx, cy + r + 20 * devicePixelRatio);

        // Efekt bliskości
        if (progress > 0.7) {
            ctx.fillStyle = `rgba(0,212,255,${(progress - 0.7) * 0.15})`;
            ctx.fillRect(0, 0, this.canvasW, this.canvasH);
        }
    }

    updateHUD(progress) {
        const dist = Math.max(0, this.TRIGGER_DISTANCE - this.distanceWalked);
        document.getElementById("hud-dist").textContent = `${dist.toFixed(1)} m`;

        document.getElementById("approach-fill").style.width = (progress * 100) + "%";

        if (progress > 0.8) {
            document.getElementById("approach-fill").style.background =
                "linear-gradient(90deg, #0f8, #0ff)";
        }

        const txt = document.getElementById("approach-text");
        if (progress < 0.3) {
            txt.textContent = `Idź ku portalowi... (${this.stepCount} kroków)`;
        } else if (progress < 0.7) {
            txt.textContent = `⚡ Portal reaguje (${this.stepCount} kroków)`;
        } else if (progress < 0.95) {
            txt.textContent = "⚡⚡ PRAWIE NA MIEJSCU ⚡⚡";
            txt.style.color = "#0f8";
        } else {
            txt.textContent = "🌀 PRZEKRACZASZ PORTAL...";
            txt.style.color = "#0ff";
        }
    }

    // ═════════════════════════
    //  TELEPORTACJA
    // ═════════════════════════
    triggerTeleport() {
        if (this.phase === "teleporting") return;
        this.phase = "teleporting";

        cancelAnimationFrame(this.animFrame);

        if (this.backStream) {
            this.backStream.getTracks().forEach(t => t.stop());
        }

        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

        this.switchScreen("screen-flash");

        setTimeout(() => this.startSelfie(), 2500);
    }

    // ═════════════════════════
    //  SELFIE
    // ═════════════════════════
    async startSelfie() {
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
                .addEventListener("click", () => this.captureSelfie());
            document.getElementById("btn-skip-selfie")
                .addEventListener("click", () => {
                    if (this.frontStream) this.frontStream.getTracks().forEach(t => t.stop());
                    this.generateCertificate(null);
                });

        } catch (e) {
            this.generateCertificate(null);
        }
    }

    captureSelfie() {
        const video = document.getElementById("front-camera");
        const canvas = document.getElementById("selfie-canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        this.drawSelfieOverlay(ctx, canvas.width, canvas.height);

        if (this.frontStream) this.frontStream.getTracks().forEach(t => t.stop());

        this.selfieDataURL = canvas.toDataURL("image/jpeg", 0.92);
        this.generateCertificate(this.selfieDataURL);
    }

    drawSelfieOverlay(ctx, w, h) {
        const g = ctx.createRadialGradient(
            w / 2, h / 2, Math.min(w, h) * 0.2,
            w / 2, h / 2, Math.min(w, h) * 0.55
        );
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.6, "rgba(0,212,255,0.05)");
        g.addColorStop(1, "rgba(123,47,255,0.3)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "rgba(0,212,255,0.5)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.38, 0, Math.PI * 2);
        ctx.stroke();
    }

    // ═════════════════════════
    //  CERTYFIKAT
    // ═════════════════════════
    generateCertificate(selfieURL) {
        this.switchScreen("screen-cert");

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

    drawCert(ctx, canvas, selfieImg) {
        const W = canvas.width;
        const H = canvas.height;
        const now = new Date();

        // Tło
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, "#050510");
        bg.addColorStop(0.5, "#0a0a2e");
        bg.addColorStop(1, "#0d0520");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Siatka
        ctx.strokeStyle = "rgba(0,212,255,0.04)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 30; i++) {
            ctx.beginPath(); ctx.moveTo(0, i * (H / 30)); ctx.lineTo(W, i * (H / 30)); ctx.stroke();
        }

        // Ramka + narożniki
        const m = 40;
        ctx.strokeStyle = "rgba(0,212,255,0.2)";
        ctx.strokeRect(m, m, W - m * 2, H - m * 2);

        ctx.strokeStyle = "#00d4ff";
        ctx.lineWidth = 3;
        const cs = 35;
        [[m,m,1,1],[W-m,m,-1,1],[m,H-m,1,-1],[W-m,H-m,-1,-1]].forEach(([x,y,dx,dy]) => {
            ctx.beginPath();
            ctx.moveTo(x, y + dy * cs); ctx.lineTo(x, y); ctx.lineTo(x + dx * cs, y);
            ctx.stroke();
        });

        let y = 100;

        ctx.textAlign = "center";
        ctx.font = "64px serif";
        ctx.fillStyle = "#fff";
        ctx.fillText("🌀", W / 2, y); y += 60;

        ctx.font = "bold 48px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText("CERTYFIKAT", W / 2, y); y += 45;

        ctx.font = "bold 30px Arial";
        const tg = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
        tg.addColorStop(0, "#00d4ff"); tg.addColorStop(1, "#7b2fff");
        ctx.fillStyle = tg;
        ctx.fillText("SKOKU KWANTOWEGO", W / 2, y); y += 25;

        ctx.font = "14px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillText("QUANTUM TELEPORTATION CERTIFICATE", W / 2, y); y += 30;

        this.drawLine(ctx, W, y); y += 25;

        // Selfie
        if (selfieImg) {
            const pw = 440, ph = 330;
            const px = (W - pw) / 2;
            ctx.strokeStyle = "rgba(0,212,255,0.4)";
            ctx.lineWidth = 2;
            ctx.strokeRect(px - 3, y - 3, pw + 6, ph + 6);

            const sa = selfieImg.width / selfieImg.height;
            const da = pw / ph;
            let sx=0,sy=0,sw=selfieImg.width,sh=selfieImg.height;
            if (sa > da) { sw = selfieImg.height*da; sx=(selfieImg.width-sw)/2; }
            else { sh = selfieImg.width/da; sy=(selfieImg.height-sh)/2; }
            ctx.drawImage(selfieImg, sx,sy,sw,sh, px,y,pw,ph);

            y += ph + 15;
            ctx.font = "11px monospace";
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.textAlign = "center";
            ctx.fillText("MOMENT PRZEKROCZENIA PORTALU", W/2, y);
            y += 25;
        }

        this.drawLine(ctx, W, y); y += 30;

        // Dane
        ctx.textAlign = "left";
        const dx = m + 50;
        const field = (label, value) => {
            ctx.font = "bold 11px monospace";
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.fillText(label, dx, y); y += 22;
            ctx.font = "bold 20px monospace";
            ctx.fillStyle = "#00d4ff";
            ctx.fillText(value, dx, y); y += 35;
        };

        field("JUMP ID", this.jumpId);
        field("DATA I CZAS", now.toLocaleString("pl-PL"));
        field("DYSTANS", `${this.distanceWalked.toFixed(1)}m (${this.stepCount} kroków)`);
        if (this.gpsPosition) {
            field("GPS", `${this.gpsPosition.lat.toFixed(6)}°N  ${this.gpsPosition.lng.toFixed(6)}°E`);
        }
        field("STATUS", "✅ TELEPORTACJA ZAKOŃCZONA SUKCESEM");

        // Stopka
        y = H - 100;
        this.drawLine(ctx, W, y); y += 25;
        ctx.textAlign = "center";
        ctx.font = "10px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillText("Quantum Teleport Interface v2.2", W/2, y); y += 16;
        ctx.fillText(`Sygnatura: ${this.jumpId}-${Date.now().toString(36).toUpperCase()}`, W/2, y);
    }

    drawLine(ctx, W, y) {
        const g = ctx.createLinearGradient(W*0.1, 0, W*0.9, 0);
        g.addColorStop(0, "rgba(0,212,255,0)");
        g.addColorStop(0.5, "rgba(0,212,255,0.3)");
        g.addColorStop(1, "rgba(0,212,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W*0.1, y);
        ctx.lineTo(W*0.9, y);
        ctx.stroke();
    }

    setupCertButtons(canvas) {
        document.getElementById("btn-download").addEventListener("click", () => {
            const link = document.createElement("a");
            link.download = `quantum-teleport-${this.jumpId}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        });

        document.getElementById("btn-again").addEventListener("click", () => {
            location.reload();
        });
    }

    // ═════════════════════════
    //  UTILITY
    // ═════════════════════════
    switchScreen(id) {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        document.getElementById(id).classList.add("active");
    }
}

// START
const teleporter = new QuantumTeleporter();
