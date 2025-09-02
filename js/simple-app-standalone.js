// Standalone FreezeTrack App ohne ES6-Module
// Verwendet UMD-Versionen der Bibliotheken

// Database-System mit LocalForage
const db = {
    async init() {
        // LocalForage wird über CDN geladen
        if (typeof localforage === 'undefined') {
            // Fallback zu localStorage
            console.warn('LocalForage nicht verfügbar, nutze localStorage');
            this.storage = localStorage;
            this.useLocalStorage = true;
        } else {
            localforage.config({
                name: 'FreezeTrack',
                storeName: 'items'
            });
            this.storage = localforage;
            this.useLocalStorage = false;
        }
    },

    async getItem(id) {
        try {
            if (this.useLocalStorage) {
                const data = this.storage.getItem('item_' + id);
                return data ? JSON.parse(data) : null;
            }
            return await this.storage.getItem('item_' + id);
        } catch (error) {
            console.error('Fehler beim Laden des Items:', error);
            return null;
        }
    },

    async setItem(id, item) {
        try {
            if (this.useLocalStorage) {
                this.storage.setItem('item_' + id, JSON.stringify(item));
                return true;
            }
            return await this.storage.setItem('item_' + id, item);
        } catch (error) {
            console.error('Fehler beim Speichern des Items:', error);
            return false;
        }
    },

    async getSettings() {
        try {
            const defaults = {
                defaultMonths: 3,
                lastLocation: '',
                repeatOn: true
            };

            if (this.useLocalStorage) {
                const data = this.storage.getItem('settings');
                return data ? { ...defaults, ...JSON.parse(data) } : defaults;
            }
            const settings = await this.storage.getItem('settings');
            return settings ? { ...defaults, ...settings } : defaults;
        } catch (error) {
            console.error('Fehler beim Laden der Einstellungen:', error);
            return { defaultMonths: 3, lastLocation: '', repeatOn: true };
        }
    },

    async updateSettings(newSettings) {
        try {
            const current = await this.getSettings();
            const updated = { ...current, ...newSettings };
            
            if (this.useLocalStorage) {
                this.storage.setItem('settings', JSON.stringify(updated));
                return true;
            }
            return await this.storage.setItem('settings', updated);
        } catch (error) {
            console.error('Fehler beim Speichern der Einstellungen:', error);
            return false;
        }
    },

    async getAllItems() {
        try {
            const items = [];
            if (this.useLocalStorage) {
                for (let i = 0; i < this.storage.length; i++) {
                    const key = this.storage.key(i);
                    if (key && key.startsWith('item_')) {
                        const data = JSON.parse(this.storage.getItem(key));
                        items.push(data);
                    }
                }
            } else {
                await this.storage.iterate((value, key) => {
                    if (key.startsWith('item_')) {
                        items.push(value);
                    }
                });
            }
            return items;
        } catch (error) {
            console.error('Fehler beim Laden aller Items:', error);
            return [];
        }
    }
};

class SimpleFreezeTrackApp {
    constructor() {
        this.scanner = null;
        this.lastItemName = '';
        this.lastLocation = '';
        this.isInitialized = false;
        this.codeReader = null;
        
        this.initialize();
    }

    async initialize() {
        try {
            // iOS: Cache-Bereinigung für bessere Kamera-Kompatibilität
            if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                this.updateStatus('iOS erkannt - Optimiere Kamera...');
                // Kurze Verzögerung für iOS
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Database initialisieren
            await db.init();
            
            // UI-Elemente initialisieren
            this.initializeUI();
            
            // Scanner vorbereiten
            await this.initializeScanner();
            
            // Letzte Eingaben laden
            await this.loadLastEntries();
            
            this.isInitialized = true;
            this.updateStatus('Bereit zum Scannen...');
        } catch (error) {
            this.updateStatus('Fehler beim Starten der App');
        }
    }

    initializeUI() {
        // Haltbarkeits-Select
        this.haltbarkeitSelect = document.getElementById('defaultHaltbarkeit');
        if (this.haltbarkeitSelect) {
            this.haltbarkeitSelect.addEventListener('change', () => {
                this.saveDefaultHaltbarkeit();
            });
            this.loadDefaultHaltbarkeit();
        }

        // Status und Inventar
        this.statusElement = document.getElementById('status');
        this.inventoryList = document.getElementById('inventoryList');

        // Flash-Overlay
        this.flashOverlay = document.getElementById('flashOverlay');
    }

