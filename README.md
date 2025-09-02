
e# 🧊 FreezeTrack

**TK-Bestands-App mit QR-Scans - Scan → Piep → Fertig**

FreezeTrack ist eine ultra-einfache, webbasierte App (PWA), die über die Smartphone-Kamera QR-Codes scannt, Tiefkühlware einlagert/entnimmt, MHD automatisch berechnet, Bestände anzeigt und optional Etiketten druckt.

## ✨ Features

- **Drei Modi**: Auto +1 (Einlagern), Auto -1 (Entnehmen), Dialog (Mengen)
- **QR-Scanner**: Integrierte Kamera mit @zxing/browser
- **Offline-fähig**: PWA mit Service Worker und IndexedDB
- **Automatische MHD-Berechnung**: Standard-Haltbarkeit pro Kategorie
- **UNDO-Funktion**: Letzte Aktion rückgängig machen
- **Export/Import**: JSON-Format für Datensicherung
- **Mobile-first**: Optimiert für Smartphone-Nutzung

## 🚀 Installation

### Voraussetzungen
- Node.js 16+ 
- npm oder yarn

### Setup
```bash
# Repository klonen
git clone <repository-url>
cd FreezeTrack

# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev
```

Die App läuft dann unter `http://localhost:3000`

### Build für Produktion
```bash
npm run build
```

## 📱 Nutzung

### 1. Scanner starten
- App öffnen und Kamera-Berechtigung erteilen
- QR-Code in den Scanner-Bereich halten

### 2. Modi wählen
- **Auto +1**: Jeder Scan zählt automatisch +1 (Einlagern)
- **Auto -1**: Jeder Scan zählt automatisch -1 (Entnehmen)  
- **Dialog**: Scan öffnet Dialog für Mengen-Eingabe

### 3. Artikel scannen
- QR-Code mit "ITM:" Präfix scannen
- App erstellt automatisch neuen Artikel falls unbekannt
- MHD wird automatisch berechnet (Standard: 180 Tage)

### 4. Bestand verwalten
- Lagerbestand wird in Echtzeit angezeigt
- MHD-Warnungen für bald ablaufende Artikel
- UNDO-Button macht letzte Aktion rückgängig

## 🏷️ QR-Code Format

Artikel-QR-Codes sollten folgendes Format haben:
```
ITM:01H9ABCDEFGHIJKLMNOP
```

- **Präfix**: "ITM:" (Item)
- **ID**: Eindeutige Kennung (z.B. ULID oder UUID)
- **Kurz-ID**: Letzte 5 Zeichen werden als Kurz-ID angezeigt

## ⚙️ Konfiguration

### Standard-MHD (Tage)
- **Global**: 180 Tage (TK-Standard)
- **Kategorien**: 
  - Gemüse: 365 Tage
  - Fleisch: 180 Tage  
  - Brot: 90 Tage
  - Reste: 120 Tage

### Orte
Artikel können folgenden Orten zugeordnet werden:
- TK-A1, TK-A2, TK-A3, TK-A4
- TK-B1, TK-B2, TK-B3, TK-B4
- TK-C1, TK-C2, TK-C3, TK-C4

## 🗄️ Datenmodell

```typescript
interface Item {
  id: string;           // Vollständige ID aus QR
  shortId: string;      // Letzte 5 Zeichen
  name?: string;        // Artikelbeschreibung
  category?: string;    // Kategorie (Gemüse, Fleisch, etc.)
  location?: string;    // Fach/Box (TK-A1, etc.)
  inDate: string;       // Einlagerungsdatum
  expDate: string;      // Mindesthaltbarkeitsdatum
  status: "in_stock" | "used";
  notes?: string;       // Notizen
  createdAt: string;    // Erstellungsdatum
  updatedAt: string;    // Letzte Änderung
}
```

## 🔧 Entwicklung

### Projektstruktur
```
FreezeTrack/
├── index.html          # Haupt-HTML
├── manifest.json       # PWA-Manifest
├── sw.js              # Service Worker
├── js/
│   ├── app.js         # Hauptanwendungslogik
│   ├── database.js    # Datenbank-Operationen
│   └── scanner.js     # QR-Scanner
├── package.json        # Dependencies
└── vite.config.js     # Build-Konfiguration
```

### Dependencies
- **@zxing/browser**: QR-Code Scanner
- **localforage**: IndexedDB Wrapper
- **vite**: Build-Tool und Dev-Server

### Scripts
- `npm run dev`: Entwicklungsserver starten
- `npm run build`: Produktions-Build erstellen
- `npm run preview`: Build lokal testen

## 📱 PWA-Installation

1. App im Browser öffnen
2. "Zum Startbildschirm hinzufügen" wählen
3. App installieren
4. Offline-fähige PWA nutzen

## 🚨 Bekannte Probleme

- **Kamera-Berechtigung**: HTTPS erforderlich für Produktionsumgebung
- **iOS Safari**: PWA-Installation funktioniert nur über Safari
- **Offline-Modus**: Erste Nutzung erfordert Internetverbindung

## 🤝 Beitragen

1. Fork erstellen
2. Feature-Branch erstellen (`git checkout -b feature/AmazingFeature`)
3. Änderungen committen (`git commit -m 'Add some AmazingFeature'`)
4. Branch pushen (`git push origin feature/AmazingFeature`)
5. Pull Request erstellen

## 📄 Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Siehe `LICENSE` Datei für Details.

## 📞 Support

Bei Fragen oder Problemen:
- Issue im Repository erstellen
- Dokumentation überprüfen
- Code-Beispiele studieren

---

**FreezeTrack** - Tiefkühlware verwalten war noch nie so einfach! 🧊✨
