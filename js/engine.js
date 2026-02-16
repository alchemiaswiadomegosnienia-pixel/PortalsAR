/**
 * ═══════════════════════════════════════
 *  QUANTUM TELEPORT ENGINE
 *
 *  Prosty flow:
 *  - Tylna kamera jako <video>
 *  - Portal rysowany na <canvas> nałożonym na wideo
 *  - Pozycja portalu śledzona przez gyro/accelerometer
 *  - Zbliżanie = naturalny wzrost w perspektywie
 *  - Selfie = przednia kamera
 *  - Certyfikat = canvas → PNG
 * ═══════════════════════════════════════
 */

class QuantumTeleporter {
    constructor() {
        // Portal state
        this.portalPlaced = false;
        this.portalX = 0;          // pozycja na ekranie (0-1)
        this.portalY = 0.4;
        this.portalDepth = 10;     // "głębokość" w metrach (symulowana)
        this.portalAngle = 0;      // obrót
        this.portalPulse = 0;

        // Ruch
        this.stepCount = 0;
        this.lastAccel = 0;
        this.distanceWalked = 0;   // metry (szacowane z krokomierza)
        this.TRIGGER_DISTANCE = 8; // po ilu metrach chodzenia = teleportacja

        // Gyro — do przesuwania portalu na ekranie
        this.gyroAlpha = 0;
        this.gyroBeta = 0;
        this.gyroGamma = 0;
        this.gyroBaseAlpha = null;
        this.gyroBaseBeta = null;
        this.gyroBaseGamma = null;

        // GPS (tylko do certyfikatu)
        this.gpsPosition = null;

        // Selfie
        this.selfieDataURL = null;

        // IDs
        this.jumpId = this.makeId();
        this.animFrame = null;

        this.init();
    }

