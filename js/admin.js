/**
 * =============================================
 *  ADMIN PANEL v2
 *  Zapisuje do localStorage → strona AR czyta
 * =============================================
 */

let portals = [];

// Ładuj z localStorage
function loadPortals() {
    try {
        const saved = localStorage.getItem("ar-portals-config");
        if (saved) {
            portals = JSON.parse(saved);
            console.log(`✅ Załadowano ${portals.length} portali`);
        }
    } catch(e) {
        console.warn("Load error:", e);
        portals = [];
    }
}

// Zapisz do localStorage
function savePortals() {
    localStorage.setItem("ar-portals-config", JSON.stringify(portals));
    console.log(`💾 Zapisano ${portals.length} portali`);
}

// ── Render listy ──
function renderPortalList() {
    const list = document.getElementById("portal-list");

    if (portals.length === 0) {
        list.innerHTML = `
            <div class="card" style="text-align:center; color:#666;">
                Brak portali. Dodaj pierwszy! 👇<br>
                <small>Portale automatycznie pojawią się na stronie AR.</small>
            </div>`;
        return;
    }

    list.innerHTML = portals.map((p, i) => {
        const now = new Date();
        const dayNames = ["sun","mon","tue","wed","thu","fri","sat"];
        const today = dayNames[now.getDay()];
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = (p.schedule?.startTime || "00:00").split(":").map(Number);
        const [eh, em] = (p.schedule?.endTime || "23:59").split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;

        let isActive = (p.schedule?.days || []).includes(today);
        if (startMin <= endMin) {
            isActive = isActive && currentMinutes >= startMin && currentMinutes <= endMin;
        } else {
            isActive = isActive && (currentMinutes >= startMin || currentMinutes <= endMin);
        }

        return `
        <div class="card portal-card">
            <span class="status ${isActive ? 'active' : 'inactive'}">
                ${isActive ? '🟢 AKTYWNY' : '🔴 Nieaktywny'}
            </span>
            <div class="portal-name">${p.name || p.id}</div>
            <div class="portal-details">
                <div class="detail">📍 ${(p.latitude||0).toFixed(5)}, ${(p.longitude||0).toFixed(5)}</div>
                <div class="detail">🕐 ${p.schedule?.startTime || '?'} - ${p.schedule?.endTime || '?'}</div>
                <div class="detail">📅 ${(p.schedule?.days || []).join(', ')}</div>
                <div class="detail">📏 Zasięg: ${p.visibilityRadius || '?'}m</div>
            </div>
            <button class="btn btn-delete" onclick="deletePortal(${i})">🗑️ Usuń</button>
        </div>`;
    }).join("");
}

// ── Dodaj portal ──
function addPortal() {
    const name = document.getElementById("f-name").value.trim();
    const lat = parseFloat(document.getElementById("f-lat").value);
    const lng = parseFloat(document.getElementById("f-lng").value);
    const start = document.getElementById("f-start").value;
    const end = document.getElementById("f-end").value;
    const shape = document.getElementById("f-shape").value;
    const color = document.getElementById("f-color").value;
    const size = parseInt(document.getElementById("f-size").value) || 5;
    const radius = parseInt(document.getElementById("f-radius").value) || 500;
    const model = document.getElementById("f-model").value.trim() || null;

    if (!name) return alert("Podaj nazwę!");
    if (isNaN(lat) || isNaN(lng)) return alert("Podaj współrzędne!");

    const days = [];
    document.querySelectorAll(".day-toggle.selected").forEach(el => {
        days.push(el.dataset.day);
    });
    if (days.length === 0) return alert("Wybierz dni!");

    const id = "portal-" + Date.now();

    const portal = {
        id,
        name,
        latitude: lat,
        longitude: lng,
        model,
        placeholder: { type: shape, color, emissive: "#111", width: size, height: size, opacity: 0.9 },
        scale: { x: size, y: size, z: size },
        animation: { property: "rotation", to: "0 360 0", loop: true, duration: 20000, easing: "linear" },
        schedule: { startTime: start, endTime: end, days },
        visibilityRadius: radius,
        particles: true
    };

    portals.push(portal);
    savePortals();          // ← KLUCZOWA ZMIANA: zapis do localStorage
    renderPortalList();
    clearForm();

    alert("✅ Portal dodany!\nBędzie widoczny na stronie AR w trybie LIVE.");
}

// ── Usuń portal ──
function deletePortal(index) {
    if (confirm(`Usunąć "${portals[index].name}"?`)) {
        portals.splice(index, 1);
        savePortals();      // ← zapis
        renderPortalList();
    }
}

// ── GPS ──
function fillGPS() {
    navigator.geolocation.getCurrentPosition(
        pos => {
            document.getElementById("f-lat").value = pos.coords.latitude.toFixed(6);
            document.getElementById("f-lng").value = pos.coords.longitude.toFixed(6);
        },
        err => alert("Błąd GPS: " + err.message),
        { enableHighAccuracy: true }
    );
}

// ── Clear form ──
function clearForm() {
    document.getElementById("f-name").value = "";
    document.getElementById("f-desc").value = "";
    document.getElementById("f-model").value = "";
}

// ── Export JSON (do pobrania) ──
function exportJSON() {
    const blob = new Blob([JSON.stringify(portals, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portals-config.json";
    a.click();
    URL.revokeObjectURL(url);
}

// ── Day toggles ──
document.querySelectorAll(".day-toggle").forEach(el => {
    el.addEventListener("click", () => el.classList.toggle("selected"));
});

// ── INIT ──
loadPortals();
renderPortalList();
