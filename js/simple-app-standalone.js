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
            console.log('SimpleFreezeTrackApp initialisiert');
        } catch (error) {
            console.error('Initialisierung fehlgeschlagen:', error);
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
            console.log('Initialisiere QR-Scanner...');

            // Kamera-Zugriff anfordern
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            // Video-Stream setzen
            videoElement.srcObject = stream;
            
            // Warte auf Video-Element bereit
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    console.log('Video-Metadaten geladen');
                    videoElement.play().then(resolve).catch(console.error);
                };
            });
            
            this.updateStatus('Kamera verbunden - Initialisiere QR-Scanner...');
            console.log('Kamera-Stream aktiv');
            
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

            console.log('QR-Scanner erfolgreich gestartet');
            this.updateStatus('Bereit zum Scannen...');

        } catch (error) {
            console.error('Scanner-Initialisierung fehlgeschlagen:', error);
            
            if (error.name === 'NotAllowedError') {
                this.updateStatus('❌ Kamera-Zugriff verweigert');
            } else if (error.name === 'NotFoundError') {
                this.updateStatus('❌ Keine Kamera gefunden');
            } else if (error.name === 'NotReadableError') {
                this.updateStatus('❌ Kamera wird bereits verwendet');
            } else if (error.name === 'NotSupportedError') {
                this.updateStatus('❌ Kamera nicht unterstützt');
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
            console.log('Standard-Haltbarkeit gespeichert:', months, 'Monate');
        }
    }

    getCurrentHaltbarkeit() {
        return this.haltbarkeitSelect ? parseInt(this.haltbarkeitSelect.value) : 3;
    }

    // Smart-Modus: Automatische Erkennung von bekannt/unbekannt
    async handleScan(code) {
        try {
            console.log('QR-Code gescannt:', code);
            this.showFlash('blue');
            this.updateStatus('Code erkannt: ' + code);
            
            // Versuche Item aus der Datenbank zu laden
            const item = await db.getItem(code);
            
            if (!item) {
                // Neues Item -> Einfrieren
                console.log('Unbekannter QR-Code -> Einfrieren');
                this.showNewItemDialog(code);
            } else if (item.status === 'in_stock') {
                // Bekanntes Item im Lager -> Ausfrieren/Verbrauchen
                console.log('Bekanntes Item im Lager -> Ausfrieren');
                this.showConsumeConfirmation(item);
            } else {
                // Bekanntes Item bereits verbraucht -> Wieder einfrieren
                console.log('Bekanntes Item verbraucht -> Wieder einfrieren');
                this.showExistingItemDialog(item);
            }

        } catch (error) {
            console.error('Scan-Fehler:', error);
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
                        <li>🔄 <strong>Neuladen:</strong> Seite einmal neu laden</li>
                        <li>📱 <strong>Mobile:</strong> App über "Zum Startbildschirm hinzufügen" installieren</li>
                        <li>🔐 <strong>HTTPS:</strong> Nur über HTTPS oder localhost möglich</li>
                        <li>📷 <strong>Hardware:</strong> Andere Apps schließen, die die Kamera nutzen</li>
                    </ul>
                    <p><strong>Tipp:</strong> Nutzen Sie den "🧪 Test-Scan" Button zum Testen ohne Kamera.</p>
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
        console.log('Status:', message);
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
        console.warn('LocalForage nicht verfügbar - wird nachgeladen...');
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/localforage@1.10.0/dist/localforage.min.js';
        script.onload = () => {
            console.log('LocalForage nachgeladen');
            window.freezeTrackApp = new SimpleFreezeTrackApp();
        };
        script.onerror = () => {
            console.warn('LocalForage konnte nicht geladen werden, nutze localStorage');
            window.freezeTrackApp = new SimpleFreezeTrackApp();
        };
        document.head.appendChild(script);
    } else {
        window.freezeTrackApp = new SimpleFreezeTrackApp();
    }
});
