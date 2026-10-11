// WebAuthn "Relying Party"-configuratie — afgeleid van NEXTAUTH_URL (dezelfde
// env var die Auth.js al gebruikt), niet van request-headers. @simplewebauthn
// controleert zelf intern dat de browser-respons exact tegen deze waarden
// matcht (origin + rpID zitten cryptografisch vast in wat de authenticator
// ondertekent) — vertrouwen op een request-header zou dat onnodig open
// zetten voor manipulatie, terwijl een vaste, server-geconfigureerde waarde
// precies even functioneel is.
const APP_URL = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000");

export const RP_NAME = "HHC Hardenberg Hub";
export const RP_ID = APP_URL.hostname;
export const RP_ORIGIN = APP_URL.origin;
