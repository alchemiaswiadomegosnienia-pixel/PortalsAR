/**
 * =============================================
 *  AR PORTAL ENGINE
 *  Silnik zarządzający portalami
 * =============================================
 */

class ARPortalEngine {
    constructor() {
        this.activePortals = new Map();
        this.userPosition = null;
        this.watchId = null;
        this.isRunning = false;
        this.usingFrontCamera = false;

        this.init();
    }

    // ── Inicjalizacja ──
    init() {
        const btnStart = document.getElementById("btn-start");
        const permButtons = document.getElementById("permission-buttons");

        // Pokaż przycisk start
        this.updateLoadingStatus("Kliknij aby uruchomić AR");
        permButtons.style.display = "block";

        btnStart.addEventListener("click", () => this.start());
    }

    async start() {
        try {
            this.updateLoadingStatus("Proszę o dostęp do kamery...");

            // Sprawdź uprawnienia
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false
            });
            stream.getTracks().forEach(t => t.stop());

            this.updateLoadingStatus("Uruchamiam GPS...");

            // GPS
            if ("geolocation" in navigator) {
                this.startGPS();
            } else {
                this.showToast("⚠️ GPS niedostępny — portale będą widoczne bez filtrowania lokalizacji");
            }

            this.updateLoadingStatus("Ładuję scenę AR...");

            // Pokaż scenę AR
            const scene = document.getElementById("ar-scene");
            scene.style.display = "block";

