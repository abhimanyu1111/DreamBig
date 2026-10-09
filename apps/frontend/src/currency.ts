// Currency helpers.
// All money in the system is stored as integer PAISE (100 paise = ₹1).
// Share prices are integer paise between 1P and 99P; a winning share always pays ₹1 (100P).

export const PAISE_PER_RUPEE = 100;
export const PAYOUT_PAISE = 100;

// 12345 -> "₹123.45"
export function formatRupees(paise?: number | null): string {
  const val = Number(paise) || 0;
  return `₹${(val / PAISE_PER_RUPEE).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// 60 -> "60P"
export function formatPaise(paise?: number | null): string {
  if (paise === undefined || paise === null || isNaN(Number(paise))) return "50P";
  return `${paise}P`;
}
