/**
 * =============================================
 *  AR PORTAL ENGINE v2
 *  - Tryb DEMO (portale blisko Ciebie)
 *  - Tryb LIVE (prawdziwe lokalizacje)
 *  - localStorage sync z admin.html
 * =============================================
 */

class ARPortalEngine {
    constructor() {
        this.activePortals = new Map();
        this.userPosition = null;
        this.watchId = null;
        this.isRunning = false;
        this.mode = "demo"; // "demo" lub "live"
        this.demoPortals = [];
        this.deviceHeading = 0;

        this.init();
    }

    // ══════════════════════════════════
    //  INIT
    // ══════════════════════════════════
    init() {
        this.updateLoadingStatus("Pobieram lokalizację...");

        // Najpierw pobierz GPS, potem pokaż menu
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    this.userPosition = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        altitude: pos.coords.altitude
                    };
                    console.log("📍 GPS ok:", this.userPosition);
                    this.showModeSelect();
                },
                (err) => {
                    console.warn("GPS error:", err);
                    this.updateLoadingStatus("⚠️ Brak GPS — używam trybu demo");
                    // Domyślna pozycja
                    this.userPosition = { lat: 52.2297, lng: 21.0122, accuracy: 999 };
                    this.showModeSelect();
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            this.userPosition = { lat: 52.2297, lng: 21.0122, accuracy: 999 };
            this.showModeSelect();
        }
    }

    showModeSelect() {
        document.querySelector(".spinner").style.display = "none";
        this.updateLoadingStatus("");
        document.getElementById("mode-select").style.display = "block";

        document.getElementById("btn-demo").addEventListener("click", () => {
            this.mode = "demo";
            this.start();
        });

        document.getElementById("btn-live").addEventListener("click", () => {
            this.mode = "live";
            this.start();
        });
    }

    // ══════════════════════════════════
    //  START
    // ══════════════════════════════════
    async start() {
        document.getElementById("mode-select").style.display = "none";
        document.querySelector(".spinner").style.display = "block";
        this.updateLoadingStatus("Uruchamiam kamerę AR...");

        try {
            // Sprawdź kamerę
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
            stream.getTracks().forEach(t => t.stop());
        } catch (err) {
            this.updateLoadingStatus("❌ Brak dostępu do kamery: " + err.message);
            return;
        }

        // W trybie DEMO wygeneruj portale blisko użytkownika
        if (this.mode === "demo") {
            this.generateDemoPortals();
        }

        // Uruchom ciągły GPS
        this.startGPSWatch();

        // Uruchom kompas
        this.startCompass();

        // Pokaż scenę AR
        const scene = document.getElementById("ar-scene");
        scene.style.display = "block";

        if (scene.hasLoaded) {
            this.onSceneReady();
        } else {
            scene.addEventListener("loaded", () => this.onSceneReady());
        }
    }

    // ══════════════════════════════════
    //  DEMO — generuj portale blisko
    // ══════════════════════════════════
    generateDemoPortals() {
        if (!this.userPosition) return;

        const lat = this.userPosition.lat;
        const lng = this.userPosition.lng;

        // 1 stopień ≈ 111km
        // 0.0001° ≈ 11m
        // Generujemy portale 10-40m od użytkownika

        this.demoPortals = [
            {
                id: "demo-north",
                name: "🔵 Portal Północny",
                description: "10m na północ",
                latitude: lat + 0.00010,   // ~11m na północ
                longitude: lng,
                model: null,
                placeholder: { type: "ring", color: "#00d4ff", emissive: "#003366", width: 3, height: 4, opacity: 0.9 },
                scale: { x: 4, y: 4, z: 4 },
                animation: { property: "rotation", to: "0 360 0", loop: true, duration: 15000, easing: "linear" },
                schedule: { startTime: "00:00", endTime: "23:59", days: ["mon","tue","wed","thu","fri","sat","sun"] },
                visibilityRadius: 500,
                particles: true
            },
            {
                id: "demo-east",
                name: "🟣 Portal Wschodni",
                description: "20m na wschód",
                latitude: lat,
                longitude: lng + 0.00025,  // ~18m na wschód
                model: null,
                placeholder: { type: "torus", color: "#7b2fff", emissive: "#1a0040", width: 3, height: 3, opacity: 0.9 },
                scale: { x: 5, y: 5, z: 5 },
                animation: { property: "rotation", to: "360 360 0", loop: true, duration: 12000, easing: "linear" },
                schedule: { startTime: "00:00", endTime: "23:59", days: ["mon","tue","wed","thu","fri","sat","sun"] },
                visibilityRadius: 500,
                particles: true
            },
            {
                id: "demo-south",
                name: "🔴 Portal Południowy",
                description: "15m na południe",
                latitude: lat - 0.00013,   // ~15m na południe
                longitude: lng + 0.00005,
                model: null,
                placeholder: { type: "ring", color: "#ff2d55", emissive: "#440011", width: 3.5, height: 5, opacity: 0.9 },
                scale: { x: 5, y: 5, z: 5 },
                animation: { property: "rotation", to: "0 -360 0", loop: true, duration: 18000, easing: "linear" },
                schedule: { startTime: "00:00", endTime: "23:59", days: ["mon","tue","wed","thu","fri","sat","sun"] },
                visibilityRadius: 500,
                particles: true
            },
            {
                id: "demo-west",
                name: "🟢 Portal Zachodni",
                description: "25m na zachód",
                latitude: lat + 0.00005,
                longitude: lng - 0.00030,  // ~22m na zachód
                model: null,
                placeholder: { type: "torus", color: "#00ff88", emissive: "#003311", width: 2.5, height: 2.5, opacity: 0.9 },
                scale: { x: 4, y: 4, z: 4 },
                animation: { property: "rotation", to: "0 360 360", loop: true, duration: 10000, easing: "linear" },
                schedule: { startTime: "00:00", endTime: "23:59", days: ["mon","tue","wed","thu","fri","sat","sun"] },
                visibilityRadius: 500,
                particles: true
            }
        ];

        console.log("🎮 Wygenerowano demo portale:", this.demoPortals);
    }

    // ══════════════════════════════════
    //  SCENA GOTOWA
    // ══════════════════════════════════
    onSceneReady() {
        this.isRunning = true;

        // Ukryj loading
        document.getElementById("loading-screen").classList.add("hidden");
        document.getElementById("hud").style.display = "block";

        // Badge trybu
        document.getElementById("mode-badge").textContent =
            this.mode === "demo" ? "🎮 DEMO" : "🌍 LIVE";

        // Załaduj portale
        this.refreshPortals();

        // Pokaż finder
        document.getElementById("portal-finder").style.display = "block";

        // Interwały
        setInterval(() => this.refreshPortals(), APP_CONFIG.scheduleCheckInterval);
        setInterval(() => this.updateHUD(), 1000);
        setInterval(() => this.updateDebugInfo(), 2000);
        setInterval(() => this.updateFinder(), 500);

        // Przyciski
        this.setupButtons();

        // Reloaduj portale z localStorage co 5s (gdyby admin je zmienił)
        setInterval(() => this.reloadFromStorage(), 5000);

        const count = this.getActiveConfig().length;
        this.showToast(`🌀 ${count} portali załadowanych!\nRozglądaj się dookoła 📱`);
    }

    // ══════════════════════════════════
    //  KONFIGURACJA — demo vs live
    // ══════════════════════════════════
    getActiveConfig() {
        if (this.mode === "demo") {
            return this.demoPortals;
        } else {
            // Live — przeładuj z localStorage
            return loadPortalsConfig();
        }
    }

    reloadFromStorage() {
        if (this.mode !== "live") return;
        PORTALS_CONFIG = loadPortalsConfig();
    }

    // ══════════════════════════════════
    //  GPS
    // ══════════════════════════════════
    startGPSWatch() {
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => {
                this.userPosition = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    altitude: pos.coords.altitude
                };
            },
            (err) => console.warn("GPS watch error:", err),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }

    // ══════════════════════════════════
    //  KOMPAS
    // ══════════════════════════════════
    startCompass() {
        const handler = (e) => {
            if (e.alpha !== null) {
                // alpha = 0-360, 0 = North
                this.deviceHeading = e.alpha;
            }
        };

        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS 13+ wymaga permission
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        window.addEventListener('deviceorientation', handler, true);
                    }
                }).catch(console.error);
        } else {
            window.addEventListener('deviceorientation', handler, true);
        }
    }

    // ══════════════════════════════════
    //  BEARING — kąt do portalu
    // ══════════════════════════════════
    getBearing(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
        let brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    }

    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 +
                  Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
                  Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // ══════════════════════════════════
    //  FINDER — wskaźnik kierunku
    // ══════════════════════════════════
    updateFinder() {
        if (!this.userPosition) return;

        const config = this.getActiveConfig();
        if (config.length === 0) return;

        // Znajdź najbliższy portal
        let closest = null;
        let closestDist = Infinity;

        config.forEach(p => {
            const dist = this.getDistance(
                this.userPosition.lat, this.userPosition.lng,
                p.latitude, p.longitude
            );
            if (dist < closestDist) {
                closestDist = dist;
                closest = p;
            }
        });

        if (!closest) return;

        const bearing = this.getBearing(
            this.userPosition.lat, this.userPosition.lng,
            closest.latitude, closest.longitude
        );

        // Kąt strzałki = bearing - heading urządzenia
        // (heading: 0 = north, bearing: 0 = north)
        const arrowAngle = bearing - (360 - this.deviceHeading);

        const arrow = document.getElementById("finder-arrow");
        arrow.style.setProperty('--arrow-angle', `${arrowAngle}deg`);
        arrow.style.transform = `rotate(${arrowAngle}deg)`;

        document.getElementById("finder-name").textContent = closest.name;
        document.getElementById("finder-distance").textContent =
            closestDist < 1000
                ? `${Math.round(closestDist)}m`
                : `${(closestDist/1000).toFixed(1)}km`;
    }

    // ══════════════════════════════════
    //  HARMONOGRAM
    // ══════════════════════════════════
    isPortalActive(portal) {
        const now = new Date();
        const schedule = portal.schedule;
        const dayNames = ["sun","mon","tue","wed","thu","fri","sat"];
        const today = dayNames[now.getDay()];

        if (!schedule.days.includes(today)) return false;

        const currentMin = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = schedule.startTime.split(":").map(Number);
        const [eh, em] = schedule.endTime.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;

        if (startMin <= endMin) {
            return currentMin >= startMin && currentMin <= endMin;
        } else {
            return currentMin >= startMin || currentMin <= endMin;
        }
    }

    // ══════════════════════════════════
    //  SPAWN / DESPAWN
    // ══════════════════════════════════
    refreshPortals() {
        const config = this.getActiveConfig();
        let activeCount = 0;

        config.forEach(portal => {
            const shouldShow = this.isPortalActive(portal);
            const isSpawned = this.activePortals.has(portal.id);

            if (shouldShow && !isSpawned) {
                this.spawnPortal(portal);
                activeCount++;
            } else if (!shouldShow && isSpawned) {
                this.despawnPortal(portal.id);
            } else if (shouldShow) {
                activeCount++;
            }
        });

        document.getElementById("portal-count").textContent = `🌀 ${activeCount}`;
    }

    spawnPortal(portal) {
        const scene = document.querySelector("a-scene");
        const entity = document.createElement("a-entity");

        entity.setAttribute("id", portal.id);
        entity.setAttribute("gps-entity-place",
            `latitude: ${portal.latitude}; longitude: ${portal.longitude};`
        );

        if (portal.model) {
            entity.setAttribute("gltf-model", portal.model);
        } else {
            this.buildPlaceholder(entity, portal);
        }

        const s = portal.scale || { x: 5, y: 5, z: 5 };
        entity.setAttribute("scale", `${s.x} ${s.y} ${s.z}`);

        if (portal.animation) {
            entity.setAttribute("animation", portal.animation);
        }

        scene.appendChild(entity);
        this.activePortals.set(portal.id, entity);
        console.log(`✅ Spawned: ${portal.name}`);
    }

    buildPlaceholder(entity, portal) {
        const p = portal.placeholder || {
            type: "ring", color: "#00d4ff",
            emissive: "#003366", width: 3, height: 4, opacity: 0.9
        };

        // Główny kształt
        if (p.type === "ring") {
            const outer = document.createElement("a-ring");
            outer.setAttribute("radius-inner", p.width / 2 - 0.3);
            outer.setAttribute("radius-outer", p.width / 2);
            outer.setAttribute("color", p.color);
            outer.setAttribute("opacity", String(p.opacity));
            outer.setAttribute("side", "double");
            outer.setAttribute("segments-theta", "64");
            entity.appendChild(outer);

            // Glow wewnątrz
            const inner = document.createElement("a-ring");
            inner.setAttribute("radius-inner", "0");
            inner.setAttribute("radius-outer", String(p.width / 2 - 0.3));
            inner.setAttribute("color", p.emissive || "#001133");
            inner.setAttribute("opacity", "0.25");
            inner.setAttribute("side", "double");
            entity.appendChild(inner);

        } else if (p.type === "torus") {
            const torus = document.createElement("a-torus");
            torus.setAttribute("radius", String(p.width / 2));
            torus.setAttribute("radius-tubular", "0.2");
            torus.setAttribute("color", p.color);
            torus.setAttribute("opacity", String(p.opacity));
            torus.setAttribute("segments-tubular", "48");
            entity.appendChild(torus);
        }

        // Label
        const label = document.createElement("a-text");
        label.setAttribute("value", portal.name);
        label.setAttribute("align", "center");
        label.setAttribute("color", p.color);
        label.setAttribute("width", "8");
        label.setAttribute("position", `0 ${(p.height || p.width) / 2 + 1} 0`);
        label.setAttribute("side", "double");
        label.setAttribute("look-at", "[gps-camera]");
        entity.appendChild(label);

        // Odległość
        if (this.userPosition) {
            const dist = this.getDistance(
                this.userPosition.lat, this.userPosition.lng,
                portal.latitude, portal.longitude
            );
            const distLabel = document.createElement("a-text");
            distLabel.setAttribute("value", `${Math.round(dist)}m`);
            distLabel.setAttribute("align", "center");
            distLabel.setAttribute("color", "#ffffff");
            distLabel.setAttribute("width", "5");
            distLabel.setAttribute("position", `0 ${(p.height || p.width) / 2 + 0.3} 0`);
            distLabel.setAttribute("side", "double");
            distLabel.setAttribute("look-at", "[gps-camera]");
            entity.appendChild(distLabel);
        }

        // Particles
        if (portal.particles) {
            for (let i = 0; i < 6; i++) {
                const dot = document.createElement("a-sphere");
                const angle = (i / 6) * Math.PI * 2;
                const r = p.width / 2 + 0.3;
                dot.setAttribute("radius", "0.08");
                dot.setAttribute("color", p.color);
                dot.setAttribute("opacity", "0.7");
                dot.setAttribute("position",
                    `${Math.cos(angle)*r} 0 ${Math.sin(angle)*r}`);
                dot.setAttribute("animation", {
                    property: "position",
                    to: `${Math.cos(angle)*r} ${0.8+Math.random()} ${Math.sin(angle)*r}`,
                    dir: "alternate", loop: true,
                    dur: 1500 + Math.random() * 1500,
                    easing: "easeInOutSine"
                });
                entity.appendChild(dot);
            }
        }
    }

    despawnPortal(id) {
        const entity = this.activePortals.get(id);
        if (entity) { entity.remove(); this.activePortals.delete(id); }
    }

    // ══════════════════════════════════
    //  POSTAW PORTAL TUTAJ
    // ══════════════════════════════════
    placePortalHere() {
        if (!this.userPosition) {
            this.showToast("❌ Brak GPS!");
            return;
        }

        const colors = ["#00d4ff","#7b2fff","#ff2d55","#00ff88","#ffaa00"];
        const shapes = ["ring","torus"];
        const randomColor = colors[Math.floor(Math.random()*colors.length)];
        const randomShape = shapes[Math.floor(Math.random()*shapes.length)];
        const id = "placed-" + Date.now();

        const newPortal = {
            id: id,
            name: "📌 Portal #" + (this.activePortals.size + 1),
            description: "Postawiony ręcznie",
            latitude: this.userPosition.lat,
            longitude: this.userPosition.lng,
            model: null,
            placeholder: {
                type: randomShape,
                color: randomColor,
                emissive: "#111111",
                width: 3,
                height: 4,
                opacity: 0.9
            },
            scale: { x: 4, y: 4, z: 4 },
            animation: {
                property: "rotation",
                to: "0 360 0",
                loop: true,
                duration: 15000,
                easing: "linear"
            },
            schedule: {
                startTime: "00:00",
                endTime: "23:59",
                days: ["mon","tue","wed","thu","fri","sat","sun"]
            },
            visibilityRadius: 500,
            particles: true
        };

        // Dodaj do aktywnej konfiguracji
        if (this.mode === "demo") {
            this.demoPortals.push(newPortal);
        }

        // Zapisz też do localStorage
        this.savePortalToStorage(newPortal);

        // Spawn
        this.spawnPortal(newPortal);

        this.showToast(`📌 Portal postawiony!\nLat: ${this.userPosition.lat.toFixed(5)}\nLng: ${this.userPosition.lng.toFixed(5)}`);
    }

    savePortalToStorage(portal) {
        try {
            const saved = localStorage.getItem("ar-portals-config");
            const list = saved ? JSON.parse(saved) : [];
            list.push(portal);
            localStorage.setItem("ar-portals-config", JSON.stringify(list));
            console.log("💾 Portal zapisany do localStorage");
        } catch(e) {
            console.warn("Błąd zapisu:", e);
        }
    }

    // ══════════════════════════════════
    //  PRZYCISKI
    // ══════════════════════════════════
    setupButtons() {
        document.getElementById("btn-place-here")
            .addEventListener("click", () => this.placePortalHere());

        document.getElementById("btn-refresh")
            .addEventListener("click", () => {
                // Despawn wszystkiego
                this.activePortals.forEach((_, id) => this.despawnPortal(id));
                // W demo przebuduj pozycje
                if (this.mode === "demo") this.generateDemoPortals();
                // Reload
                this.refreshPortals();
                this.showToast("🔃 Odświeżono!");
            });

        document.getElementById("btn-debug")
            .addEventListener("click", () => this.toggleDebug());

        document.getElementById("btn-close-debug")
            .addEventListener("click", () => this.toggleDebug());
    }

    // ══════════════════════════════════
    //  HUD UPDATE
    // ══════════════════════════════════
    updateHUD() {
        // Czas
        const now = new Date();
        document.getElementById("time-display").textContent =
            `🕐 ${now.toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'})}`;

        // GPS
        if (this.userPosition) {
            const acc = Math.round(this.userPosition.accuracy);
            const emoji = acc < 15 ? "🟢" : acc < 40 ? "🟡" : "🔴";
            document.getElementById("gps-status").textContent = `${emoji} ±${acc}m`;
        }
    }

    // ══════════════════════════════════
    //  DEBUG
    // ══════════════════════════════════
    toggleDebug() {
        const p = document.getElementById("debug-panel");
        p.style.display = p.style.display === "none" ? "block" : "none";
    }

    updateDebugInfo() {
        const el = document.getElementById("debug-info");
        if (!el || document.getElementById("debug-panel").style.display === "none") return;

        const config = this.getActiveConfig();
        let txt = `══ AR PORTAL ENGINE v2 ══\n\n`;
        txt += `Mode: ${this.mode.toUpperCase()}\n`;
        txt += `Time: ${new Date().toLocaleTimeString()}\n`;
        txt += `Heading: ${Math.round(this.deviceHeading)}°\n\n`;

        if (this.userPosition) {
            txt += `GPS:\n`;
            txt += `  ${this.userPosition.lat.toFixed(6)}, ${this.userPosition.lng.toFixed(6)}\n`;
            txt += `  Accuracy: ±${Math.round(this.userPosition.accuracy)}m\n\n`;
        }

        txt += `Portals (${config.length} configured, ${this.activePortals.size} spawned):\n`;
        txt += `─────────────────────────\n`;

        config.forEach(p => {
            const dist = this.userPosition
                ? this.getDistance(this.userPosition.lat, this.userPosition.lng, p.latitude, p.longitude)
                : null;
            const bearing = this.userPosition
                ? this.getBearing(this.userPosition.lat, this.userPosition.lng, p.latitude, p.longitude)
                : null;
            const spawned = this.activePortals.has(p.id);

            txt += `${spawned ? '🟢' : '⚫'} ${p.name}\n`;
            txt += `   ${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}\n`;
            if (dist !== null) {
                txt += `   Dist: ${Math.round(dist)}m | Bearing: ${Math.round(bearing)}°\n`;
            }
            txt += `   Schedule: ${p.schedule.startTime}-${p.schedule.endTime}\n\n`;
        });

        txt += `localStorage portals: ${(localStorage.getItem("ar-portals-config") || "[]").length} bytes\n`;

        el.textContent = txt;
    }

    // ══════════════════════════════════
    //  UTILS
    // ══════════════════════════════════
    updateLoadingStatus(text) {
        const el = document.getElementById("loading-status");
        if (el) el.textContent = text;
    }

    showToast(msg, dur = 3000) {
        document.querySelectorAll(".toast").forEach(t => t.remove());
        const t = document.createElement("div");
        t.className = "toast";
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add("show"));
        setTimeout(() => {
            t.classList.remove("show");
            setTimeout(() => t.remove(), 300);
        }, dur);
    }
}

// ══ START ══
const engine = new ARPortalEngine();
