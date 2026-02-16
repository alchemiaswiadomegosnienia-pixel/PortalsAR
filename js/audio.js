/**
 * ═══════════════════════════════
 *  QUANTUM AUDIO ENGINE
 *  Synteza dźwięku w Web Audio API
 *  Nie potrzebuje żadnych plików!
 * ═══════════════════════════════
 */

class QuantumAudio {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.ambientNodes = [];
        this.initialized = false;
    }

    // Musi być wywołane z user gesture!
    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
            this.initialized = true;
            console.log("🔊 Audio zainicjalizowane");
        } catch(e) {
            console.warn("Audio niedostępne:", e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // ── Ambient portalu — ciągłe drżenie ──
    startPortalAmbient() {
        if (!this.initialized) return;
        this.resume();

        // Bazowy drone (niski ton)
        const drone = this.ctx.createOscillator();
        drone.type = 'sine';
        drone.frequency.value = 60;
        
        const droneGain = this.ctx.createGain();
        droneGain.gain.value = 0.15;
        
        drone.connect(droneGain);
        droneGain.connect(this.masterGain);
        drone.start();

        // Wyższy ton — shimmer
        const shimmer = this.ctx.createOscillator();
        shimmer.type = 'sine';
        shimmer.frequency.value = 220;
        
        const shimmerGain = this.ctx.createGain();
        shimmerGain.gain.value = 0.04;
        
        // LFO na shimmer
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.5;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 30;
        lfo.connect(lfoGain);
        lfoGain.connect(shimmer.frequency);
        lfo.start();

        shimmer.connect(shimmerGain);
        shimmerGain.connect(this.masterGain);
        shimmer.start();

        // Szum — "kwantowy" 
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        
        // Filtr — zostaw tylko niskie
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 200;
        
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.value = 0.05;
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start();

        this.ambientNodes = [
            { node: drone, gain: droneGain },
            { node: shimmer, gain: shimmerGain },
            { node: lfo },
            { node: noise, gain: noiseGain }
        ];
    }

    // Intensywność rośnie z postępem (0-1)
    setAmbientIntensity(progress) {
        if (!this.initialized || this.ambientNodes.length === 0) return;

        // Drone głośniej
        const droneGain = this.ambientNodes[0].gain;
        if (droneGain) droneGain.gain.value = 0.1 + progress * 0.25;

        // Shimmer głośniej i wyżej
        const shimmerGain = this.ambientNodes[1].gain;
        if (shimmerGain) shimmerGain.gain.value = 0.03 + progress * 0.1;

        // Zmiana częstotliwości drone'a
        const drone = this.ambientNodes[0].node;
        if (drone) drone.frequency.value = 60 + progress * 40;

        // Noise głośniej
        const noiseGain = this.ambientNodes[3]?.gain;
        if (noiseGain) noiseGain.gain.value = 0.03 + progress * 0.1;
    }

    stopAmbient() {
        this.ambientNodes.forEach(n => {
            try { n.node.stop(); } catch(e) {}
        });
        this.ambientNodes = [];
    }

    // ── Efekt kroku ──
    playStep() {
        if (!this.initialized) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 100 + Math.random() * 50;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.1;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    // ── Efekt postawienia portalu ──
    playPortalPlace() {
        if (!this.initialized) return;
        this.resume();

        // Sweep w górę
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 100;
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.5);

        const gain = this.ctx.createGain();
        gain.gain.value = 0.2;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.8);

        // Dodatkowy "whoosh"
        const bufSize = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
        
        const whoosh = this.ctx.createBufferSource();
        whoosh.buffer = buf;
        
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = 1000;
        filt.Q.value = 2;
        
        const wGain = this.ctx.createGain();
        wGain.gain.value = 0.15;
        wGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
        
        whoosh.connect(filt);
        filt.connect(wGain);
        wGain.connect(this.masterGain);
        whoosh.start();
        whoosh.stop(this.ctx.currentTime + 0.6);
    }

    // ── Efekt teleportacji ──
    playTeleport() {
        if (!this.initialized) return;
        this.resume();
        this.stopAmbient();

        // Wielowarstwowy efekt
        const now = this.ctx.currentTime;

        // Sweep w dół
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.value = 2000;
        osc1.frequency.exponentialRampToValueAtTime(30, now + 2);
        
        const g1 = this.ctx.createGain();
        g1.gain.value = 0.15;
        g1.gain.linearRampToValueAtTime(0.25, now + 0.3);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        
        osc1.connect(g1);
        g1.connect(this.masterGain);
        osc1.start();
        osc1.stop(now + 2.5);

        // "Rozbicie" — szum
        const bufSize = this.ctx.sampleRate * 3;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;
        
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 3000;
        filt.frequency.exponentialRampToValueAtTime(100, now + 2);
        
        const ng = this.ctx.createGain();
        ng.gain.value = 0.2;
        ng.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        
        noise.connect(filt);
        filt.connect(ng);
        ng.connect(this.masterGain);
        noise.start();
        noise.stop(now + 2.5);

        // "Boom" na starcie
        const boom = this.ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.value = 40;
        
        const bg = this.ctx.createGain();
        bg.gain.value = 0.4;
        bg.gain.exponentialRampToValueAtTime(0.001, now + 1);
        
        boom.connect(bg);
        bg.connect(this.masterGain);
        boom.start();
        boom.stop(now + 1);
    }

    // ── Efekt selfie ──
    playShutter() {
        if (!this.initialized) return;
        this.resume();

        const bufSize = this.ctx.sampleRate * 0.15;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
        
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'highpass';
        filt.frequency.value = 2000;
        
        const g = this.ctx.createGain();
        g.gain.value = 0.3;
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        
        src.connect(filt);
        filt.connect(g);
        g.connect(this.masterGain);
        src.start();
    }

    // ── Sukces ──
    playSuccess() {
        if (!this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;
        const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6

        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            const g = this.ctx.createGain();
            g.gain.value = 0;
            g.gain.linearRampToValueAtTime(0.15, now + i*0.15 + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, now + i*0.15 + 0.4);
            
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.4);
        });
    }
}

const audio = new QuantumAudio();
