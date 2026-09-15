// Losstaand van src/lib/calendar.ts (dat node-ical importeert, met
// Node-only afhankelijkheden zoals node:fs) zodat clientcomponenten deze
// constante kunnen gebruiken zonder dat node-ical in de browserbundel
// terechtkomt.
export const CLUB_TIME_ZONE = "Europe/Amsterdam";
