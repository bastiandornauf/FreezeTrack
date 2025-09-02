// Vereinfachte FreezeTrack App - genau nach Benutzeranforderungen
import { QRScanner } from './scanner.js';
import { db, Item } from './database.js';

class SimpleFreezeTrackApp {
    constructor() {
        this.scanner = null;
        this.lastItemName = '';
        this.lastLocation = '';
        this.isInitialized = false;
        
        this.initialize();
    }

    async initialize() {
        try {
            // UI-Elemente initialisieren
            this.initializeUI();
            
            // Scanner starten
            await this.initializeScanner();
            
            // Letzte Eingaben laden
            await this.loadLastEntries();
            
            // Inventar laden
            await this.loadInventory();
            
            this.isInitialized = true;
            this.updateStatus('Bereit zum Scannen...');
            
        } catch (error) {
            console.error('Initialisierung fehlgeschlagen:', error);
            this.updateStatus('Fehler beim Starten der App');
        }
    }

    initializeUI() {
        // Settings-Button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            console.log('Settings-Button gefunden, Event-Handler wird gesetzt');
            settingsBtn.addEventListener('click', (event) => {
                console.log('Settings-Button geklickt!');
                event.preventDefault();
                this.showSettings();
            });
        } else {
            console.error('Settings-Button nicht gefunden!');
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

            this.updateStatus('Kamera wird gestartet...');
            console.log('Scanner-Initialisierung gestartet');
            
            // Prüfe MediaDevices Support
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Browser unterstützt keine Kamera-API');
            }
            
            // Erst Kamera-Berechtigung anfordern
            console.log('Fordere Kamera-Berechtigung an...');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            // Video-Stream setzen
            videoElement.srcObject = stream;
            videoElement.play();
            
            this.updateStatus('Kamera verbunden - Initialisiere QR-Scanner...');
            console.log('Kamera-Stream aktiv');
            
            // QR-Scanner initialisieren
            this.scanner = new QRScanner(videoElement);
            
            this.scanner.onScan((code) => {
                console.log('QR-Code erkannt:', code);
                this.handleScan(code);
            });

