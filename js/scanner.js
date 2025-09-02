import { BrowserQRCodeReader } from '@zxing/browser';

class QRScanner {
    constructor(videoElement) {
        this.video = videoElement;
        this.codeReader = new BrowserQRCodeReader();
        this.isScanning = false;
        this.onScanCallback = null;
        this.lastScannedCode = null;
        this.scanCooldown = 1000; // 1 Sekunde Cooldown zwischen Scans
    }

    async start() {
        try {
            if (this.isScanning) return;

            // Kamera-Stream starten
            await this.codeReader.decodeFromVideoDevice(
                null, // Erste verfügbare Kamera
                this.video,
                (result, error) => {
                    if (result && !error) {
                        this.handleScan(result.text);
                    }
                }
            );

            this.isScanning = true;
            console.log('Scanner gestartet');
        } catch (error) {
            console.error('Scanner-Fehler:', error);
            throw error;
        }
    }

    stop() {
        if (this.isScanning) {
            this.codeReader.reset();
            this.isScanning = false;
            console.log('Scanner gestoppt');
        }
    }

    handleScan(code) {
        const now = Date.now();
        
        // Cooldown prüfen
        if (this.lastScannedCode === code && 
            (now - this.lastScanTime) < this.scanCooldown) {
            return;
        }

        this.lastScannedCode = code;
        this.lastScanTime = now;

        // Callback aufrufen
        if (this.onScanCallback) {
            this.onScanCallback(code);
        }
    }

    onScan(callback) {
        this.onScanCallback = callback;
    }

    // Kamera wechseln
    async switchCamera() {
        if (!this.isScanning) return;

        this.stop();
        await new Promise(resolve => setTimeout(resolve, 500)); // Kurze Pause
        await this.start();
    }

    // Verfügbare Kameras auflisten
    async getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === 'videoinput');
        } catch (error) {
            console.error('Kamera-Enumeration fehlgeschlagen:', error);
            return [];
        }
    }

    // Bestimmte Kamera auswählen
    async selectCamera(deviceId) {
        if (!this.isScanning) return;

        this.stop();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            await this.codeReader.decodeFromVideoDevice(
                deviceId,
                this.video,
                (result, error) => {
                    if (result && !error) {
                        this.handleScan(result.text);
                    }
                }
            );
            this.isScanning = true;
        } catch (error) {
            console.error('Kamera-Wechsel fehlgeschlagen:', error);
            // Fallback zur Standard-Kamera
            await this.start();
        }
    }

    // Scanner-Status
    getStatus() {
        return {
            isScanning: this.isScanning,
            lastScannedCode: this.lastScannedCode,
            lastScanTime: this.lastScanTime
        };
    }

    // Scanner zurücksetzen
    reset() {
        this.lastScannedCode = null;
        this.lastScanTime = 0;
    }
}

export { QRScanner };
