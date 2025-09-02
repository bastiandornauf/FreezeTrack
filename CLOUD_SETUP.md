# 🚀 Google Drive Cloud-Sync Einrichtung

## 📋 Schritt-für-Schritt Anleitung

### **1. Google Cloud Console Projekt erstellen**

1. Gehen Sie zu: https://console.cloud.google.com/
2. Klicken Sie auf **"Neues Projekt erstellen"**
3. Projektname: `FreezeTrack-Cloud-Sync`
4. Projekt erstellen

### **2. Google Drive API aktivieren**

1. In der Google Cloud Console → **"APIs & Services" → "Bibliothek"**
2. Suchen Sie nach: **"Google Drive API"**
3. Klicken Sie auf **"Aktivieren"**

### **3. OAuth 2.0 Credentials erstellen**

1. **"APIs & Services" → "Anmeldedaten"**
2. **"+ Anmeldedaten erstellen" → "OAuth-Client-ID"**
3. Anwendungstyp: **"Webanwendung"**
4. Name: `FreezeTrack PWA`
5. **Autorisierte JavaScript-Ursprünge**:
   ```
   http://localhost:8000
   http://localhost:3000  
   https://bastiandornauf.github.io
   https://[ihre-domain].com
   ```
6. **Autorisierte Weiterleitungs-URIs**:
   ```
   http://localhost:8000/settings.html
   https://bastiandornauf.github.io/FreezeTrack/settings.html
   ```

### **4. API-Schlüssel erstellen**

1. **"+ Anmeldedaten erstellen" → "API-Schlüssel"**
2. Schlüssel kopieren und sicher speichern
3. **"Schlüssel einschränken"**:
   - API-Einschränkungen: **"Google Drive API"**
   - Website-Einschränkungen: Ihre Domains hinzufügen

### **5. OAuth-Einverständnisbildschirm konfigurieren**

1. **"OAuth-Einverständnisbildschirm"**
2. Nutzertyp: **"Extern"**
3. App-Name: `FreezeTrack`
4. Support-E-Mail: Ihre E-Mail
5. Logo: Optional (FreezeTrack Logo hochladen)
6. App-Domain: Ihre Website
7. **Bereiche hinzufügen**:
   ```
   https://www.googleapis.com/auth/drive.file
   ```

### **6. Credentials in App einsetzen**

Bearbeiten Sie `js/cloud-sync.js` und ersetzen Sie:

```javascript
// In der connectGoogleDrive() Funktion in settings.html:
const CLIENT_ID = 'IHR_CLIENT_ID.googleusercontent.com';
const API_KEY = 'IHR_API_SCHLÜSSEL';
```

**WICHTIG:** Verwenden Sie niemals echte Credentials in öffentlichen Repositories!

### **7. Umgebungsvariablen (Empfohlen)**

Für Produktion verwenden Sie Umgebungsvariablen oder einen Build-Prozess:

```javascript
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'development-client-id';
const API_KEY = process.env.GOOGLE_API_KEY || 'development-api-key';
```

### **8. Testen**

1. Starten Sie einen lokalen Server:
   ```bash
   python3 -m http.server 8000
   ```
2. Öffnen Sie: `http://localhost:8000/settings.html`
3. Klicken Sie auf **"Mit Google Drive verbinden"**
4. Überprüfen Sie die Browser-Konsole auf Fehler

## 🔧 Fehlerbehebung

### **Häufige Probleme:**

#### **"Origin not allowed" Fehler**
- Überprüfen Sie die autorisierten JavaScript-Ursprünge
- Stellen Sie sicher, dass die exakte URL (mit/ohne www) eingetragen ist

#### **"API key not valid" Fehler**  
- Überprüfen Sie die API-Schlüssel-Einschränkungen
- Stellen Sie sicher, dass Google Drive API aktiviert ist

#### **"Popup blocked" Fehler**
- Benutzer müssen Popups für Ihre Domain erlauben
- Fügen Sie entsprechende Anweisungen in die App ein

#### **"Access denied" Fehler**
- Überprüfen Sie die OAuth-Bereiche
- Stellen Sie sicher, dass der Einverständnisbildschirm veröffentlicht ist

### **Debug-Tipps:**

1. **Browser-Konsole überwachen** während der Anmeldung
2. **Network-Tab** auf failed requests prüfen  
3. **Google Cloud Console Logs** für API-Aufrufe prüfen
4. **Inkognito-Modus** für saubere Tests verwenden

## 🚀 Deployment

### **GitHub Pages**
Fügen Sie Ihre GitHub Pages URL zu den autorisierten Ursprüngen hinzu:
```
https://[username].github.io
```

### **Eigene Domain**
Für eine eigene Domain:
```
https://freezetrack.meine-domain.de
```

## 🔒 Sicherheit

### **Produktions-Checkliste:**
- [ ] OAuth-Einverständnisbildschirm veröffentlicht
- [ ] API-Schlüssel eingeschränkt
- [ ] Nur notwendige OAuth-Bereiche
- [ ] HTTPS für alle Domains
- [ ] Credentials nicht in Source Code
- [ ] Regelmäßige Credential-Rotation

### **Datenschutz:**
- [ ] Datenschutzerklärung hinzufügen
- [ ] Benutzer über Datensammlung informieren  
- [ ] GDPR-Konformität sicherstellen
- [ ] Löschfunktion für Cloud-Daten anbieten

## 📞 Support

Bei Problemen:
1. Google Cloud Console Dokumentation: https://cloud.google.com/docs
2. Google Drive API Referenz: https://developers.google.com/drive/api
3. Stack Overflow: Tag "google-drive-api"

## 🎯 Nächste Schritte

Nach erfolgreicher Einrichtung:
1. **Familie-Sharing** testen
2. **Automatische Synchronisation** verifizieren
3. **Mobile PWA** auf verschiedenen Geräten testen
4. **Offline-Sync** nach Internetverbindung testen
