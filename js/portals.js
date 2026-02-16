/**
 * =============================================
 *  KONFIGURACJA PORTALI
 *  
 *  Edytuj tę tablicę żeby dodawać/usuwać portale.
 *  Współrzędne: Google Maps → prawy klik → współrzędne
 * =============================================
 */

const PORTALS_CONFIG = [

    // ── PORTAL 1: Przykładowy portal — Pałac Kultury Warszawa ──
    {
        id: "portal-pkin",
        name: "Portal Kosmiczny",
        description: "Brama do innego wymiaru",

        // Lokalizacja
        latitude: 52.2319,
        longitude: 21.0067,

        // Model 3D — ścieżka do pliku .glb / .gltf
        // Zamień na swój model z Blendera!
        model: null, // null = użyje wbudowanego placeholder'a
        
        // Alternatywnie: model: "models/moj-portal.glb"

        // Wygląd placeholder'a (gdy model: null)
        placeholder: {
            type: "ring",          // ring / box / sphere / torus
            color: "#00d4ff",
            emissive: "#003366",
            width: 4,
            height: 6,
            opacity: 0.85
        },

        // Skala modelu
        scale: { x: 5, y: 5, z: 5 },

        // Animacja
        animation: {
            property: "rotation",
            to: "0 360 0",
            loop: true,
            duration: 30000,
            easing: "linear"
        },

        // Dodatkowa animacja
        animation2: {
            property: "position",
            dir: "alternate",
            from: "0 0 0",
            to: "0 0.5 0",
            loop: true,
            duration: 3000,
            easing: "easeInOutSine"
        },

        // Harmonogram
        schedule: {
            startTime: "00:00",
            endTime: "23:59",
            days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
            // Opcjonalnie: konkretne daty
            // specificDates: ["2025-01-01", "2025-12-25"]
        },

        // Zasięg widoczności w metrach
        visibilityRadius: 500,

        // Efekty cząsteczkowe
        particles: true,
        
        // Dźwięk (opcjonalnie)
        sound: null  // "sounds/ambient.mp3"
    },

    // ── PORTAL 2: Smocza Jama Kraków ──
    {
        id: "portal-smok",
        name: "Smocza Brama",
        description: "Portal do smoczej jaskini",
        latitude: 50.0540,
        longitude: 19.9352,
        model: null,
        placeholder: {
            type: "torus",
            color: "#ff4400",
            emissive: "#661100",
            width: 5,
            height: 5,
            opacity: 0.9
        },
        scale: { x: 8, y: 8, z: 8 },
        animation: {
            property: "rotation",
            to: "0 360 0",
            loop: true,
            duration: 15000,
            easing: "linear"
        },
        animation2: null,
        schedule: {
            startTime: "10:00",
            endTime: "22:00",
            days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        },
        visibilityRadius: 300,
        particles: true,
        sound: null
    },

    // ── PORTAL 3: Nocny portal — Gdańsk ──
    {
        id: "portal-nocny",
        name: "Nocna Brama",
        description: "Pojawia się tylko nocą w weekendy",
        latitude: 54.3520,
        longitude: 18.6466,
        model: null,
        placeholder: {
            type: "ring",
            color: "#7b2fff",
            emissive: "#1a0040",
            width: 3,
            height: 5,
            opacity: 0.8
        },
        scale: { x: 6, y: 6, z: 6 },
        animation: {
            property: "rotation",
            to: "0 -360 0",
            loop: true,
            duration: 20000,
            easing: "linear"
        },
        animation2: {
            property: "scale",
            dir: "alternate",
            from: "6 6 6",
            to: "6.5 6.5 6.5",
            loop: true,
            duration: 4000,
            easing: "easeInOutSine"
        },
        schedule: {
            startTime: "21:00",
            endTime: "04:00",     // Przechodzi przez północ ✓
            days: ["fri", "sat"]
        },
        visibilityRadius: 200,
        particles: true,
        sound: null
    }

];


// =============================================
//  USTAWIENIA GLOBALNE
// =============================================
const APP_CONFIG = {
    // Jak często sprawdzać harmonogram (ms)
    scheduleCheckInterval: 30000,

    // Jak często aktualizować GPS na HUD (ms)
    gpsUpdateInterval: 5000,

    // Domyślny zasięg widoczności portali (metry)
    defaultVisibilityRadius: 500,

    // Czy pokazywać portale poza zasięgiem jako wskaźniki?
    showDistantIndicators: true,

    // Max dystans dla wskaźników (metry)
    maxIndicatorDistance: 2000,

    // Debug mode
    debug: true
};
