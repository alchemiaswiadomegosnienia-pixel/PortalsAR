/**
 * ══════════════════════════════════════════
 *  QUANTUM JUMP LEDGER
 *  
 *  Lokalna weryfikacja skoków.
 *  Struktura gotowa na blockchain publication.
 *  
 *  Teraz:  SHA-256 hash chain w localStorage
 *  Potem:  Ethereum/Solana/własny chain
 *  Kiedyś: Cross-timeline verification protocol
 * ══════════════════════════════════════════
 */

class QuantumLedger {
    constructor() {
        this.chain = this.loadChain();
    }

    // ── SHA-256 (native Web Crypto API) ──
    async sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ── Pobierz chain z localStorage ──
    loadChain() {
        try {
            const data = localStorage.getItem("qt-ledger");
            if (data) {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch(e) {}

        // Genesis block
        return [{
            index: 0,
            timestamp: "2025-01-01T00:00:00.000Z",
            jumpId: "GENESIS",
            data: {
                message: "In the beginning there was the quantum field.",
                version: "3.0"
            },
            previousHash: "0".repeat(64),
            hash: null,  // będzie obliczony
            nonce: 0
        }];
    }

    // ── Zapisz chain ──
    saveChain() {
        localStorage.setItem("qt-ledger", JSON.stringify(this.chain));
    }

    // ── Oblicz hash bloku ──
    async calculateHash(block) {
        const content = JSON.stringify({
            index: block.index,
            timestamp: block.timestamp,
            jumpId: block.jumpId,
            data: block.data,
            previousHash: block.previousHash,
            nonce: block.nonce
        });
        return await this.sha256(content);
    }

    // ── Inicjalizuj genesis jeśli trzeba ──
    async initGenesis() {
        if (!this.chain[0].hash) {
            this.chain[0].hash = await this.calculateHash(this.chain[0]);
            this.saveChain();
        }
    }

    // ══════════════════════════════════
    //  REJESTRACJA SKOKU
    // ══════════════════════════════════
    async registerJump(jumpData) {
        await this.initGenesis();

        const previousBlock = this.chain[this.chain.length - 1];
        
        const block = {
            index: previousBlock.index + 1,
            timestamp: new Date().toISOString(),
            jumpId: jumpData.jumpId,
            data: {
                // Dane skoku
                steps: jumpData.steps,
                distance: jumpData.distance,
                
                // Origin
                origin: {
                    gps: jumpData.gps,
                    timeline: jumpData.quantumSignature?.originTimeline || null,
                    sector: jumpData.quantumSignature?.multiverseSector || null
                },
                
                // Destination
                destination: {
                    timeline: jumpData.quantumSignature?.destTimeline || null
                },

                // Kwantowe
                coherenceIndex: jumpData.quantumSignature?.coherenceIndex || null,
                observerHash: jumpData.quantumSignature?.observerHash || null,
                entanglementState: jumpData.quantumSignature?.entanglementState || null,
                branchSignature: jumpData.quantumSignature?.branchSignature || null,

                // Selfie hash (nie samo zdjęcie — za duże)
                selfieHash: jumpData.selfieDataURL 
                    ? await this.sha256(jumpData.selfieDataURL.substring(0, 1000))
                    : null,

                // Certyfikat
                hasCertificate: true,

                // Environment
                userAgent: navigator.userAgent.substring(0, 100),
                screenRes: `${screen.width}x${screen.height}`,
                language: navigator.language
            },
            previousHash: previousBlock.hash,
            hash: null,
            nonce: 0
        };

        // Oblicz hash
        block.hash = await this.calculateHash(block);

        // Dodaj do chain
        this.chain.push(block);
        this.saveChain();

        console.log(`⛓️ Block #${block.index} added to Quantum Ledger`);
        console.log(`   Hash: ${block.hash}`);
        console.log(`   Previous: ${block.previousHash}`);

        return block;
    }

    // ══════════════════════════════════
    //  WERYFIKACJA CHAIN
    // ══════════════════════════════════
    async verifyChain() {
        await this.initGenesis();

        const results = {
            valid: true,
            blocks: this.chain.length,
            errors: []
        };

        for (let i = 1; i < this.chain.length; i++) {
            const current = this.chain[i];
            const previous = this.chain[i - 1];

            // Sprawdź hash
            const recalculated = await this.calculateHash(current);
            if (current.hash !== recalculated) {
                results.valid = false;
                results.errors.push({
                    block: i,
                    error: "HASH_MISMATCH",
                    expected: recalculated,
                    got: current.hash
                });
            }

            // Sprawdź linkowanie
            if (current.previousHash !== previous.hash) {
                results.valid = false;
                results.errors.push({
                    block: i,
                    error: "CHAIN_BROKEN",
                    expected: previous.hash,
                    got: current.previousHash
                });
            }
        }

        return results;
    }

    // ══════════════════════════════════
    //  POBIERZ BLOK PO JUMP ID
    // ══════════════════════════════════
    getBlock(jumpId) {
        return this.chain.find(b => b.jumpId === jumpId) || null;
    }

    // ══════════════════════════════════
    //  EKSPORT (gotowy do publication)
    // ══════════════════════════════════
    exportChain() {
        return {
            version: "3.0",
            protocol: "Quantum Teleportation Verification Protocol",
            chainLength: this.chain.length,
            exported: new Date().toISOString(),
            chain: this.chain
        };
    }

    // ══════════════════════════════════
    //  STATYSTYKI
    // ══════════════════════════════════
    getStats() {
        const jumps = this.chain.filter(b => b.jumpId !== "GENESIS");
        return {
            totalJumps: jumps.length,
            totalSteps: jumps.reduce((s, b) => s + (b.data?.steps || 0), 0),
            totalDistance: jumps.reduce((s, b) => s + (b.data?.distance || 0), 0),
            uniqueTimelines: new Set(
                jumps.map(b => b.data?.destination?.timeline).filter(Boolean)
            ).size,
            firstJump: jumps[0]?.timestamp || null,
            lastJump: jumps[jumps.length - 1]?.timestamp || null,
            chainIntegrity: "PENDING" // will be verified async
        };
    }
}

const ledger = new QuantumLedger();
