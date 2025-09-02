// Google Drive Cloud Synchronisation für FreezeTrack
// Hybride Lösung: Lokal + Cloud synchron

class CloudSyncManager {
    constructor() {
        this.isInitialized = false;
        this.isSignedIn = false;
        this.currentUser = null;
        this.driveApi = null;
        this.familyFolderId = null;
        this.syncEnabled = false;
        this.lastSyncTime = null;
        
        // Google API Konfiguration
        this.CLIENT_ID = null; // Wird später aus Umgebung geladen
        this.API_KEY = null;
        this.DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
        this.SCOPES = 'https://www.googleapis.com/auth/drive.file';
        
        // Familie-Ordner Name
        this.FAMILY_FOLDER_NAME = 'FreezeTrack-Familie';
        this.DATA_FILE_NAME = 'freezetrack-data.json';
        
        // Event Handlers
        this.onSyncStatusChange = null;
        this.onSignInChange = null;
    }

    // Google API initialisieren
    async initialize(clientId, apiKey) {
        try {
            this.CLIENT_ID = clientId;
            this.API_KEY = apiKey;

            // Google API Scripts laden falls nicht vorhanden
            if (!window.google || !window.gapi) {
                await this.loadGoogleAPIs();
            }

            // API initialisieren
            await gapi.load('client:auth2', async () => {
                await gapi.client.init({
                    apiKey: this.API_KEY,
                    clientId: this.CLIENT_ID,
                    discoveryDocs: [this.DISCOVERY_DOC],
                    scope: this.SCOPES
                });

                this.authInstance = gapi.auth2.getAuthInstance();
                this.driveApi = gapi.client.drive;
                
                // Aktuellen Sign-In Status prüfen
                this.isSignedIn = this.authInstance.isSignedIn.get();
                if (this.isSignedIn) {
                    this.currentUser = this.authInstance.currentUser.get();
                    await this.setupFamilyFolder();
                }

                // Listen für Sign-In Änderungen
                this.authInstance.isSignedIn.listen(this.handleSignInChange.bind(this));

                this.isInitialized = true;
                this.notifyStatusChange('initialized');
            });

        } catch (error) {
            console.error('Fehler bei Google API Initialisierung:', error);
            throw new Error('Google Drive konnte nicht initialisiert werden: ' + error.message);
        }
    }

