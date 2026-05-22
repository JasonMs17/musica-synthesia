export default class LicenseManager {
    constructor() {
        this.isPremium = true;
    }

    init() {
        this.loadLicense();
        console.log("License Manager Initialized. Premium:", this.isPremium);
    }

    loadLicense() {
        const savedKey = localStorage.getItem('synthesia_next_license');
        if (savedKey) {
            const result = this.validateKey(savedKey);
            if (result.valid) {
                this.isPremium = true;
            }
        }
    }

    validateKey(key) {
        // Format: SNX-PREM-XXXX-YYYY
        // XXXX: Random Hex (4 chars)
        // YYYY: Checksum Hex (4 chars)
        // Checksum = Hash(XXXX + SALT) % 0xFFFF

        if (!key) return { valid: false };

        const cleanKey = key.trim().toUpperCase();
        const parts = cleanKey.split('-');

        if (parts.length !== 4) return { valid: false };
        if (parts[0] !== 'SNX' || parts[1] !== 'PREM') return { valid: false };

        const randomPart = parts[2];
        const checksumPart = parts[3];

        if (this.generateChecksum(randomPart) === checksumPart) {
            this.isPremium = true;
            localStorage.setItem('synthesia_next_license', cleanKey);
            return { valid: true };
        }

        return { valid: false };
    }

    generateChecksum(input) {
        const salt = "SYNTHESIA_SECRET_SALT_2024";
        const text = input + salt;
        let hash = 5381;

        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) + hash) + text.charCodeAt(i); /* hash * 33 + c */
        }

        // Convert to positive hex and take last 4 chars
        const hex = (hash >>> 0).toString(16).toUpperCase();
        return hex.slice(-4).padStart(4, '0');
    }

    canPlay(/* currentTime */) {
        return true;
    }
}
