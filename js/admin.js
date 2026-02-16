/**
 * =============================================
 *  ADMIN PANEL — zarządzanie portalami
 * =============================================
 */

let portals = [];

// Załaduj istniejące portale z portals.js (jeśli istnieją)
try {
    if (typeof PORTALS_CONFIG !== 'undefined') {
        portals = JSON.parse(JSON.stringify(PORTALS_CONFIG));
    }
} catch (e) {
    console.log("Brak istniejących portali — zaczynamy od zera");
}

// ── Render listy portali ──
function renderPortalList() {
    const list = document.getElementById("portal-list");
    
    if (portals.length === 0) {
        list.innerHTML = `
            <div class="card" style="text-align:center; color:#666;">
                Brak portali. Dodaj pierwszy poniżej! 👇
            </div>`;
        return;
    }

    list.innerHTML = portals.map((p, i) => {
        const now = new Date();
        const dayNames = ["sun","mon","tue","wed","thu","fri","sat"];
        const today = dayNames[now.getDay()];
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = p.schedule.startTime.split(":").map(Number);
        const [eh, em] = p.schedule.endTime.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;

        let isActive = p.schedule.days.includes(today);
        if (startMin <= endMin) {
            isActive = isActive && currentMinutes >= startMin && currentMinutes <= endMin;
        } else {
            isActive = isActive && (currentMinutes >= startMin || currentMinutes <= endMin);
        }

        return `
        <div class="card portal-card">
            <span class="status ${isActive ? 'active' : 'inactive'}">
                ${isActive ? '🟢 Aktywny' : '🔴 Nieaktywny'}
            </span>
            <div class="portal-name">${p.placeholder?.type === 'ring' ? '⭕' : p.placeholder?.type === 'torus' ? '🔵' : '🟣'} ${p.name}</div>
            <div class="portal-details">
                <div class="detail">📍 <strong>${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}</strong></div>
                <div class="detail">🕐 <strong>${p.schedule.startTime} - ${p.schedule.endTime}</strong></div>
                <div class="detail">📅 <strong>${p.schedule.days.map(d => d.charAt(0).toUpperCase() + d.slice(1,2)).join(', ')}</strong></div>
                <div class="detail">📏 <strong>Zasięg: ${p.visibilityRadius}m</strong></div>
                <div class="detail">🎨 <strong>${p.placeholder?.color || 'model 3D'}</strong></div>
                <div class="detail">📦 <strong>${p.model || 'placeholder ' + (p.placeholder?.type || '')}</strong></div>
            </div>
            <button class="btn btn-delete" onclick="deletePortal(${i})">🗑️ Usuń</button>
        </div>`;
    }).join("");
}

// ── Dodaj portal ──
function addPortal() {
    const name = document.getElementById("f-name").value.trim();
    const desc = document.getElementById("f-desc").value.trim();
    const lat = parseFloat(document.getElementById("f-lat").value);
    const lng = parseFloat(document.getElementById("f-lng").value);
    const start = document.getElementById("f-start").value;
    const end = document.getElementById("f-end").value;
    const shape = document.getElementById("f-shape").value;
    const color = document.getElementById("f-color").value;
    const size = parseInt(document.getElementById("f-size").value) || 5;
    const radius = parseInt(document.getElementById("f-radius").value) || 500;
    const model = document.getElementById("f-model").value.trim() || null;

    // Walidacja
    if (!name) return alert("Podaj nazwę portalu!");
    if (isNaN(lat) || isNaN(lng)) return alert("Podaj prawidłowe współrzędne!");
    if (!start || !end) return alert("Podaj godziny!");

    // Pobierz wybrane dni
    const days = [];
    document.querySelectorAll(".day-toggle.selected").forEach(el => {
        days.push(el.dataset.day);
    });
    if (days.length === 0) return alert("Wybierz przynajmniej jeden dzień!");

    // Generuj ID z nazwy
    const id = "portal-" + name.toLowerCase()
        .replace(/[ąć]/g, c => ({ą:'a',ć:'c'}[c]))
        .replace(/[ęł]/g, c => ({ę:'e',ł:'l'}[c]))
        .replace(/[ńóś]/g, c => ({ń:'n',ó:'o',ś:'s'}[c]))
        .replace(/[żź]/g, 'z')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    // Hex to darker emissive
    const emissive = color.replace(/^#/, '').match(/.{2}/g)
        .map(c => Math.round(parseInt(c, 16) * 0.3).toString(16).padStart(2, '0'))
        .join('');

    const portal = {
        id: id,
        name: name,
        description: desc,
        latitude: lat,
        longitude: lng,
        model: model,
        placeholder: {
            type: shape,
            color: color,
            emissive: `#${emissive}`,
            width: size,
            height: size,
            opacity: 0.85
        },
        scale: { x: size, y: size, z: size },
        animation: {
            property: "rotation",
            to: "0 360 0",
            loop: true,
            duration: 20000,
            easing: "linear"
        },
        animation2: {
            property: "position",
            dir: "alternate",
            from: "0 0 0",
            to: "0 0.5 0",
            loop: true,
            duration: 3000,
            easing: "easeInOutSine"
        },
        schedule: {
            startTime: start,
            endTime: end,
            days: days
        },
        visibilityRadius: radius,
        particles: true,
        sound: null
    };

    portals.push(portal);
    renderPortalList();
    generateOutput();
    clearForm();
}

// ── Usuń portal ──
function deletePortal(index) {
    if (confirm(`Usunąć portal "${portals[index].name}"?`)) {
        portals.splice(index, 1);
        renderPortalList();
        generateOutput();
    }
}

// ── GPS ──
function fillGPS() {
    if (!navigator.geolocation) {
        alert("GPS niedostępny w przeglądarce!");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            document.getElementById("f-lat").value = pos.coords.latitude.toFixed(6);
            document.getElementById("f-lng").value = pos.coords.longitude.toFixed(6);
        },
        err => alert("Błąd GPS: " + err.message),
        { enableHighAccuracy: true }
    );
}

// ── Generuj output ──
function generateOutput() {
    const output = document.getElementById("output");

    let code = `/**\n * PORTALS CONFIG\n * Wygenerowano: ${new Date().toLocaleString('pl-PL')}\n */\n\n`;
    code += `const PORTALS_CONFIG = ${JSON.stringify(portals, null, 4)};\n\n`;
    code += `const APP_CONFIG = {\n`;
    code += `    scheduleCheckInterval: 30000,\n`;
    code += `    gpsUpdateInterval: 5000,\n`;
    code += `    defaultVisibilityRadius: 500,\n`;
    code += `    showDistantIndicators: true,\n`;
    code += `    maxIndicatorDistance: 2000,\n`;
    code += `    debug: true\n`;
    code += `};\n`;

    output.textContent = code;
}

// ── Kopiuj do schowka ──
function copyOutput() {
    const text = document.getElementById("output").textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert("✅ Skopiowano do schowka!\n\nWklej zawartość do pliku js/portals.js");
    }).catch(() => {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        alert("✅ Skopiowano!");
    });
}

// ── Wyczyść formularz ──
function clearForm() {
    document.getElementById("f-name").value = "";
    document.getElementById("f-desc").value = "";
    document.getElementById("f-model").value = "";
}

// ── Toggling dni ──
document.querySelectorAll(".day-toggle").forEach(el => {
    el.addEventListener("click", () => {
        el.classList.toggle("selected");
    });
});

// ── Init ──
renderPortalList();
generateOutput();