    // Google API Scripts dynamisch laden
    async loadGoogleAPIs() {
        return new Promise((resolve, reject) => {
            if (window.gapi) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                gapi.load('client:auth2', resolve);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Benutzer anmelden
    async signIn() {
        try {
            if (!this.isInitialized) {
                throw new Error('Cloud Sync nicht initialisiert');
            }

            const authResult = await this.authInstance.signIn();
            this.currentUser = authResult;
            this.isSignedIn = true;
            
            // Familie-Ordner einrichten
            await this.setupFamilyFolder();
            
            // Erste Synchronisation
            await this.performSync();
            
            this.notifyStatusChange('signed_in');
            return true;
            
        } catch (error) {
            console.error('Fehler bei Google Drive Anmeldung:', error);
            throw new Error('Anmeldung fehlgeschlagen: ' + error.message);
        }
    }

    // Benutzer abmelden
    async signOut() {
        try {
            if (this.authInstance) {
                await this.authInstance.signOut();
            }
            
            this.isSignedIn = false;
            this.currentUser = null;
            this.familyFolderId = null;
            this.syncEnabled = false;
            
            this.notifyStatusChange('signed_out');
            
        } catch (error) {
            console.error('Fehler bei Google Drive Abmeldung:', error);
        }
    }

    // Familie-Ordner einrichten
    async setupFamilyFolder() {
        try {
            // Prüfen ob Familie-Ordner bereits existiert
            const existingFolder = await this.findFamilyFolder();
            
            if (existingFolder) {
                this.familyFolderId = existingFolder.id;
            } else {
                // Neuen Familie-Ordner erstellen
                const folder = await this.createFamilyFolder();
                this.familyFolderId = folder.id;
            }
            
            this.syncEnabled = true;
            return this.familyFolderId;
            
        } catch (error) {
            console.error('Fehler beim Familie-Ordner Setup:', error);
            throw error;
        }
    }

    // Familie-Ordner suchen
    async findFamilyFolder() {
        try {
            const response = await this.driveApi.files.list({
                q: `name='${this.FAMILY_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                spaces: 'drive'
            });
            
            return response.result.files.length > 0 ? response.result.files[0] : null;
            
        } catch (error) {
            console.error('Fehler beim Suchen des Familie-Ordners:', error);
            return null;
        }
    }

    // Familie-Ordner erstellen
    async createFamilyFolder() {
        try {
            const folderMetadata = {
                name: this.FAMILY_FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder',
                description: 'FreezeTrack Familie Daten - Automatisch erstellt'
            };

            const response = await this.driveApi.files.create({
                resource: folderMetadata
            });

            // Ordner für alle lesbar machen (für Familie-Sharing)
            await this.driveApi.permissions.create({
                fileId: response.result.id,
                resource: {
                    role: 'reader',
                    type: 'anyone'
                }
            });

            return response.result;
            
        } catch (error) {
            console.error('Fehler beim Erstellen des Familie-Ordners:', error);
            throw error;
        }
    }

    // Daten mit Cloud synchronisieren
    async syncToCloud(localData) {
        try {
            if (!this.syncEnabled || !this.familyFolderId) {
                throw new Error('Cloud Sync nicht aktiviert');
            }

            const syncData = {
                version: "1.0",
                lastSync: new Date().toISOString(),
                device: {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform,
                    user: this.currentUser.getBasicProfile().getEmail()
                },
                data: localData
            };

            // Prüfen ob Datei bereits existiert
            const existingFile = await this.findDataFile();
            
            if (existingFile) {
                // Datei aktualisieren
                await this.updateDataFile(existingFile.id, syncData);
            } else {
                // Neue Datei erstellen
                await this.createDataFile(syncData);
            }
            
            this.lastSyncTime = new Date();
            this.notifyStatusChange('synced');
            
        } catch (error) {
            console.error('Fehler beim Cloud Sync:', error);
            this.notifyStatusChange('sync_error', error.message);
            throw error;
        }
    }

    // Daten von Cloud laden
    async syncFromCloud() {
        try {
            if (!this.syncEnabled || !this.familyFolderId) {
                throw new Error('Cloud Sync nicht aktiviert');
            }

            const dataFile = await this.findDataFile();
            if (!dataFile) {
                return null; // Keine Cloud-Daten vorhanden
            }

            const response = await this.driveApi.files.get({
                fileId: dataFile.id,
                alt: 'media'
            });

            const cloudData = JSON.parse(response.body);
            this.lastSyncTime = new Date(cloudData.lastSync);
            
            return cloudData.data;
            
        } catch (error) {
            console.error('Fehler beim Laden von Cloud-Daten:', error);
            throw error;
        }
    }

    // Daten-Datei suchen
    async findDataFile() {
        try {
            const response = await this.driveApi.files.list({
                q: `name='${this.DATA_FILE_NAME}' and parents in '${this.familyFolderId}' and trashed=false`,
                spaces: 'drive'
            });
            
            return response.result.files.length > 0 ? response.result.files[0] : null;
            
        } catch (error) {
            console.error('Fehler beim Suchen der Daten-Datei:', error);
            return null;
        }
    }

    // Neue Daten-Datei erstellen
    async createDataFile(data) {
        try {
            const metadata = {
                name: this.DATA_FILE_NAME,
                parents: [this.familyFolderId],
                description: 'FreezeTrack Daten - Automatisch synchronisiert'
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
            form.append('file', new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({
                    'Authorization': `Bearer ${gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token}`
                }),
                body: form
            });

            return await response.json();
            
        } catch (error) {
            console.error('Fehler beim Erstellen der Daten-Datei:', error);
            throw error;
        }
    }

    // Bestehende Daten-Datei aktualisieren
    async updateDataFile(fileId, data) {
        try {
            const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: new Headers({
                    'Authorization': `Bearer ${gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token}`,
                    'Content-Type': 'application/json'
                }),
                body: JSON.stringify(data, null, 2)
            });

            return await response.json();
            
        } catch (error) {
            console.error('Fehler beim Aktualisieren der Daten-Datei:', error);
            throw error;
        }
    }

    // Share-Link für Familie generieren
    async generateFamilyShareLink() {
        try {
            if (!this.familyFolderId) {
                throw new Error('Familie-Ordner nicht gefunden');
            }

            // Permissions für Familie-Zugang setzen
            const permission = await this.driveApi.permissions.create({
                fileId: this.familyFolderId,
                resource: {
                    role: 'writer',
                    type: 'anyone'
                }
            });

            // Share-Link generieren
            const shareLink = `https://freezetrack.app/?join=${this.familyFolderId}`;
            
            return {
                shareLink: shareLink,
                folderId: this.familyFolderId,
                permissionId: permission.result.id
            };
            
        } catch (error) {
            console.error('Fehler beim Generieren des Share-Links:', error);
            throw error;
        }
    }

    // Familie-Zugang über Share-Link
    async joinFamily(folderId) {
        try {
            this.familyFolderId = folderId;
            this.syncEnabled = true;
            
            // Erste Synchronisation
            const cloudData = await this.syncFromCloud();
            return cloudData;
            
        } catch (error) {
            console.error('Fehler beim Familie beitreten:', error);
            throw error;
        }
    }

    // Sign-In Status Änderung
    handleSignInChange(isSignedIn) {
        this.isSignedIn = isSignedIn;
        
        if (isSignedIn) {
            this.currentUser = this.authInstance.currentUser.get();
            this.setupFamilyFolder().then(() => {
                this.notifyStatusChange('signed_in');
            });
        } else {
            this.currentUser = null;
            this.familyFolderId = null;
            this.syncEnabled = false;
            this.notifyStatusChange('signed_out');
        }
        
        if (this.onSignInChange) {
            this.onSignInChange(isSignedIn);
        }
    }

    // Status-Änderung benachrichtigen
    notifyStatusChange(status, details = null) {
        if (this.onSyncStatusChange) {
            this.onSyncStatusChange(status, details);
        }
    }

    // Vollständige Synchronisation durchführen
    async performSync() {
        try {
            this.notifyStatusChange('syncing');
            
            // Lokale Daten sammeln
            const localData = await this.gatherLocalData();
            
            // Mit Cloud synchronisieren
            await this.syncToCloud(localData);
            
            this.notifyStatusChange('synced');
            
        } catch (error) {
            console.error('Fehler bei vollständiger Synchronisation:', error);
            this.notifyStatusChange('sync_error', error.message);
            throw error;
        }
    }

    // Lokale Daten sammeln
    async gatherLocalData() {
        try {
            const data = {
                items: [],
                settings: {}
            };

            // Items sammeln
            if (typeof localforage !== 'undefined') {
                await localforage.iterate((value, key) => {
                    if (key.startsWith('item_')) {
                        data.items.push(value);
                    }
                });
                data.settings = await localforage.getItem('settings') || {};
            } else {
                // LocalStorage Fallback
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('item_')) {
                        data.items.push(JSON.parse(localStorage.getItem(key)));
                    }
                }
                const settings = localStorage.getItem('settings');
                data.settings = settings ? JSON.parse(settings) : {};
            }

            return data;
            
        } catch (error) {
            console.error('Fehler beim Sammeln lokaler Daten:', error);
            throw error;
        }
    }

    // Status Getters
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isSignedIn: this.isSignedIn,
            syncEnabled: this.syncEnabled,
            userEmail: this.currentUser ? this.currentUser.getBasicProfile().getEmail() : null,
            lastSyncTime: this.lastSyncTime,
            familyFolderId: this.familyFolderId
        };
    }
}

// Globale Instanz
window.cloudSync = new CloudSyncManager();
