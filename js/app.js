import { QRScanner } from './scanner.js';
import { db, Item } from './database.js';

class FreezeTrackApp {
    constructor() {
        this.scanner = null;
        this.currentMode = 'autoPlus';
        this.lastScannedItem = null;
        this.dialogItem = null;
        this.isInitialized = false;
        
        this.initialize();
    }

    async initialize() {
        try {
            // UI-Elemente initialisieren
            this.initializeUI();
            
            // Scanner starten
            await this.initializeScanner();
            
            // Daten laden
            await this.loadInventory();
            
            // Service Worker registrieren
            this.registerServiceWorker();
            
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

        // Control-Buttons
        this.undoBtn = document.getElementById('undoBtn');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.exportBtn = document.getElementById('exportBtn');

        this.undoBtn.addEventListener('click', () => this.undoLastMove());
        this.settingsBtn.addEventListener('click', () => this.showSettings());
        this.exportBtn.addEventListener('click', () => this.exportData());

        // Dialog-Elemente
        this.dialogOverlay = document.getElementById('dialogOverlay');
        this.dialogTitle = document.getElementById('dialogTitle');
        this.dialogInfo = document.getElementById('dialogInfo');
        this.quantityInput = document.getElementById('quantityInput');

        // Flash-Overlay
        this.flashOverlay = document.getElementById('flashOverlay');

        // Status und Inventar
        this.statusElement = document.getElementById('status');
        this.inventoryList = document.getElementById('inventoryList');
    }

    async initializeScanner() {
        const videoElement = document.getElementById('scanner');
        this.scanner = new QRScanner(videoElement);
        
        this.scanner.onScan((code) => {
            this.handleScan(code);
        });

        await this.scanner.start();
    }

    setMode(mode) {
        this.currentMode = mode;
        
        // UI aktualisieren
        this.modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Status aktualisieren
        const modeNames = {
            'autoPlus': 'Auto +1 (Einlagern)',
            'autoMinus': 'Auto -1 (Entnehmen)',
            'dialog': 'Dialog-Modus'
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

            this.updateStatus(`Scanne: ${code.slice(-5)}...`);

            // Item in Datenbank finden oder erstellen
            let item = await db.getItem(code);
            if (!item) {
                // Neues Item erstellen
                const settings = await db.getSettings();
                const expDate = db.calculateExpDate(new Date(), settings.defaultMonths || 6);
                
                item = await db.addItem(code, {
                    expDate: expDate,
                    location: await this.getDefaultLocation()
                });
                
                this.updateStatus(`Neues Item erstellt: ${code.slice(-5)}`);
            }

            this.lastScannedItem = item;

            // Je nach Modus handeln
            switch (this.currentMode) {
                case 'autoPlus':
                    await this.handleAutoPlus(item);
                    break;
                case 'autoMinus':
                    await this.handleAutoMinus(item);
                    break;
                case 'dialog':
                    await this.showDialog(item);
                    break;
            }

        } catch (error) {
            console.error('Scan-Verarbeitung fehlgeschlagen:', error);
            this.showError('Fehler beim Verarbeiten des Scans');
        }
    }

    async handleAutoPlus(item) {
        await db.changeStock(item.id, 1);
        this.showSuccess(`+1 ${item.name || item.shortId} eingelagert`);
        await this.loadInventory();
    }

    async handleAutoMinus(item) {
        if (item.status === 'used') {
            this.showWarning('Artikel bereits entnommen');
            return;
        }
        
        await db.changeStock(item.id, -1);
        this.showSuccess(`-1 ${item.name || item.shortId} entnommen`);
        await this.loadInventory();
    }

    async showDialog(item) {
        this.dialogItem = item;
        
        this.dialogTitle.textContent = item.name || `Artikel ${item.shortId}`;
        this.dialogInfo.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <strong>ID:</strong> ${item.shortId}<br>
                <strong>Ort:</strong> ${item.location || 'Nicht gesetzt'}<br>
                <strong>Status:</strong> ${item.status === 'in_stock' ? 'Verfügbar' : 'Entnommen'}
            </div>
        `;
        
        this.quantityInput.value = '';
        this.quantityInput.focus();
        
        this.dialogOverlay.style.display = 'flex';
    }

    async confirmDialog() {
        const quantity = parseInt(this.quantityInput.value) || 0;
        
        if (quantity === 0) {
            this.closeDialog();
            return;
        }

        if (quantity < 0 && this.dialogItem.status === 'used') {
            this.showWarning('Artikel bereits entnommen');
            return;
        }

        await db.changeStock(this.dialogItem.id, quantity);
        
        const action = quantity > 0 ? 'eingelagert' : 'entnommen';
        this.showSuccess(`${Math.abs(quantity)}x ${this.dialogItem.name || this.dialogItem.shortId} ${action}`);
        
        this.closeDialog();
        await this.loadInventory();
    }

    closeDialog() {
        this.dialogOverlay.style.display = 'none';
        this.dialogItem = null;
    }

    async undoLastMove() {
        try {
            const success = await db.undoLastMove();
            if (success) {
                this.showSuccess('Letzte Aktion rückgängig gemacht');
                await this.loadInventory();
            } else {
                this.showWarning('Keine Aktion zum Rückgängigmachen verfügbar');
            }
        } catch (error) {
            console.error('UNDO fehlgeschlagen:', error);
            this.showError('UNDO fehlgeschlagen');
        }
    }

    async loadInventory() {
        try {
            const items = await db.getInStockItems();
            this.renderInventory(items);
        } catch (error) {
            console.error('Inventar laden fehlgeschlagen:', error);
        }
    }

    renderInventory(items) {
        if (!this.inventoryList) return;

        if (items.length === 0) {
            this.inventoryList.innerHTML = '<p style="text-align: center; color: #6b7280;">Keine Artikel im Lager</p>';
            return;
        }

        const html = items.map(item => {
            const expClass = db.isExpired(item.expDate) ? 'exp-warning' : 
                           db.isExpiringSoon(item.expDate) ? 'exp-soon' : '';
            
            const expText = item.expDate ? 
                (db.isExpired(item.expDate) ? 'Abgelaufen' : 
                 db.isExpiringSoon(item.expDate) ? `${db.getDaysUntilExpiry(item.expDate)} Tage` : 
                 item.expDate) : 'Nicht gesetzt';

            return `
                <div class="item">
                    <div class="item-header">
                        <span class="item-name">${item.name || item.shortId}</span>
                        <span class="item-location">${item.location || 'Kein Ort'}</span>
                    </div>
                    <div class="item-details">
                        <span>ID: ${item.shortId}</span>
                        <span>Einlagerung: ${item.inDate}</span>
                        <span class="${expClass}">MHD: ${expText}</span>
                    </div>
                </div>
            `;
        }).join('');

        this.inventoryList.innerHTML = html;
    }

    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
    }

    showSuccess(message) {
        this.updateStatus(message);
        this.flash('green');
        this.playBeep('success');
    }

    showWarning(message) {
        this.updateStatus(message);
        this.flash('yellow');
        this.playBeep('warning');
    }

    showError(message) {
        this.updateStatus(message);
        this.flash('red');
        this.playBeep('error');
    }

    flash(color) {
        this.flashOverlay.className = `flash ${color}`;
        this.flashOverlay.classList.remove('hidden');
        
        setTimeout(() => {
            this.flashOverlay.classList.add('hidden');
        }, 300);
    }

    playBeep(type) {
        // Einfache Audio-Feedback-Implementierung
        // In einer echten App würden hier echte Töne abgespielt
        console.log(`Beep: ${type}`);
    }

    isValidItemCode(code) {
        // Einfache Validierung: Code sollte mit "ITM:" beginnen
        return code && code.startsWith('ITM:') && code.length > 10;
    }

    async getDefaultLocation() {
        // Standard-Ort aus Einstellungen oder null
        return null;
    }

    async showSettings() {
        const settings = await db.getSettings();
        
        // Overlay für Einstellungen erstellen
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
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
            document.body.removeChild(overlay);
        });

        overlay.querySelector('#saveSettings').addEventListener('click', async () => {
            const defaultLocation = overlay.querySelector('#defaultLocation').value.trim();
            const repeatOn = overlay.querySelector('#repeatMode').checked;
            
            await db.updateSettings({
                defaultMonths: selectedMonths,
                lastLocation: defaultLocation,
                repeatOn: repeatOn
            });
            
            this.showSuccess('Einstellungen gespeichert');
            document.body.removeChild(overlay);
        });
    }

    async exportData() {
        try {
            const data = await db.exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `freezetrack-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.showSuccess('Daten exportiert');
        } catch (error) {
            console.error('Export fehlgeschlagen:', error);
            this.showError('Export fehlgeschlagen');
        }
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('Service Worker registriert:', registration);
                })
                .catch(error => {
                    console.error('Service Worker Registrierung fehlgeschlagen:', error);
                });
        }
    }
}

// Globale Funktionen für HTML-Event-Handler
window.closeDialog = function() {
    if (window.app) {
        window.app.closeDialog();
    }
};

window.confirmDialog = function() {
    if (window.app) {
        window.app.confirmDialog();
    }
};

// App starten wenn DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FreezeTrackApp();
});

// PWA-Installation
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Install-Button anzeigen (optional)
    console.log('PWA kann installiert werden');
});

window.addEventListener('appinstalled', () => {
    console.log('PWA wurde installiert');
    deferredPrompt = null;
});
