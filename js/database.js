import localforage from 'localforage';

// Datenbank-Konfiguration
localforage.config({
    name: 'FreezeTrack',
    storeName: 'items'
});

// Vereinfachtes Datenmodell ohne Kategorien
class Item {
    constructor(id, data = {}) {
        this.id = id;
        this.shortId = id.slice(-8); // Letzte 8 Zeichen für bessere Lesbarkeit
        this.name = data.name || '';
        this.location = data.location || '';
        this.inDate = data.inDate || new Date().toISOString().split('T')[0];
        this.expDate = data.expDate || '';
        this.status = data.status || 'in_stock';
        this.notes = data.notes || '';
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }
}

// Datenbank-Operationen
class Database {
    constructor() {
        this.items = localforage.createInstance({ name: 'FreezeTrack', storeName: 'items' });
        this.settings = localforage.createInstance({ name: 'FreezeTrack', storeName: 'settings' });
        this.history = localforage.createInstance({ name: 'FreezeTrack', storeName: 'history' });
    }

    // Item-Operationen
    async addItem(id, data = {}) {
        const item = new Item(id, data);
        await this.items.setItem(id, item);
        return item;
    }

    async getItem(id) {
        return await this.items.getItem(id);
    }

    async updateItem(id, updates) {
        const item = await this.getItem(id);
        if (item) {
            const updated = { ...item, ...updates, updatedAt: new Date().toISOString() };
            await this.items.setItem(id, updated);
            return updated;
        }
        return null;
    }

    async getAllItems() {
        const items = [];
        await this.items.iterate((item) => {
            items.push(item);
        });
        return items;
    }

    async getItemsByStatus(status) {
        const items = await this.getAllItems();
        return items.filter(item => item.status === status);
    }

    async getInStockItems() {
        return await this.getItemsByStatus('in_stock');
    }

    // Bestand ändern
    async changeStock(id, delta) {
        const item = await this.getItem(id);
        if (!item) return false;

        if (delta > 0) {
            // Einlagern
            if (item.status === 'used') {
                // Status auf in_stock setzen
                await this.updateItem(id, { status: 'in_stock' });
            }
        } else if (delta < 0) {
            // Entnehmen
            if (item.status === 'in_stock') {
                await this.updateItem(id, { status: 'used' });
            }
        }

        // Verlauf speichern
        await this.addHistoryEntry({
            itemId: id,
            action: delta > 0 ? 'add' : 'remove',
            quantity: Math.abs(delta),
            timestamp: new Date().toISOString()
        });

        return true;
    }

    // Verlauf
    async addHistoryEntry(entry) {
        const history = await this.history.getItem('moves') || [];
        history.unshift(entry);
        // Nur die letzten 100 Einträge behalten
        if (history.length > 100) {
            history.splice(100);
        }
        await this.history.setItem('moves', history);
    }

    async getLastMove() {
        const history = await this.history.getItem('moves') || [];
        return history[0] || null;
    }

    async undoLastMove() {
        const lastMove = await this.getLastMove();
        if (!lastMove) return false;

        // Letzte Aktion rückgängig machen
        const item = await this.getItem(lastMove.itemId);
        if (item) {
            if (lastMove.action === 'add') {
                await this.updateItem(lastMove.itemId, { status: 'used' });
            } else {
                await this.updateItem(lastMove.itemId, { status: 'in_stock' });
            }
        }

        // Aus Verlauf entfernen
        const history = await this.history.getItem('moves') || [];
        history.shift();
        await this.history.setItem('moves', history);

        return true;
    }

    // Einstellungen
    async getSettings() {
        const defaults = {
            defaultMonths: 6, // Standard: 6 Monate
            repeatOn: false,
            repeatTemplate: null,
            lastItemName: '',
            lastLocation: ''
        };
        
        const settings = await this.settings.getItem('app') || {};
        return { ...defaults, ...settings };
    }

    async updateSettings(newSettings) {
        const current = await this.getSettings();
        const updated = { ...current, ...newSettings };
        await this.settings.setItem('app', updated);
        return updated;
    }

    // Export/Import
    async exportData() {
        const items = await this.getAllItems();
        const settings = await this.getSettings();
        const history = await this.history.getItem('moves') || [];
        
        return {
            items,
            settings,
            history,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
    }

    async importData(data) {
        try {
            // Items importieren
            for (const item of data.items || []) {
                await this.items.setItem(item.id, item);
            }
            
            // Einstellungen importieren
            if (data.settings) {
                await this.settings.setItem('app', data.settings);
            }
            
            // Verlauf importieren
            if (data.history) {
                await this.history.setItem('moves', data.history);
            }
            
            return true;
        } catch (error) {
            console.error('Import failed:', error);
            return false;
        }
    }

    // Hilfsfunktionen - vereinfacht auf Monate
    calculateExpDate(baseDate = new Date(), months = 6) {
        const date = new Date(baseDate);
        date.setMonth(date.getMonth() + months);
        return date.toISOString().split('T')[0];
    }
    
    // Legacy-Support für Tage
    calculateExpDateFromDays(baseDate = new Date(), days) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    }

    getDaysUntilExpiry(expDate) {
        const today = new Date();
        const expiry = new Date(expDate);
        const diffTime = expiry - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    isExpired(expDate) {
        return this.getDaysUntilExpiry(expDate) < 0;
    }

    isExpiringSoon(expDate, days = 14) {
        const daysUntil = this.getDaysUntilExpiry(expDate);
        return daysUntil >= 0 && daysUntil <= days;
    }
}

// Singleton-Instanz exportieren
export const db = new Database();
export { Item };
