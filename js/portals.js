/**
 * =============================================
 *  PORTALS CONFIG
 *  Ładuje z localStorage (admin) lub używa domyślnych
 * =============================================
 */

// Próbuj załadować z localStorage (zapisane przez admin.html)
function loadPortalsConfig() {
    try {
        const saved = localStorage.getItem("ar-portals-config");
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`✅ Załadowano ${parsed.length} portali z panelu admina`);
                return parsed;
            }
        }
    } catch (e) {
        console.warn("Błąd ładowania portali z localStorage:", e);
    }

    // Domyślna konfiguracja
    console.log("ℹ️ Używam domyślnej konfiguracji portali");
    return [
        {
            id: "portal-domyslny",
            name: "Portal Startowy",
            description: "Domyślny portal testowy",
            latitude: 0,   // Będzie nadpisane w trybie demo
            longitude: 0,
            model: null,
            placeholder: {
                type: "ring",
                color: "#00d4ff",
                emissive: "#003366",
                width: 4,
                height: 6,
                opacity: 0.9
            },
            scale: { x: 5, y: 5, z: 5 },
            animation: {
                property: "rotation",
                to: "0 360 0",
                loop: true,
                duration: 20000,
                easing: "linear"
            },
            schedule: {
                startTime: "00:00",
                endTime: "23:59",
                days: ["mon","tue","wed","thu","fri","sat","sun"]
            },
            visibilityRadius: 1000,
            particles: true
        }
    ];
}

let PORTALS_CONFIG = loadPortalsConfig();

const APP_CONFIG = {
    scheduleCheckInterval: 15000,
    gpsUpdateInterval: 3000,
    defaultVisibilityRadius: 1000,
    debug: true
};