        async initializeScanner() {
        try {
            const videoElement = document.getElementById('scanner');
            if (!videoElement) {
                throw new Error('Video-Element nicht gefunden');
            }

            // Prüfe ZXing-Bibliothek
            if (typeof ZXingBrowser === 'undefined') {
                throw new Error('ZXing-Browser-Bibliothek nicht geladen');
            }

            this.updateStatus('Kamera wird aktiviert...');
            
            // PWA-optimierte Kamera-Einstellungen (iOS-kompatibel)
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const isChrome = /CriOS|Chrome/.test(navigator.userAgent);
            
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: isIOS ? { ideal: 1280, min: 320 } : { ideal: 1280, min: 640 },
                    height: isIOS ? { ideal: 720, min: 240 } : { ideal: 720, min: 480 },
                    aspectRatio: isIOS ? { ideal: 4/3 } : { ideal: 16/9 },
                    frameRate: { ideal: 30, min: 15 }
                },
                audio: false
            };
            
            // Chrome auf iOS: Einfachere Constraints
            if (isIOS && isChrome) {
                constraints.video = {
                    facingMode: 'environment',
                    width: { ideal: 640, min: 320 },
                    height: { ideal: 480, min: 240 }
                };
            }
            
            // Kamera-Zugriff anfordern (mit iOS-spezifischer Fehlerbehandlung)
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (initialError) {
                // iOS: Versuche es mit einfacheren Constraints
                if (isIOS) {
                    console.log('iOS: Versuche einfachere Kamera-Constraints...');
                    const fallbackConstraints = {
                        video: {
                            facingMode: 'environment',
                            width: { ideal: 640, min: 320 },
                            height: { ideal: 480, min: 240 }
                        },
                        audio: false
                    };
                    
                    try {
                        stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                    } catch (fallbackError) {
                        // Letzter Versuch: Minimale Constraints
                        const minimalConstraints = {
                            video: { facingMode: 'environment' },
                            audio: false
                        };
                        stream = await navigator.mediaDevices.getUserMedia(minimalConstraints);
                    }
                } else {
                    throw initialError;
                }
            }
            
            // Video-Stream setzen
            videoElement.srcObject = stream;
            
            // PWA-spezifische Video-Eigenschaften (iOS-optimiert)
            videoElement.setAttribute('playsinline', 'true');
            videoElement.setAttribute('webkit-playsinline', 'true');
            videoElement.setAttribute('x-webkit-airplay', 'allow');
            videoElement.muted = true;
            videoElement.autoplay = true;
            
