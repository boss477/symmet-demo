/**
 * Entry fabric prices from Shearling Moulded Chair Catalogue 2024-2025.
 * Used as a fallback when the Supabase row has no price data.
 * Keyed by "Product Code" column value.
 */
export var SHEARLING_PRICE_OVERRIDES = {
  // Dining chairs (CH-)
  "CH-BRIGIDA-001": 20200,
  "CH-MILA-002":    17100,
  "CH-MARCELA-003": 21700,
  "CH-ADELE-004":   20200,
  "CH-DEVA-005":    20200,
  "CH-ANNETTE-007": 19100,
  "CH-BREK-008":    20860,
  "CH-CLOE-009":    20860,
  "CH-TULA-010":    22010,
  "CH-MADDY-011":   30000,
  "CH-MARIA-012":   35000,
  "CH-CELIA-013":   35000,
  // Armchair (AC-)
  "AC-DEVA-006":    21900,
  // Lounge chairs (LC-)
  "LC-BREK-014":    40200,
  "LC-QUEEN-015":   54200,
  "LC-PRINCESS-016":41110,
  "LC-SIXTY-017":   41110,
  "LC-NORA-018":    40000,
  // Bar stools (BS-)
  "BS-ANNETTE-019": 22250,
  "BS-FELICIA-020": 22250,
  "BS-MILA-022":    20500,
};