    makeId() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let id = "QT-";
        for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random()*chars.length)];
        return id;
    }

    // ═════════════════════════
    //  INIT (Faza 0)
    // ═════════════════════════
    init() {
        // GPS (tło, nie blokuje)
        this.grabGPS();

        // Sprawdź sensory
        this.checkSensors().then(ok => {
            document.getElementById("status-val").textContent = ok
                ? "✅ GOTOWY" : "⚠️ OGRANICZONY (brak żyroskopu)";
            document.getElementById("status-val").style.color = ok ? "#0f8" : "#fa0";

            const btn = document.getElementById("btn-start");
            btn.disabled = false;
            btn.addEventListener("click", () => this.startAR());
        });
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

    async checkSensors() {
        // iOS wymaga permission
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const resp = await DeviceOrientationEvent.requestPermission();
                return resp === 'granted';
            } catch { return false; }
        }
        return !!window.DeviceOrientationEvent;
    }

    // ═════════════════════════
    //  FAZA 1: AR
    // ═════════════════════════
    async startAR() {
        // Uruchom tylną kamerę
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
        } catch(e) {
            alert("Brak dostępu do kamery: " + e.message);
            return;
        }

        // Przełącz ekrany
        this.switchScreen("screen-ar");

        // Przygotuj canvas
        const canvas = document.getElementById("ar-canvas");
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

        // Start sensory
        this.startGyro();
        this.startStepDetector();

        // Render loop
        this.renderLoop();
    }

    placePortal(e) {
        const rect = e.target.getBoundingClientRect();
        this.portalX = (e.clientX - rect.left) / rect.width;
        this.portalY = (e.clientY - rect.top) / rect.height;
        this.portalPlaced = true;
        this.distanceWalked = 0;

        // Zapamiętaj bazowe wartości gyro
        this.gyroBaseAlpha = this.gyroAlpha;
        this.gyroBaseBeta = this.gyroBeta;
        this.gyroBaseGamma = this.gyroBaseGamma;

        // Pokaż approach bar
        document.getElementById("approach-bar-wrap").style.display = "block";
        document.getElementById("hud-status").textContent = "IDŹ KU PORTALOWI";

        // Wibracja
        if (navigator.vibrate) navigator.vibrate(50);
    }

    // ── Żyroskop ──
    startGyro() {
        window.addEventListener("deviceorientation", (e) => {
            this.gyroAlpha = e.alpha || 0;  // kompas 0-360
            this.gyroBeta = e.beta || 0;    // przechył przód-tył -180..180
            this.gyroGamma = e.gamma || 0;  // przechył lewo-prawo -90..90
        }, true);
    }

    // ── Krokomierz (z akcelerometru) ──
    startStepDetector() {
        // Próbuj native step counter
        if ('Accelerometer' in window) {
            try {
                const acc = new Accelerometer({ frequency: 30 });
                acc.addEventListener("reading", () => {
                    this.processAccel(acc.x, acc.y, acc.z);
                });
                acc.start();
                return;
            } catch(e) { /* fallback */ }
        }

        // Fallback: devicemotion
        window.addEventListener("devicemotion", (e) => {
            const a = e.accelerationIncludingGravity;
            if (a) this.processAccel(a.x, a.y, a.z);
        });
    }

    processAccel(x, y, z) {
        const magnitude = Math.sqrt(x*x + y*y + z*z);
        const delta = Math.abs(magnitude - this.lastAccel);

        // Detekcja kroku — prosty threshold
        if (delta > 3 && delta < 20) {
            const now = Date.now();
            if (!this._lastStep || now - this._lastStep > 350) {
                this._lastStep = now;
                this.stepCount++;
                // Średni krok ≈ 0.7m
                this.distanceWalked = this.stepCount * 0.7;
            }
        }
        this.lastAccel = magnitude;
    }

    // ═════════════════════════
    //  RENDER LOOP
    // ═════════════════════════
    renderLoop() {
        this.animFrame = requestAnimationFrame(() => this.renderLoop());

        const ctx = this.ctx;
        const W = this.canvasW;
        const H = this.canvasH;

        // Czyść canvas (przezroczysty — wideo prześwieca)
        ctx.clearRect(0, 0, W, H);

        if (!this.portalPlaced) {
            // Rysuj wskazówkę
            this.drawHint(ctx, W, H);
            return;
        }

        // Oblicz pozycję portalu z uwzględnieniem gyro
        let px = this.portalX;
        let py = this.portalY;

        if (this.gyroBaseAlpha !== null) {
            // Przesuń portal bazując na obrocie telefonu
            const dGamma = this.gyroGamma - (this.gyroBaseGamma || 0);
            const dBeta = this.gyroBeta - (this.gyroBaseBeta || 0);

            // gamma = lewo-prawo, beta = góra-dół
            px += (dGamma / 90) * 0.5;
            py += (dBeta / 90) * 0.3;
        }

        // Clamp
        px = Math.max(0.1, Math.min(0.9, px));
        py = Math.max(0.1, Math.min(0.9, py));

        // Rozmiar portalu — rośnie z przebytą odległością
        // Na starcie: mały. Po TRIGGER_DISTANCE: cały ekran
        const progress = Math.min(1, this.distanceWalked / this.TRIGGER_DISTANCE);
        const minRadius = Math.min(W, H) * 0.08;
        const maxRadius = Math.min(W, H) * 0.45;
        const radius = minRadius + (maxRadius - minRadius) * this.easeInOut(progress);

        // Pulsacja
        this.portalAngle += 0.02;
        this.portalPulse += 0.05;
        const pulse = 1 + Math.sin(this.portalPulse) * 0.03 * (1 + progress);

        const screenX = px * W;
        const screenY = py * H;
        const r = radius * pulse;

        // ── Rysuj portal ──
        this.drawPortal(ctx, screenX, screenY, r, progress);

        // ── Aktualizuj HUD ──
        this.updateHUD(progress);

        // ── Sprawdź trigger ──
        if (progress >= 1) {
            this.triggerTeleport();
        }
    }

    easeInOut(t) {
        return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    }

    drawHint(ctx, W, H) {
        ctx.fillStyle = "rgba(0,212,255,0.15)";
        ctx.font = `${16 * devicePixelRatio}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("TAPNIJ aby postawić portal", W/2, H*0.85);
    }

    drawPortal(ctx, cx, cy, r, progress) {
        const time = Date.now() / 1000;

        // ── Zewnętrzna poświata ──
        const glowGrad = ctx.createRadialGradient(cx, cy, r*0.8, cx, cy, r*1.4);
        glowGrad.addColorStop(0, `rgba(0,212,255,${0.05 + progress * 0.1})`);
        glowGrad.addColorStop(1, "rgba(0,212,255,0)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r*1.4, 0, Math.PI*2);
        ctx.fill();

        // ── Wypełnienie portalu (ciemny środek = "dziura") ──
        const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r*0.75);
        innerGrad.addColorStop(0, `rgba(5,5,20,${0.7 + progress*0.25})`);
        innerGrad.addColorStop(0.7, `rgba(10,10,50,${0.5 + progress*0.2})`);
        innerGrad.addColorStop(1, "rgba(0,212,255,0.1)");
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r*0.75, 0, Math.PI*2);
        ctx.fill();

        // ── Zewnętrzny ring 1 ──
        ctx.strokeStyle = `rgba(0,212,255,${0.6 + Math.sin(time*2)*0.2})`;
        ctx.lineWidth = 3 * devicePixelRatio;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.stroke();

        // ── Zewnętrzny ring 2 (obrócony) ──
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.portalAngle);
        ctx.strokeStyle = `rgba(123,47,255,${0.5 + Math.sin(time*3)*0.2})`;
        ctx.lineWidth = 2 * devicePixelRatio;
        ctx.beginPath();
        ctx.ellipse(0, 0, r*0.9, r*0.85, 0, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();

        // ── Ring 3 (odwrotny obrót) ──
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-this.portalAngle * 0.7);
        ctx.strokeStyle = `rgba(255,45,85,${0.3 + progress*0.3})`;
        ctx.lineWidth = 1.5 * devicePixelRatio;
        ctx.setLineDash([10, 15]);
        ctx.beginPath();
        ctx.ellipse(0, 0, r*0.6, r*0.55, 0, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // ── Cząsteczki orbitujące ──
        const numParticles = 10 + Math.floor(progress * 10);
        for (let i = 0; i < numParticles; i++) {
            const angle = (i / numParticles) * Math.PI * 2 + time * (1 + i*0.1);
            const dist = r * (0.8 + Math.sin(time*2 + i) * 0.15);
            const px = cx + Math.cos(angle) * dist;
            const py = cy + Math.sin(angle) * dist;
            const size = (1.5 + Math.sin(time*3 + i*2) * 1) * devicePixelRatio;

            ctx.fillStyle = i % 3 === 0 ? "#00d4ff" :
                           i % 3 === 1 ? "#7b2fff" : "#ff2d55";
            ctx.globalAlpha = 0.4 + Math.sin(time*4 + i) * 0.3;
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // ── Label ──
        const fontSize = Math.max(12, r * 0.12);
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,212,255,0.7)";
        ctx.fillText("QUANTUM PORTAL", cx, cy - r - 12*devicePixelRatio);

        // ── Dystans pod portalem ──
        const dist = Math.max(0, this.TRIGGER_DISTANCE - this.distanceWalked);
        ctx.font = `${fontSize * 0.8}px monospace`;
        ctx.fillStyle = dist < 2 ? "#0f8" : "#fff";
        ctx.fillText(`${dist.toFixed(1)}m`, cx, cy + r + 20*devicePixelRatio);

        // ── Efekt bliskości: ekran wibruje ──
        if (progress > 0.7) {
            const shake = (progress - 0.7) * 10;
            ctx.fillStyle = `rgba(0,212,255,${(progress-0.7)*0.15})`;
            ctx.fillRect(0, 0, this.canvasW, this.canvasH);
        }
    }

    updateHUD(progress) {
        const dist = Math.max(0, this.TRIGGER_DISTANCE - this.distanceWalked);
        document.getElementById("hud-dist").textContent = `${dist.toFixed(1)} m`;

        const fill = document.getElementById("approach-fill");
        fill.style.width = (progress * 100) + "%";

        // Kolor progress bara
        if (progress > 0.8) {
            fill.style.background = "linear-gradient(90deg, #0f8, #0ff)";
        }

        const txt = document.getElementById("approach-text");
        if (progress < 0.3) {
            txt.textContent = "Idź ku portalowi...";
        } else if (progress < 0.7) {
            txt.textContent = "⚡ Portal reaguje na Twoją obecność";
        } else if (progress < 0.95) {
            txt.textContent = "⚡⚡ PRAWIE NA MIEJSCU ⚡⚡";
            txt.style.color = "#0f8";
        } else {
            txt.textContent = "🌀 PRZEKRACZASZ PORTAL...";
            txt.style.color = "#0ff";
        }

        const status = document.getElementById("hud-status");
        if (progress < 0.5) status.textContent = "NAWIGACJA";
        else if (progress < 0.85) status.textContent = "ZBLIŻANIE";
        else status.textContent = "⚡ PRZEKROCZENIE";
    }

    // ═════════════════════════
    //  FAZA 2: TELEPORTACJA
    // ═════════════════════════
    triggerTeleport() {
        // Zatrzymaj render loop
        cancelAnimationFrame(this.animFrame);

        // Zatrzymaj tylną kamerę
        if (this.backStream) {
            this.backStream.getTracks().forEach(t => t.stop());
        }

        // Wibracja
        if (navigator.vibrate) navigator.vibrate([100,50,100,50,200]);

        // Flash
        this.switchScreen("screen-flash");

        // Po 2.5s → selfie
        setTimeout(() => this.startSelfie(), 2500);
    }

    // ═════════════════════════
    //  FAZA 3: SELFIE
    // ═════════════════════════
    async startSelfie() {
        this.switchScreen("screen-selfie");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            const video = document.getElementById("front-camera");
            video.srcObject = stream;
            await video.play();
            this.frontStream = stream;

            document.getElementById("btn-capture")
                .addEventListener("click", () => this.captureSelfie());
            document.getElementById("btn-skip-selfie")
                .addEventListener("click", () => this.generateCertificate(null));

        } catch(e) {
            // Brak przedniej kamery — skip
            this.generateCertificate(null);
        }
    }

    captureSelfie() {
        const video = document.getElementById("front-camera");
        const canvas = document.getElementById("selfie-canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        // Lustro
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        ctx.setTransform(1,0,0,1,0,0);

        // Overlay portalu na selfie
        this.drawSelfieOverlay(ctx, canvas.width, canvas.height);

        // Stop kamerę
        if (this.frontStream) this.frontStream.getTracks().forEach(t => t.stop());

        this.selfieDataURL = canvas.toDataURL("image/jpeg", 0.92);
        this.generateCertificate(this.selfieDataURL);
    }

    drawSelfieOverlay(ctx, w, h) {
        // Efekt portalu na krawędziach
        const g = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.2, w/2, h/2, Math.min(w,h)*0.55);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.6, "rgba(0,212,255,0.05)");
        g.addColorStop(1, "rgba(123,47,255,0.3)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // Cienki ring
        ctx.strokeStyle = "rgba(0,212,255,0.5)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(w/2, h/2, Math.min(w,h)*0.38, 0, Math.PI*2);
        ctx.stroke();
    }

    // ═════════════════════════
    //  FAZA 4: CERTYFIKAT
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

        // ── Tło ──
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, "#050510");
        bg.addColorStop(0.5, "#0a0a2e");
        bg.addColorStop(1, "#0d0520");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // ── Siatka dekoracyjna ──
        ctx.strokeStyle = "rgba(0,212,255,0.04)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 30; i++) {
            ctx.beginPath(); ctx.moveTo(0, i*(H/30)); ctx.lineTo(W, i*(H/30)); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i*(W/20), 0); ctx.lineTo(i*(W/20), H); ctx.stroke();
        }

        // ── Ramka ──
        const m = 40;
        ctx.strokeStyle = "rgba(0,212,255,0.2)";
        ctx.lineWidth = 1;
        ctx.strokeRect(m, m, W-m*2, H-m*2);

        // Narożniki
        ctx.strokeStyle = "#00d4ff";
        ctx.lineWidth = 3;
        const cs = 35;
        [[m,m,1,1],[W-m,m,-1,1],[m,H-m,1,-1],[W-m,H-m,-1,-1]].forEach(([x,y,dx,dy]) => {
            ctx.beginPath();
            ctx.moveTo(x, y + dy*cs);
            ctx.lineTo(x, y);
            ctx.lineTo(x + dx*cs, y);
            ctx.stroke();
        });

        let y = 100;

        // ── Emoji ──
        ctx.textAlign = "center";
        ctx.font = "64px serif";
        ctx.fillText("🌀", W/2, y);
        y += 60;

        // ── CERTYFIKAT ──
        ctx.font = "bold 48px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText("CERTYFIKAT", W/2, y);
        y += 45;

        // ── SKOKU KWANTOWEGO ──
        ctx.font = "bold 30px Arial";
        const tg = ctx.createLinearGradient(W*0.2, 0, W*0.8, 0);
        tg.addColorStop(0, "#00d4ff");
        tg.addColorStop(1, "#7b2fff");
        ctx.fillStyle = tg;
        ctx.fillText("SKOKU KWANTOWEGO", W/2, y);
        y += 25;

        ctx.font = "14px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillText("QUANTUM TELEPORTATION CERTIFICATE", W/2, y);
        y += 30;

        // Linia
        this.drawLine(ctx, W, y);
        y += 25;

        // ── Selfie ──
        if (selfieImg) {
            const photoW = 440;
            const photoH = 330;
            const photoX = (W - photoW) / 2;

            ctx.strokeStyle = "rgba(0,212,255,0.4)";
            ctx.lineWidth = 2;
            ctx.strokeRect(photoX-3, y-3, photoW+6, photoH+6);

            // Wykadruj
            const srcAspect = selfieImg.width / selfieImg.height;
            const dstAspect = photoW / photoH;
            let sx=0, sy=0, sw=selfieImg.width, sh=selfieImg.height;
            if (srcAspect > dstAspect) {
                sw = selfieImg.height * dstAspect;
                sx = (selfieImg.width - sw) / 2;
            } else {
                sh = selfieImg.width / dstAspect;
                sy = (selfieImg.height - sh) / 2;
            }
            ctx.drawImage(selfieImg, sx, sy, sw, sh, photoX, y, photoW, photoH);

            y += photoH + 15;
            ctx.font = "11px monospace";
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillText("MOMENT PRZEKROCZENIA PORTALU", W/2, y);
            y += 25;
        }

        this.drawLine(ctx, W, y);
        y += 30;

        // ── Dane ──
        ctx.textAlign = "left";
        const dx = m + 50;

        const field = (label, value) => {
            ctx.font = "bold 11px monospace";
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.fillText(label, dx, y);
            y += 22;
            ctx.font = "bold 20px monospace";
            ctx.fillStyle = "#00d4ff";
            ctx.fillText(value, dx, y);
            y += 35;
        };

        field("JUMP ID", this.jumpId);
        field("DATA I CZAS", now.toLocaleString("pl-PL"));
        field("DYSTANS SKOKU", `${this.distanceWalked.toFixed(1)} m (${this.stepCount} kroków)`);

        if (this.gpsPosition) {
            field("WSPÓŁRZĘDNE GPS",
                `${this.gpsPosition.lat.toFixed(6)}°N  ${this.gpsPosition.lng.toFixed(6)}°E`);
        }

        field("STATUS", "✅ TELEPORTACJA ZAKOŃCZONA SUKCESEM");

        // ── Stopka ──
        y = H - 120;
        this.drawLine(ctx, W, y);
        y += 25;

        ctx.textAlign = "center";
        ctx.font = "10px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillText("Wygenerowano przez Quantum Teleport Interface v2.1", W/2, y);
        y += 18;
        ctx.fillText(`Sygnatura: ${this.jumpId}-${Date.now().toString(36).toUpperCase()}`, W/2, y);
        y += 18;
        ctx.fillText("Ten certyfikat potwierdza skuteczne dokonanie skoku kwantowego.", W/2, y);
    }

    drawLine(ctx, W, y) {
        const lg = ctx.createLinearGradient(W*0.1, 0, W*0.9, 0);
        lg.addColorStop(0, "rgba(0,212,255,0)");
        lg.addColorStop(0.5, "rgba(0,212,255,0.3)");
        lg.addColorStop(1, "rgba(0,212,255,0)");
        ctx.strokeStyle = lg;
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

        // Share API
        const shareBtn = document.getElementById("btn-share");
        if (shareBtn) {
            if (navigator.share && navigator.canShare) {
                shareBtn.style.display = "block";
                shareBtn.addEventListener("click", async () => {
                    canvas.toBlob(async (blob) => {
                        const file = new File([blob],
                            `quantum-teleport-${this.jumpId}.png`,
                            { type: "image/png" }
                        );
                        try {
                            await navigator.share({
                                title: "Certyfikat Skoku Kwantowego",
                                text: `Właśnie dokonałem skoku kwantowego! ID: ${this.jumpId}`,
                                files: [file]
                            });
                        } catch(e) { /* user cancelled */ }
                    });
                });
            }
        }
    }

    // ═════════════════════════
    //  UTILITY
    // ═════════════════════════
    switchScreen(id) {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        document.getElementById(id).classList.add("active");
    }
}

// ═══ START ═══
const teleporter = new QuantumTeleporter();
