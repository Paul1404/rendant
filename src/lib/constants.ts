export const PROTOKOLL_TITEL = "Kassenzählprotokoll";

export const WECHSELGELD_DEFAULT_CENT = 16000;

export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_MAX = 5;
// Globaler Backstop: greift unabhaengig von der IP. Schuetzt gegen
// verteilte oder per X-Forwarded-For gefaelschte Brute-Force-Versuche.
export const LOGIN_RATE_GLOBAL_MAX = 30;

export const S3_PREFIX = "protokolle";

export const APP_NAME = "Rendant";
