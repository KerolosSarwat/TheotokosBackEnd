const NodeCache = require('node-cache');

// Create a cache instance with a default TTL of 10 minutes (600 seconds)
// and check for expired keys every 2 minutes (120 seconds).
const myCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Helper to generate a consistent cache key from a query object
const generateCacheKey = (prefix, query) => {
  const sortedKeys = Object.keys(query).sort();
  const queryStr = sortedKeys.map(k => `${k}=${query[k]}`).join('&');
  return `${prefix}:${queryStr}`;
};

// Clear all attendance-related cache
const invalidateAttendanceCache = () => {
  const keys = myCache.keys();
  const attendanceKeys = keys.filter(k => k.startsWith('attendance_'));
  if (attendanceKeys.length > 0) {
    myCache.del(attendanceKeys);
    console.log(`Invalidated ${attendanceKeys.length} attendance cache entries.`);
  }
};

module.exports = {
  myCache,
  generateCacheKey,
  invalidateAttendanceCache,
};
