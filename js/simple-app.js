// Vereinfachte FreezeTrack App - genau nach Benutzeranforderungen
import { QRScanner } from './scanner.js';
import { db, Item } from './database.js';

class SimpleFreezeTrackApp {
    constructor() {
        this.scanner = null;
        this.currentMode = 'autoPlus';
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
        // Modus-Umschalter
        this.modeButtons = document.querySelectorAll('.mode-btn');
        this.modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setMode(btn.dataset.mode);
            });
        });

        // Status und Inventar
        this.statusElement = document.getElementById('status');
        this.inventoryList = document.getElementById('inventoryList');

        // Flash-Overlay
        this.flashOverlay = document.getElementById('flashOverlay');
    }

    async initializeScanner() {
        const videoElement = document.getElementById('scanner');
        this.scanner = new QRScanner(videoElement);
        
        this.scanner.onScan((code) => {
            this.handleScan(code);
        });

        await this.scanner.start();
    }

    async loadLastEntries() {
        const settings = await db.getSettings();
        this.lastItemName = settings.lastItemName || '';
        this.lastLocation = settings.lastLocation || '';
    }

    setMode(mode) {
        this.currentMode = mode;
        
        // UI aktualisieren
        this.modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Status aktualisieren
        const modeNames = {
            'autoPlus': 'Einfrieren (+1)',
            'autoMinus': 'Verbrauchen (-1)'
        };
        
        this.updateStatus(`${modeNames[mode]} - Bereit zum Scannen...`);
    }

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
            
            if (!item && this.currentMode === 'autoPlus') {
                // Neues Item - Dialog anzeigen
                await this.showNewItemDialog(code);
                return;
            } else if (!item && this.currentMode === 'autoMinus') {
                this.showError('Artikel nicht gefunden');
                return;
            }

            // Je nach Modus handeln
            if (this.currentMode === 'autoPlus') {
                await this.handleAutoPlus(item);
            } else if (this.currentMode === 'autoMinus') {
                await this.showConsumeConfirmation(item);
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
                <h3>Neuer Artikel</h3>
                <p>ID: ${itemId}</p>
                <p>Kurz-ID: ${itemId.slice(-8)}</p>
                
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

    async showConsumeConfirmation(item) {
        const overlay = this.createOverlay();
        
        overlay.innerHTML = `
            <div class="dialog-content">
                <h3>Artikel verbrauchen?</h3>
                <div class="item-info">
                    <p><strong>Name:</strong> ${item.name || 'Unbenannt'}</p>
                    <p><strong>Ort:</strong> ${item.location || '-'}</p>
                    <p><strong>MHD:</strong> ${this.formatDate(item.expDate)}</p>
                    <p><strong>ID:</strong> ${item.shortId}</p>
                </div>
                
                <div class="button-group">
                    <button id="cancelConsume" class="btn-secondary">Abbrechen</button>
                    <button id="confirmConsume" class="btn-danger">Ja, verbrauchen</button>
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
                        <div class="item-name">${item.name || 'Unbenannt'}</div>
                        <div class="item-details">
                            <span class="item-location">${item.location || '-'}</span>
                            <span class="item-id">${item.shortId}</span>
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
}

// App starten
document.addEventListener('DOMContentLoaded', () => {
    window.freezeTrackApp = new SimpleFreezeTrackApp();
});

export { SimpleFreezeTrackApp };