            // Czekaj aż A-Frame się załaduje
            if (scene.hasLoaded) {
                this.onSceneReady();
            } else {
                scene.addEventListener("loaded", () => this.onSceneReady());
            }

        } catch (err) {
            console.error("Błąd startu:", err);
            this.updateLoadingStatus(`❌ Błąd: ${err.message}`);
            this.showToast("❌ Nie udało się uruchomić kamery. Sprawdź uprawnienia.");
        }
    }

    onSceneReady() {
        this.isRunning = true;

        // Ukryj loading screen
        document.getElementById("loading-screen").classList.add("hidden");
        document.getElementById("hud").style.display = "block";

        // Załaduj portale
        this.refreshPortals();

        // Interwały
        setInterval(() => this.refreshPortals(), APP_CONFIG.scheduleCheckInterval);
        setInterval(() => this.updateTimeDisplay(), 1000);
        setInterval(() => this.updateDebugInfo(), 2000);

        // Event listeners
        this.setupButtons();

        this.showToast("🌀 AR Portale aktywne!\nRozglądaj się dookoła.");

        console.log("✅ AR Portal Engine uruchomiony");
    }

    // ── GPS ──
    startGPS() {
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => {
                this.userPosition = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    altitude: pos.coords.altitude
                };
                this.updateGPSStatus();
            },
            (err) => {
                console.warn("GPS error:", err);
                document.getElementById("gps-status").textContent = "📡 GPS błąd";
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 15000
            }
        );
    }

    updateGPSStatus() {
        if (!this.userPosition) return;
        const acc = Math.round(this.userPosition.accuracy);
        const emoji = acc < 10 ? "🟢" : acc < 30 ? "🟡" : "🔴";
        document.getElementById("gps-status").textContent =
            `${emoji} GPS ±${acc}m`;
    }

    // ── Harmonogram ──
    isPortalActive(portal) {
        const now = new Date();
        const schedule = portal.schedule;

        // Sprawdź dzień tygodnia
        const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const today = dayNames[now.getDay()];
        if (!schedule.days.includes(today)) return false;

        // Sprawdź godzinę
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = schedule.startTime.split(":").map(Number);
        const [endH, endM] = schedule.endTime.split(":").map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;

        if (startMin <= endMin) {
            return currentMinutes >= startMin && currentMinutes <= endMin;
        } else {
            // Przez północ
            return currentMinutes >= startMin || currentMinutes <= endMin;
        }
    }

    // ── Odległość (Haversine) ──
    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    isInRange(portal) {
        if (!this.userPosition) return true; // Bez GPS — pokaż wszystko
        const dist = this.getDistance(
            this.userPosition.lat, this.userPosition.lng,
            portal.latitude, portal.longitude
        );
        return dist <= (portal.visibilityRadius || APP_CONFIG.defaultVisibilityRadius);
    }

    getPortalDistance(portal) {
        if (!this.userPosition) return null;
        return this.getDistance(
            this.userPosition.lat, this.userPosition.lng,
            portal.latitude, portal.longitude
        );
    }

    // ── Zarządzanie portalami ──
    refreshPortals() {
        let activeCount = 0;

        PORTALS_CONFIG.forEach(portal => {
            const shouldBeActive = this.isPortalActive(portal);
            const isSpawned = this.activePortals.has(portal.id);

            if (shouldBeActive && !isSpawned) {
                this.spawnPortal(portal);
                activeCount++;
            } else if (!shouldBeActive && isSpawned) {
                this.despawnPortal(portal.id);
            } else if (shouldBeActive) {
                activeCount++;
            }
        });

        document.getElementById("portal-count").textContent =
            `🌀 ${activeCount} portali`;
    }

    spawnPortal(portal) {
        const scene = document.querySelector("a-scene");
        const entity = document.createElement("a-entity");

        entity.setAttribute("id", portal.id);

        // Geolokacja
        entity.setAttribute("gps-entity-place",
            `latitude: ${portal.latitude}; longitude: ${portal.longitude};`
        );

        // Model lub placeholder
        if (portal.model) {
            entity.setAttribute("gltf-model", `url(${portal.model})`);
        } else {
            this.createPlaceholder(entity, portal);
        }

        // Skala
        entity.setAttribute("scale",
            `${portal.scale.x} ${portal.scale.y} ${portal.scale.z}`
        );

        // Patrz na kamerę
        entity.setAttribute("look-at", "[gps-camera]");

        // Animacja 1
        if (portal.animation) {
            entity.setAttribute("animation", portal.animation);
        }

        // Animacja 2
        if (portal.animation2) {
            entity.setAttribute("animation__2", portal.animation2);
        }

        // Cząsteczki
        if (portal.particles) {
            this.addParticles(entity, portal);
        }

        scene.appendChild(entity);
        this.activePortals.set(portal.id, entity);

        console.log(`✅ Spawned: ${portal.name} (${portal.id})`);
    }

    createPlaceholder(entity, portal) {
        const p = portal.placeholder;

        switch (p.type) {
            case "ring":
                // Zewnętrzny ring
                const ring = document.createElement("a-ring");
                ring.setAttribute("radius-inner", p.width / 2 - 0.2);
                ring.setAttribute("radius-outer", p.width / 2);
                ring.setAttribute("color", p.color);
                ring.setAttribute("opacity", p.opacity);
                ring.setAttribute("side", "double");
                ring.setAttribute("segments-theta", 64);
                entity.appendChild(ring);

                // Wewnętrzna poświata
                const glow = document.createElement("a-ring");
                glow.setAttribute("radius-inner", 0);
                glow.setAttribute("radius-outer", p.width / 2 - 0.2);
                glow.setAttribute("color", p.emissive);
                glow.setAttribute("opacity", 0.3);
                glow.setAttribute("side", "double");
                entity.appendChild(glow);

                // Tekst nazwy
                const text = document.createElement("a-text");
                text.setAttribute("value", portal.name);
                text.setAttribute("align", "center");
                text.setAttribute("color", p.color);
                text.setAttribute("width", "6");
                text.setAttribute("position", `0 ${p.height / 2 + 0.5} 0`);
                entity.appendChild(text);
                break;

            case "torus":
                const torus = document.createElement("a-torus");
                torus.setAttribute("radius", p.width / 2);
                torus.setAttribute("radius-tubular", 0.15);
                torus.setAttribute("color", p.color);
                torus.setAttribute("opacity", p.opacity);
                torus.setAttribute("segments-radial", 16);
                torus.setAttribute("segments-tubular", 48);
                entity.appendChild(torus);

                const label = document.createElement("a-text");
                label.setAttribute("value", portal.name);
                label.setAttribute("align", "center");
                label.setAttribute("color", p.color);
                label.setAttribute("width", "6");
                label.setAttribute("position", `0 ${p.width / 2 + 1} 0`);
                entity.appendChild(label);
                break;

            case "box":
                const box = document.createElement("a-box");
                box.setAttribute("width", p.width);
                box.setAttribute("height", p.height);
                box.setAttribute("depth", 0.3);
                box.setAttribute("color", p.color);
                box.setAttribute("opacity", p.opacity);
                entity.appendChild(box);
                break;

            case "sphere":
                const sphere = document.createElement("a-sphere");
                sphere.setAttribute("radius", p.width / 2);
                sphere.setAttribute("color", p.color);
                sphere.setAttribute("opacity", p.opacity);
                sphere.setAttribute("segments-height", 18);
                sphere.setAttribute("segments-width", 36);
                entity.appendChild(sphere);
                break;
        }
    }

    addParticles(entity, portal) {
        // Symulacja cząsteczek za pomocą małych sfer
        const color = portal.placeholder?.color || "#ffffff";
        for (let i = 0; i < 8; i++) {
            const particle = document.createElement("a-sphere");
            const angle = (i / 8) * Math.PI * 2;
            const radius = (portal.placeholder?.width || 2) / 2 + 0.5;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            particle.setAttribute("radius", 0.05);
            particle.setAttribute("color", color);
            particle.setAttribute("opacity", 0.7);
            particle.setAttribute("position", `${x} 0 ${z}`);
            particle.setAttribute("animation", {
                property: "position",
                to: `${x} ${1 + Math.random()} ${z}`,
                dir: "alternate",
                loop: true,
                dur: 2000 + Math.random() * 2000,
                easing: "easeInOutSine"
            });
            particle.setAttribute("animation__fade", {
                property: "opacity",
                from: 0.7,
                to: 0.1,
                dir: "alternate",
                loop: true,
                dur: 1500 + Math.random() * 1500
            });

            entity.appendChild(particle);
        }
    }

    despawnPortal(id) {
        const entity = this.activePortals.get(id);
        if (entity) {
            entity.remove();
            this.activePortals.delete(id);
            console.log(`⏹️ Despawned: ${id}`);
        }
    }

    // ── Przyciski ──
    setupButtons() {
        document.getElementById("btn-camera-switch")
            .addEventListener("click", () => this.switchCamera());

        document.getElementById("btn-refresh")
            .addEventListener("click", () => {
                this.refreshPortals();
                this.showToast("🔃 Portale odświeżone");
            });

        document.getElementById("btn-debug")
            .addEventListener("click", () => this.toggleDebug());

        document.getElementById("btn-close-debug")
            .addEventListener("click", () => this.toggleDebug());
    }

        switchCamera() {
        this.usingFrontCamera = !this.usingFrontCamera;

        this.showToast(
            this.usingFrontCamera
                ? "📸 Przednia kamera\n(ograniczone AR — brak depth)"
                : "📸 Tylna kamera\n(pełne AR)"
        );

        // Restart strumienia wideo
        const video = document.querySelector("video");
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(t => t.stop());
        }

        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: this.usingFrontCamera ? "user" : "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        }).then(stream => {
            if (video) {
                video.srcObject = stream;
                video.play();
            }
        }).catch(err => {
            console.error("Camera switch error:", err);
            this.showToast("❌ Nie udało się przełączyć kamery");
            this.usingFrontCamera = !this.usingFrontCamera;
        });
    }

    // ── Debug ──
    toggleDebug() {
        const panel = document.getElementById("debug-panel");
        panel.style.display = panel.style.display === "none" ? "block" : "none";
        if (panel.style.display === "block") {
            this.updateDebugInfo();
        }
    }

    updateDebugInfo() {
        const panel = document.getElementById("debug-info");
        if (!panel || document.getElementById("debug-panel").style.display === "none") return;

        const now = new Date();
        const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

        let info = `═══ AR PORTAL ENGINE DEBUG ═══\n\n`;
        info += `⏰ Czas: ${now.toLocaleTimeString()}\n`;
        info += `📅 Dzień: ${dayNames[now.getDay()]}\n\n`;

        // GPS
        if (this.userPosition) {
            info += `📡 GPS:\n`;
            info += `   Lat: ${this.userPosition.lat.toFixed(6)}\n`;
            info += `   Lng: ${this.userPosition.lng.toFixed(6)}\n`;
            info += `   Dokładność: ±${Math.round(this.userPosition.accuracy)}m\n`;
            info += `   Wysokość: ${this.userPosition.altitude ? Math.round(this.userPosition.altitude) + 'm' : 'n/a'}\n\n`;
        } else {
            info += `📡 GPS: Brak danych\n\n`;
        }

        // Kamera
        info += `📸 Kamera: ${this.usingFrontCamera ? 'Przednia' : 'Tylna'}\n\n`;

        // Portale
        info += `═══ PORTALE (${PORTALS_CONFIG.length} skonfigurowanych) ═══\n\n`;

        PORTALS_CONFIG.forEach(portal => {
            const active = this.isPortalActive(portal);
            const spawned = this.activePortals.has(portal.id);
            const dist = this.getPortalDistance(portal);
            const inRange = this.isInRange(portal);

            info += `${spawned ? '🟢' : active ? '🟡' : '🔴'} ${portal.name}\n`;
            info += `   ID: ${portal.id}\n`;
            info += `   Pozycja: ${portal.latitude}, ${portal.longitude}\n`;
            info += `   Godziny: ${portal.schedule.startTime} - ${portal.schedule.endTime}\n`;
            info += `   Dni: ${portal.schedule.days.join(', ')}\n`;
            info += `   Aktywny wg harmonogramu: ${active ? 'TAK' : 'NIE'}\n`;
            info += `   Wyświetlony: ${spawned ? 'TAK' : 'NIE'}\n`;
            if (dist !== null) {
                info += `   Odległość: ${dist < 1000 ? Math.round(dist) + 'm' : (dist / 1000).toFixed(1) + 'km'}\n`;
                info += `   W zasięgu (${portal.visibilityRadius}m): ${inRange ? 'TAK' : 'NIE'}\n`;
            }
            info += `\n`;
        });

        info += `═══ SYSTEM ═══\n`;
        info += `Aktywnych portali: ${this.activePortals.size}\n`;
        info += `Sprawdzanie co: ${APP_CONFIG.scheduleCheckInterval / 1000}s\n`;
        info += `User Agent: ${navigator.userAgent.substring(0, 60)}...\n`;

        panel.textContent = info;
    }

    // ── Czas na HUD ──
    updateTimeDisplay() {
        const now = new Date();
        document.getElementById("time-display").textContent =
            `🕐 ${now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // ── Loading status ──
    updateLoadingStatus(text) {
        const el = document.getElementById("loading-status");
        if (el) el.textContent = text;
    }

    // ── Toast notification ──
    showToast(message, duration = 3000) {
        // Usuń istniejące toasty
        document.querySelectorAll(".toast").forEach(t => t.remove());

        const toast = document.createElement("div");
        toast.className = "toast";
        toast.textContent = message;
        document.body.appendChild(toast);

        // Animacja wejścia
        requestAnimationFrame(() => {
            toast.classList.add("show");
        });

        // Auto-ukryj
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ── Cleanup ──
    destroy() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
        }
        this.activePortals.forEach((entity, id) => {
            this.despawnPortal(id);
        });
        this.isRunning = false;
    }
}

// ── START ──
const engine = new ARPortalEngine();