            // iOS-spezifische Optimierungen
            if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                videoElement.style.transform = 'scaleX(-1)'; // Spiegelung für iOS
                videoElement.style.webkitTransform = 'scaleX(-1)';
            }
            
            // Warte auf Video-Element bereit
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Video-Timeout nach 10 Sekunden'));
                }, isIOS && isChrome ? 15000 : 10000); // Chrome iOS braucht länger
                
                videoElement.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    videoElement.play().then(resolve).catch(reject);
                };
                
                videoElement.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Video-Fehler beim Laden'));
                };
            });
            
            this.updateStatus('Kamera verbunden - Initialisiere QR-Scanner...');
            
            // QR-Scanner initialisieren
            this.codeReader = new ZXingBrowser.BrowserQRCodeReader();
            
            // Scanner starten
            await this.codeReader.decodeFromVideoDevice(
                null, // Erste verfügbare Kamera
                videoElement,
                (result, error) => {
                    if (result && !error) {
                        this.handleScan(result.text);
                    }
                    // Fehler werden ignoriert (normal bei QR-Scanning)
                }
            );

            this.updateStatus('Bereit zum Scannen...');

        } catch (error) {
            if (error.name === 'NotAllowedError') {
                this.updateStatus('❌ Kamera-Zugriff verweidert');
            } else if (error.name === 'NotFoundError') {
                this.updateStatus('❌ Keine Kamera gefunden');
            } else if (error.name === 'NotReadableError') {
                this.updateStatus('❌ Kamera wird bereits verwendet');
            } else if (error.name === 'NotSupportedError') {
                this.updateStatus('❌ Kamera nicht unterstützt');
            } else if (error.message.includes('Video-Timeout')) {
                if (isIOS && isChrome) {
                    this.updateStatus('❌ Chrome iOS Timeout - Safari verwenden');
                } else {
                    this.updateStatus('❌ Kamera-Timeout - PWA neu starten');
                }
            } else if (error.message.includes('Video-Fehler')) {
                if (isIOS && isChrome) {
                    this.updateStatus('❌ Chrome iOS Video-Fehler - Safari verwenden');
                } else {
                    this.updateStatus('❌ Video-Fehler - Browser neu laden');
                }
            } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                this.updateStatus('❌ HTTPS erforderlich');
            } else {
                this.updateStatus('❌ Kamera-Fehler: ' + error.message);
            }
            
            // Fallback: Zeige Anweisungen
            this.showCameraInstructions();
        }
    }

    async loadLastEntries() {
        const settings = await db.getSettings();
        this.lastItemName = settings.lastItemName || '';
        this.lastLocation = settings.lastLocation || '';
    }

    async loadDefaultHaltbarkeit() {
        const settings = await db.getSettings();
        const defaultMonths = settings.defaultMonths || 3;
        if (this.haltbarkeitSelect) {
            this.haltbarkeitSelect.value = defaultMonths.toString();
        }
    }

    async saveDefaultHaltbarkeit() {
        if (this.haltbarkeitSelect) {
            const months = parseInt(this.haltbarkeitSelect.value);
            await db.updateSettings({ defaultMonths: months });
        }
    }

    getCurrentHaltbarkeit() {
        return this.haltbarkeitSelect ? parseInt(this.haltbarkeitSelect.value) : 3;
    }

    // Smart-Modus: Automatische Erkennung von bekannt/unbekannt
    async handleScan(code) {
        try {
            this.showFlash('blue');
            this.updateStatus('Code erkannt: ' + code);
            
            // Versuche Item aus der Datenbank zu laden
            const item = await db.getItem(code);
            
            if (!item) {
                // Neues Item -> Einfrieren
                this.showNewItemDialog(code);
            } else if (item.status === 'in_stock') {
                // Bekanntes Item im Lager -> Ausfrieren/Verbrauchen
                this.showConsumeConfirmation(item);
            } else {
                // Bekanntes Item bereits verbraucht -> Wieder einfrieren
                this.showExistingItemDialog(item);
            }

        } catch (error) {
            this.updateStatus('Fehler beim Verarbeiten des Codes');
        }
    }

    showNewItemDialog(itemId) {
        const overlay = this.createOverlay();
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>🧊 Neuen Artikel einfrieren</h3>
                <p><strong>Code:</strong> ${itemId}</p>
                
                <div class="form-group">
                    <label>Name/Label:</label>
                    <input type="text" id="newItemName" value="${this.lastItemName}" placeholder="z.B. Hackfleisch, Gemüse-Mix...">
                </div>
                
                <div class="form-group">
                    <label>Lagerort:</label>
                    <input type="text" id="newItemLocation" value="${this.lastLocation}" placeholder="z.B. Schublade 1, Fach A...">
                </div>
                
                <div class="form-group">
                    <label for="haltbarkeitSelect">Haltbarkeit:</label>
                    <select id="haltbarkeitSelect" style="padding: 0.75rem; border: 2px solid #d1d5db; border-radius: 8px; font-size: 1rem; width: 100%;">
                        <option value="1" ${this.getCurrentHaltbarkeit() === 1 ? 'selected' : ''}>1 Monat</option>
                        <option value="3" ${this.getCurrentHaltbarkeit() === 3 ? 'selected' : ''}>3 Monate</option>
                        <option value="6" ${this.getCurrentHaltbarkeit() === 6 ? 'selected' : ''}>6 Monate</option>
                        <option value="12" ${this.getCurrentHaltbarkeit() === 12 ? 'selected' : ''}>12 Monate</option>
                    </select>
                </div>
                
                <div class="button-group dialog-button-group">
                    <button id="cancelNewItem" class="btn-secondary dialog-button-large">❌ Abbrechen</button>
                    <button id="saveNewItem" class="btn-primary dialog-button-large">🧊 Speichern & Einfrieren</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Haltbarkeits-Dropdown
        const haltbarkeitSelect = overlay.querySelector('#haltbarkeitSelect');

        // Button-Events
        overlay.querySelector('#cancelNewItem').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });

        overlay.querySelector('#saveNewItem').addEventListener('click', async () => {
            const name = overlay.querySelector('#newItemName').value.trim();
            const location = overlay.querySelector('#newItemLocation').value.trim();
            
            if (!name) {
                alert('Bitte geben Sie einen Namen ein.');
                return;
            }

            const selectedMonths = parseInt(haltbarkeitSelect.value);
            const expDate = this.calculateExpDate(selectedMonths);
            
            const item = {
                id: itemId,
                shortId: itemId.slice(-8),
                name: name,
                location: location,
                inDate: new Date().toISOString().split('T')[0],
                expDate: expDate,
                status: 'in_stock',
                notes: '',
                createdAt: new Date().toISOString()
            };

            await db.setItem(itemId, item);
            
            // Letzte Eingaben speichern
            await db.updateSettings({
                lastItemName: name,
                lastLocation: location
            });
            
            this.lastItemName = name;
            this.lastLocation = location;
            
            this.showFlash('green', '✓ Artikel eingefroren');
            this.updateStatus(`${name} wurde eingefroren`);
            this.removeOverlay(overlay);
        });
    }

    showConsumeConfirmation(item) {
        const overlay = this.createOverlay();
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>🍽️ Artikel ausfrieren/verbrauchen?</h3>
                <div class="item-info">
                    <p><strong>Name:</strong> ${item.name}</p>
                    <p><strong>Ort:</strong> ${item.location}</p>
                    <p><strong>Eingefroren:</strong> ${item.inDate}</p>
                    <p><strong>Haltbar bis:</strong> ${item.expDate}</p>
                </div>
                
                <div class="button-group dialog-button-group">
                    <button id="cancelConsume" class="btn-secondary dialog-button-large">❌ Abbrechen</button>
                    <button id="confirmConsume" class="btn-primary dialog-button-large">🍽️ Ja, ausfrieren</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#cancelConsume').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });

        overlay.querySelector('#confirmConsume').addEventListener('click', async () => {
            item.status = 'used';
            item.usedDate = new Date().toISOString().split('T')[0];
            
            await db.setItem(item.id, item);
            
            this.showFlash('orange', '🍽️ Artikel verbraucht');
            this.updateStatus(`${item.name} wurde als verbraucht markiert`);
            this.removeOverlay(overlay);
        });
    }

    showExistingItemDialog(item) {
        // Berechne aktuelle Monate aus dem gespeicherten expDate
        const currentMonths = this.getMonthsFromExpDate(item.expDate);
        
        const overlay = this.createOverlay();
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>🧊 Artikel wieder einfrieren</h3>
                <p><strong>Code:</strong> ${item.id}</p>
                
                <div class="form-group">
                    <label>Name/Label:</label>
                    <input type="text" id="existingItemName" value="${item.name}" placeholder="z.B. Hackfleisch, Gemüse-Mix...">
                </div>
                
                <div class="form-group">
                    <label>Lagerort:</label>
                    <input type="text" id="existingItemLocation" value="${item.location}" placeholder="z.B. Schublade 1, Fach A...">
                </div>
                
                <div class="form-group">
                    <label for="haltbarkeitSelectExisting">Haltbarkeit:</label>
                    <select id="haltbarkeitSelectExisting" style="padding: 0.75rem; border: 2px solid #d1d5db; border-radius: 8px; font-size: 1rem; width: 100%;">
                        <option value="1" ${currentMonths === 1 ? 'selected' : ''}>1 Monat</option>
                        <option value="3" ${currentMonths === 3 ? 'selected' : ''}>3 Monate</option>
                        <option value="6" ${currentMonths === 6 ? 'selected' : ''}>6 Monate</option>
                        <option value="12" ${currentMonths === 12 ? 'selected' : ''}>12 Monate</option>
                    </select>
                </div>
                
                <div class="button-group dialog-button-group">
                    <button id="cancelExisting" class="btn-secondary dialog-button-large">❌ Abbrechen</button>
                    <button id="saveExisting" class="btn-primary dialog-button-large">🧊 Wieder einfrieren</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Haltbarkeits-Dropdown
        const haltbarkeitSelectExisting = overlay.querySelector('#haltbarkeitSelectExisting');

        // Button-Events
        overlay.querySelector('#cancelExisting').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });

        overlay.querySelector('#saveExisting').addEventListener('click', async () => {
            const name = overlay.querySelector('#existingItemName').value.trim();
            const location = overlay.querySelector('#existingItemLocation').value.trim();
            
            if (!name) {
                alert('Bitte geben Sie einen Namen ein.');
                return;
            }

            // Item aktualisieren
            const selectedMonths = parseInt(haltbarkeitSelectExisting.value);
            item.name = name;
            item.location = location;
            item.inDate = new Date().toISOString().split('T')[0];
            item.expDate = this.calculateExpDate(selectedMonths);
            item.status = 'in_stock';
            delete item.usedDate;

            await db.setItem(item.id, item);
            
            this.showFlash('green', '✓ Artikel wieder eingefroren');
            this.updateStatus(`${name} wurde wieder eingefroren`);
            this.removeOverlay(overlay);
        });
    }

    calculateExpDate(months) {
        const date = new Date();
        date.setMonth(date.getMonth() + months);
        return date.toISOString().split('T')[0];
    }

    getMonthsFromExpDate(expDate) {
        const exp = new Date(expDate);
        const now = new Date();
        const diffMonths = Math.round((exp - now) / (1000 * 60 * 60 * 24 * 30));
        
        // Runde auf nächste Standard-Option
        if (diffMonths <= 2) return 1;
        if (diffMonths <= 4) return 3;
        if (diffMonths <= 9) return 6;
        return 12;
    }

    showCameraInstructions() {
        const overlay = this.createOverlay();
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>📱 Kamera-Probleme?</h3>
                <div class="instructions">
                    <h4>Mögliche Lösungen:</h4>
                    <ul>
                        <li>🔒 <strong>Berechtigung:</strong> Kamera-Zugriff in den Browser-Einstellungen erlauben</li>
                        <li>📱 <strong>PWA neu starten:</strong> App komplett schließen und neu öffnen</li>
                        <li>🔄 <strong>Browser neu laden:</strong> Seite einmal neu laden</li>
                        <li>🔐 <strong>HTTPS:</strong> Nur über HTTPS oder localhost möglich</li>
                        <li>📷 <strong>Hardware:</strong> Andere Apps schließen, die die Kamera nutzen</li>
                        <li>⚡ <strong>Cache leeren:</strong> Browser-Cache für diese Seite löschen</li>
                    </ul>
                    <p><strong>PWA-Tipp:</strong> Installierte Apps haben manchmal andere Kamera-Berechtigungen als der Browser.</p>
                    <p><strong>iOS-Tipp:</strong> Auf iPhone/iPad: App komplett schließen, Safari-Einstellungen → Website-Daten → FreezeTrack löschen, dann neu installieren.</p>
                    <p><strong>Chrome iOS:</strong> Chrome auf iOS hat eingeschränkte PWA-Unterstützung. Verwenden Sie Safari für die beste Erfahrung.</p>
                </div>
                
                <div class="button-group">
                    <button id="retryCamera" class="btn-primary">🔄 Kamera erneut versuchen</button>
                    <button id="closeInstructions" class="btn-secondary">Schließen</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#retryCamera').addEventListener('click', async () => {
            this.removeOverlay(overlay);
            this.updateStatus('Kamera wird neu gestartet...');
            
            // iOS: Kurze Verzögerung für bessere Kompatibilität
            if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            await this.initializeScanner();
        });

        overlay.querySelector('#closeInstructions').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });
    }

    // UI-Hilfsmethoden
    createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        return overlay;
    }

    removeOverlay(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
    }

    showFlash(color, message = '') {
        if (!this.flashOverlay) return;
        
        this.flashOverlay.className = 'flash';
        this.flashOverlay.style.backgroundColor = color === 'green' ? '#22c55e' :
                                                  color === 'blue' ? '#3b82f6' :
                                                  color === 'orange' ? '#f59e0b' : '#ef4444';
        
        if (message) {
            this.flashOverlay.textContent = message;
            this.flashOverlay.style.display = 'flex';
            this.flashOverlay.style.alignItems = 'center';
            this.flashOverlay.style.justifyContent = 'center';
            this.flashOverlay.style.color = 'white';
            this.flashOverlay.style.fontSize = '1.5rem';
            this.flashOverlay.style.fontWeight = 'bold';
        }
        
        this.flashOverlay.classList.remove('hidden');
        
        setTimeout(() => {
            this.flashOverlay.classList.add('hidden');
            if (message) {
                this.flashOverlay.textContent = '';
                this.flashOverlay.style.display = '';
            }
        }, 1500);
    }
}

// App starten sobald DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
            // LocalForage über CDN laden falls nicht vorhanden
        if (typeof localforage === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/localforage@1.10.0/dist/localforage.min.js';
            script.onload = () => {
                window.freezeTrackApp = new SimpleFreezeTrackApp();
            };
            script.onerror = () => {
                // Fallback zu localStorage
                window.freezeTrackApp = new SimpleFreezeTrackApp();
            };
            document.head.appendChild(script);
        } else {
            window.freezeTrackApp = new SimpleFreezeTrackApp();
        }
});
