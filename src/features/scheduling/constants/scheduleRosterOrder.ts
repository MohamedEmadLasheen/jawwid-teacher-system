/**
 * Display order for the Schedule teacher roster, by stable teacher UUID.
 *
 * This is the one piece of roster presentation NOT taken from the database,
 * and deliberately so: the approved order is a curated business sequence
 * (it is neither alphabetical nor insertion order), and the availability
 * schema has nowhere to record it — `teacher_shift_assignments` holds one
 * row per teacher *per day*, so a sort column there would be duplicated
 * seven times per teacher and could disagree with itself.
 *
 * Scope is strictly cosmetic. It decides nothing about:
 *   * who is on the roster  — that is active shift assignments, and
 *   * what hours they work  — that is the shift template's start/end minute.
 *
 * A teacher absent from this list still appears on the roster; they simply
 * sort after the listed ones, alphabetically. So adding a teacher in the
 * database works with no code change, and this list never silently hides
 * anyone. Removing a teacher from the roster leaves a harmless stale id.
 *
 * UUIDs, never names: names in this database are English transliterations
 * with inconsistent trailing spaces, and two distinct teachers share the
 * prefix "Hend Mohammed".
 */
export const SCHEDULE_ROSTER_DISPLAY_ORDER: string[] = [
  // Full-time
  '1be38a96-e963-4fce-84a8-7fecd0857195', // Mohamed Hussein
  '51042bab-879f-469b-b738-ea4f35072e23', // Ashraf Elzohdy
  '31f8b40b-c0ab-4765-a444-df95585fbc54', // Arwa Ahmed
  'e814f138-9940-4f86-b78b-2e4e2908cfa9', // Menna Ramadan
  '3fd381c5-c34b-46cf-b28f-a55cf4634142', // Rokaya Ramadan
  'e93d453e-5282-4dc9-9e33-f3a77a0efd8a', // Hend Mohammed — the plain record, not "(اعاجم)"
  '14d7a6d9-749b-44a0-9a52-1a76611066cb', // Doaa Zakaria
  '686c57da-78d7-4a9d-abf4-b35c1b8e8faa', // Yasmeen Saad

  // Part-time
  '0b9d761d-520d-46b5-9889-eb24225be3e8', // Aya Mustafa
  '291905ec-b1b5-4506-8b8e-3edb4e319357', // Zainab Hazem
  '703abfe6-3007-49d8-ac22-c68033f855bc', // Menna Ebrahim
  '9a8210de-a691-44bf-8b6e-c2f15380986a', // Ghada (stored without a surname)
  'cba57876-b992-4050-95f8-07972b1c8572', // Asmaa Magdy
  'c8c51712-35b1-4b09-ba3f-fbb9bca78405', // Yasmin Asaad
];