            await this.scanner.start();
            this.updateStatus('✅ Kamera bereit - Scannen Sie einen QR-Code');
            console.log('QR-Scanner bereit');
            
        } catch (error) {
            console.error('Kamera-Fehler:', error);
            let errorMessage = 'Kamera-Fehler: ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Kamera-Berechtigung verweigert. Bitte in Browser-Einstellungen erlauben.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'Keine Kamera gefunden. Bitte Kamera anschließen.';
            } else if (error.name === 'NotReadableError') {
                errorMessage += 'Kamera bereits in Verwendung. Bitte andere Apps schließen.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage += 'Kamera wird vom Gerät nicht unterstützt.';
            } else if (error.message?.includes('HTTPS')) {
                errorMessage += 'HTTPS erforderlich für Kamera-Zugriff.';
            } else {
                errorMessage += error.message || 'Unbekannter Fehler';
            }
            
            this.updateStatus(errorMessage);
            
            // Fallback: Zeige Anweisungen
            this.showCameraInstructions();
        }
    }

    async loadLastEntries() {
        const settings = await db.getSettings();
        this.lastItemName = settings.lastItemName || '';
        this.lastLocation = settings.lastLocation || '';
    }

    // Smart-Modus: Automatische Erkennung von bekannt/unbekannt

    async handleScan(code) {
        try {
            // QR-Code validieren
            if (!this.isValidItemCode(code)) {
                this.showError('Ungültiger QR-Code');
                return;
            }

            this.updateStatus(`Scanne: ${code.slice(-8)}...`);

            // Item in Datenbank finden
            let item = await db.getItem(code);
            
            if (!item) {
                // NEUER ARTIKEL → EINFRIEREN
                this.updateStatus('Neuer Artikel - Einfrieren...');
                await this.showNewItemDialog(code);
            } else if (item.status === 'in_stock') {
                // BEKANNTER ARTIKEL IM LAGER → AUSFRIEREN/VERBRAUCHEN
                this.updateStatus('Bekannter Artikel - Ausfrieren...');
                await this.showConsumeConfirmation(item);
            } else {
                // ARTIKEL BEREITS VERBRAUCHT → WIEDER EINFRIEREN
                this.updateStatus('Verbrauchter Artikel - Wieder einfrieren...');
                await this.showExistingItemDialog(item);
            }

        } catch (error) {
            console.error('Scan-Verarbeitung fehlgeschlagen:', error);
            this.showError('Fehler beim Verarbeiten des Scans');
        }
    }

    async showNewItemDialog(itemId) {
        // Einfaches Overlay für neue Artikel
        const overlay = this.createOverlay();
        
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>🧊 Neuen Artikel einfrieren</h3>
                <p><strong>ID:</strong> ${itemId.slice(-8)}</p>
                
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" id="newItemName" value="${this.lastItemName}" placeholder="z.B. Hackfleisch, Erbsen..." autofocus>
                </div>
                
                <div class="form-group">
                    <label>Lagerort:</label>
                    <input type="text" id="newItemLocation" value="${this.lastLocation}" placeholder="z.B. Schublade 1, Fach A...">
                </div>
                
                <div class="form-group">
                    <label>Haltbarkeit:</label>
                    <div class="mhd-buttons">
                        <button class="mhd-btn" data-months="1">1 Monat</button>
                        <button class="mhd-btn active" data-months="3">3 Monate</button>
                        <button class="mhd-btn" data-months="6">6 Monate</button>
                        <button class="mhd-btn" data-months="12">12 Monate</button>
                    </div>
                </div>
                
                <div class="button-group">
                    <button id="cancelNewItem" class="btn-secondary">Abbrechen</button>
                    <button id="saveNewItem" class="btn-primary">Speichern & Einfrieren</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // MHD-Button-Handling
        let selectedMonths = 3;
        overlay.querySelectorAll('.mhd-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.mhd-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMonths = parseInt(btn.dataset.months);
            });
        });

        // Button-Events
        overlay.querySelector('#cancelNewItem').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });

        overlay.querySelector('#saveNewItem').addEventListener('click', async () => {
            const name = overlay.querySelector('#newItemName').value.trim();
            const location = overlay.querySelector('#newItemLocation').value.trim();
            
            if (!name) {
                alert('Bitte einen Namen eingeben');
                return;
            }

            // Item erstellen
            const expDate = db.calculateExpDate(new Date(), selectedMonths);
            const item = await db.addItem(itemId, {
                name: name,
                location: location,
                expDate: expDate
            });

            // Letzte Eingaben speichern
            await this.saveLastEntries(name, location);

            // Einlagern
            await this.handleAutoPlus(item);

            this.removeOverlay(overlay);
        });

        // Enter zum Speichern
        overlay.querySelector('#newItemName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                overlay.querySelector('#saveNewItem').click();
            }
        });
    }

    async showExistingItemDialog(item) {
        // Dialog für bestehende Artikel - ermöglicht Änderung von Name, Ort und MHD
        const overlay = this.createOverlay();
        
        // Aktuelle Einstellungen laden
        const settings = await db.getSettings();
        const currentMonths = this.getMonthsFromExpDate(item.expDate) || settings.defaultMonths || 6;
        
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>Artikel einlagern</h3>
                <p><strong>ID:</strong> ${item.shortId}</p>
                
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" id="existingItemName" value="${item.name || ''}" placeholder="z.B. Hackfleisch, Erbsen..." autofocus>
                </div>
                
                <div class="form-group">
                    <label>Lagerort:</label>
                    <input type="text" id="existingItemLocation" value="${item.location || settings.lastLocation || ''}" placeholder="z.B. Schublade 1, Fach A...">
                </div>
                
                <div class="form-group">
                    <label>Haltbarkeit:</label>
                    <div class="mhd-buttons">
                        <button class="mhd-btn ${currentMonths === 1 ? 'active' : ''}" data-months="1">1 Monat</button>
                        <button class="mhd-btn ${currentMonths === 3 ? 'active' : ''}" data-months="3">3 Monate</button>
                        <button class="mhd-btn ${currentMonths === 6 ? 'active' : ''}" data-months="6">6 Monate</button>
                        <button class="mhd-btn ${currentMonths === 12 ? 'active' : ''}" data-months="12">12 Monate</button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Aktuelles MHD: ${this.formatDate(item.expDate)}</label>
                </div>
                
                <div class="button-group">
                    <button id="cancelExistingItem" class="btn-secondary">Abbrechen</button>
                    <button id="updateAndStore" class="btn-primary">Aktualisieren & Einlagern</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // MHD-Button-Handling
        let selectedMonths = currentMonths;
        overlay.querySelectorAll('.mhd-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.mhd-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMonths = parseInt(btn.dataset.months);
            });
        });

        // Button-Events
        overlay.querySelector('#cancelExistingItem').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });

        overlay.querySelector('#updateAndStore').addEventListener('click', async () => {
            const name = overlay.querySelector('#existingItemName').value.trim();
            const location = overlay.querySelector('#existingItemLocation').value.trim();
            
            if (!name) {
                alert('Bitte einen Namen eingeben');
                return;
            }

            // Item aktualisieren
            const newExpDate = db.calculateExpDate(new Date(), selectedMonths);
            await db.updateItem(item.id, {
                name: name,
                location: location,
                expDate: newExpDate
            });

            // Letzte Eingaben speichern
            await this.saveLastEntries(name, location);

            // Einlagern
            const updatedItem = await db.getItem(item.id);
            await this.handleAutoPlus(updatedItem);

            this.removeOverlay(overlay);
        });

        // Enter zum Speichern
        overlay.querySelector('#existingItemName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                overlay.querySelector('#updateAndStore').click();
            }
        });
    }

    async showConsumeConfirmation(item) {
        const overlay = this.createOverlay();
        
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>🍽️ Artikel ausfrieren/verbrauchen?</h3>
                <div class="item-info">
                    <p><strong>Name:</strong> ${item.name || 'Unbenannt'}</p>
                    <p><strong>Ort:</strong> ${item.location || '-'}</p>
                    <p><strong>MHD:</strong> ${this.formatDate(item.expDate)}</p>
                    <p><strong>ID:</strong> ${item.shortId}</p>
                </div>
                
                <div class="button-group">
                    <button id="cancelConsume" class="btn-secondary">Abbrechen</button>
                    <button id="confirmConsume" class="btn-danger">🍽️ Ja, ausfrieren</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Button-Events
        overlay.querySelector('#cancelConsume').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });

        overlay.querySelector('#confirmConsume').addEventListener('click', async () => {
            await this.handleAutoMinus(item);
            this.removeOverlay(overlay);
        });
    }

    async handleAutoPlus(item) {
        // Status auf in_stock setzen und einlagern
        if (item.status === 'used') {
            await db.updateItem(item.id, { status: 'in_stock' });
        }
        
        await db.changeStock(item.id, 1);
        
        this.showFlash('green', `✓ ${item.name || item.shortId} eingelagert`);
        this.updateStatus(`Eingelagert: ${item.name || item.shortId}`);
        
        await this.loadInventory();
    }

    async handleAutoMinus(item) {
        if (item.status === 'in_stock') {
            await db.updateItem(item.id, { status: 'used' });
            await db.changeStock(item.id, -1);
            
            this.showFlash('red', `✓ ${item.name || item.shortId} verbraucht`);
            this.updateStatus(`Verbraucht: ${item.name || item.shortId}`);
            
            await this.loadInventory();
        } else {
            this.showError('Artikel bereits verbraucht');
        }
    }

    async saveLastEntries(name, location) {
        this.lastItemName = name;
        this.lastLocation = location;
        
        await db.updateSettings({
            lastItemName: name,
            lastLocation: location
        });
    }

    async loadInventory() {
        const items = await db.getInStockItems();
        
        if (items.length === 0) {
            this.inventoryList.innerHTML = '<p class="empty-state">Keine Artikel im Lager</p>';
            return;
        }

        // Nach MHD sortieren (älteste zuerst)
        items.sort((a, b) => new Date(a.expDate) - new Date(b.expDate));

        this.inventoryList.innerHTML = items.map(item => {
            const daysUntil = db.getDaysUntilExpiry(item.expDate);
            const isExpired = daysUntil < 0;
            const isExpiringSoon = daysUntil >= 0 && daysUntil <= 14;
            
            let statusClass = '';
            let statusText = '';
            
            if (isExpired) {
                statusClass = 'expired';
                statusText = `Abgelaufen vor ${Math.abs(daysUntil)} Tagen`;
            } else if (isExpiringSoon) {
                statusClass = 'expiring-soon';
                statusText = `Läuft in ${daysUntil} Tagen ab`;
            } else {
                statusText = `Läuft in ${daysUntil} Tagen ab`;
            }

            return `
                <div class="inventory-item ${statusClass}">
                    <div class="item-main">
                        <div class="item-name">${item.name || `Artikel ${item.shortId}`}</div>
                        <div class="item-details">
                            <span class="item-location">📍 ${item.location || 'Kein Ort'}</span>
                            <span class="item-id">🏷️ ${item.shortId}</span>
                            <span class="item-date">📅 ${item.inDate}</span>
                        </div>
                    </div>
                    <div class="item-status">
                        <div class="expiry-date">${this.formatDate(item.expDate)}</div>
                        <div class="expiry-status">${statusText}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Hilfsfunktionen
    createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = '<div class="overlay-content"></div>';
        return overlay;
    }

    removeOverlay(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    isValidItemCode(code) {
        return code && (code.startsWith('ITM:') || code.startsWith('ITEM:'));
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('de-DE');
    }

    getMonthsFromExpDate(expDate) {
        if (!expDate) return null;
        
        const now = new Date();
        const exp = new Date(expDate);
        const diffTime = exp - now;
        const diffMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.44)); // Durchschnittliche Tage pro Monat
        
        // Auf nächste verfügbare Auswahl runden
        if (diffMonths <= 1) return 1;
        if (diffMonths <= 3) return 3;
        if (diffMonths <= 6) return 6;
        return 12;
    }

    showFlash(color, message) {
        if (!this.flashOverlay) return;
        
        this.flashOverlay.className = `flash-overlay ${color}`;
        this.flashOverlay.textContent = message;
        this.flashOverlay.style.display = 'block';
        
        setTimeout(() => {
            this.flashOverlay.style.display = 'none';
        }, 2000);
    }

    showError(message) {
        this.showFlash('red', `⚠ ${message}`);
        this.updateStatus(`Fehler: ${message}`);
    }

    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
    }

    showCameraInstructions() {
        const overlay = this.createOverlay();
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>🎥 Kamera-Hilfe</h3>
                
                <div style="text-align: left; margin: 1.5rem 0;">
                    <h4>Mögliche Lösungen:</h4>
                    <ul style="margin-left: 1.5rem; line-height: 1.6;">
                        <li><strong>Browser-Berechtigung:</strong> Klicken Sie auf das Kamera-Symbol in der Adressleiste und erlauben Sie den Kamera-Zugriff</li>
                        <li><strong>HTTPS verwenden:</strong> Öffnen Sie die App über einen HTTPS-Server oder verwenden Sie Chrome mit --unsafely-treat-insecure-origin-as-secure</li>
                        <li><strong>Andere Apps schließen:</strong> Schließen Sie andere Apps die die Kamera verwenden (Zoom, Teams, etc.)</li>
                        <li><strong>Browser neustarten:</strong> Schließen Sie den Browser komplett und öffnen Sie ihn neu</li>
                        <li><strong>Kamera prüfen:</strong> Testen Sie die Kamera in einer anderen App</li>
                    </ul>
                </div>

                <div style="background: #e0e7ff; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                    <strong>💡 Tipp:</strong> Verwenden Sie Chrome oder Firefox für die beste Kompatibilität. Safari kann Probleme haben.
                </div>
                
                <div class="button-group">
                    <button id="retryCamera" class="btn-primary">🔄 Kamera erneut versuchen</button>
                    <button id="closeInstructions" class="btn-secondary">Schließen</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Button-Events
        overlay.querySelector('#retryCamera').addEventListener('click', async () => {
            this.removeOverlay(overlay);
            await this.initializeScanner();
        });

        overlay.querySelector('#closeInstructions').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });
    }

    async showSettings() {
        console.log('showSettings() aufgerufen');
        try {
            const settings = await db.getSettings();
            console.log('Settings geladen:', settings);
        
        // Overlay für Einstellungen erstellen
        const overlay = this.createOverlay();
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>Einstellungen</h3>
                
                <div class="form-group">
                    <label>Standard-Haltbarkeit:</label>
                    <div class="mhd-buttons">
                        <button class="mhd-btn ${settings.defaultMonths === 1 ? 'active' : ''}" data-months="1">1 Monat</button>
                        <button class="mhd-btn ${settings.defaultMonths === 3 ? 'active' : ''}" data-months="3">3 Monate</button>
                        <button class="mhd-btn ${settings.defaultMonths === 6 ? 'active' : ''}" data-months="6">6 Monate</button>
                        <button class="mhd-btn ${settings.defaultMonths === 12 ? 'active' : ''}" data-months="12">12 Monate</button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Standard-Lagerort:</label>
                    <input type="text" id="defaultLocation" value="${settings.lastLocation || ''}" placeholder="z.B. Schublade 1">
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="repeatMode" ${settings.repeatOn ? 'checked' : ''}> 
                        Letzte Eingaben wiederverwenden
                    </label>
                </div>
                
                <div class="button-group">
                    <button id="cancelSettings" class="btn-secondary">Abbrechen</button>
                    <button id="saveSettings" class="btn-primary">Speichern</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        let selectedMonths = settings.defaultMonths || 6;

        // MHD-Button-Handling
        overlay.querySelectorAll('.mhd-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.mhd-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMonths = parseInt(btn.dataset.months);
            });
        });

        // Button-Events
        overlay.querySelector('#cancelSettings').addEventListener('click', () => {
            this.removeOverlay(overlay);
        });

        overlay.querySelector('#saveSettings').addEventListener('click', async () => {
            const defaultLocation = overlay.querySelector('#defaultLocation').value.trim();
            const repeatOn = overlay.querySelector('#repeatMode').checked;
            
            await db.updateSettings({
                defaultMonths: selectedMonths,
                lastLocation: defaultLocation,
                repeatOn: repeatOn
            });
            
            this.showFlash('green', '✓ Einstellungen gespeichert');
            this.updateStatus('Einstellungen gespeichert');
            this.removeOverlay(overlay);
        });
        
        } catch (error) {
            console.error('Settings-Fehler:', error);
            alert('Fehler beim Laden der Einstellungen: ' + error.message);
        }
    }
}

// App starten
document.addEventListener('DOMContentLoaded', () => {
    window.freezeTrackApp = new SimpleFreezeTrackApp();
});

export { SimpleFreezeTrackApp };
