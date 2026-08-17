/**
 * Attendance Status Constants
 * 
 * Central normalization layer for attendance statuses.
 * Arabic status strings from the database are mapped to normalized constants.
 * Business logic should use these constants, not raw Arabic strings.
 */

const ATTENDANCE_STATUS = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
  EXCUSED: 'EXCUSED',
  UNKNOWN: 'UNKNOWN'
};

// Map Arabic status values (from Firestore) to normalized constants
const ARABIC_TO_NORMALIZED = {
  'تم الحضور': ATTENDANCE_STATUS.PRESENT,
  'غائب': ATTENDANCE_STATUS.ABSENT,
  'متأخر': ATTENDANCE_STATUS.LATE,
  'معتذر': ATTENDANCE_STATUS.EXCUSED,
};

// Reverse mapping: normalized → Arabic (for writing/display)
const NORMALIZED_TO_ARABIC = {
  [ATTENDANCE_STATUS.PRESENT]: 'تم الحضور',
  [ATTENDANCE_STATUS.ABSENT]: 'غائب',
  [ATTENDANCE_STATUS.LATE]: 'متأخر',
  [ATTENDANCE_STATUS.EXCUSED]: 'معتذر',
};

// All known Arabic status values (for query filtering)
const ALL_ARABIC_STATUSES = Object.keys(ARABIC_TO_NORMALIZED);

/**
 * Normalize an Arabic status string to a constant.
 * @param {string} arabicStatus - The Arabic status from the database
 * @returns {string} Normalized status constant
 */
function normalizeStatus(arabicStatus) {
  return ARABIC_TO_NORMALIZED[arabicStatus] || ATTENDANCE_STATUS.UNKNOWN;
}

/**
 * Convert a normalized status to its Arabic string.
 * @param {string} normalizedStatus - The normalized status constant
 * @returns {string|null} Arabic status string, or null if unknown
 */
function toArabicStatus(normalizedStatus) {
  return NORMALIZED_TO_ARABIC[normalizedStatus] || null;
}

/**
 * Determine the academic year from a date string.
 * Academic year runs September → August.
 * e.g., 2025-12-04 → "2025-2026", 2026-07-28 → "2025-2026", 2026-09-01 → "2026-2027"
 * 
 * @param {string} dateStr - Date string (e.g., "2025-12-04 16:48:01")
 * @returns {string} Academic year string (e.g., "2025-2026")
 */
function getAcademicYearFromDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const month = date.getMonth(); // 0-indexed (0=Jan, 8=Sep)
  const year = date.getFullYear();

  // September (month index 8) starts a new academic year
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

/**
 * Get the current academic year based on today's date.
 * @returns {string} Academic year string
 */
function getCurrentAcademicYear() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

module.exports = {
  ATTENDANCE_STATUS,
  ARABIC_TO_NORMALIZED,
  NORMALIZED_TO_ARABIC,
  ALL_ARABIC_STATUSES,
  normalizeStatus,
  toArabicStatus,
  getAcademicYearFromDate,
  getCurrentAcademicYear
};
