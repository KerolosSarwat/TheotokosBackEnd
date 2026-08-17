const { firestore } = require('../config/firebase-config');
const { 
  normalizeStatus, 
  getAcademicYearFromDate, 
  getCurrentAcademicYear,
  ATTENDANCE_STATUS,
  ARABIC_TO_NORMALIZED
} = require('../constants/attendanceConstants');
const { myCache, generateCacheKey } = require('../utils/cache');

// ============================================================
// Helper: Parse attendance date string into Date object
// Handles formats like "2025-12-04 16:48:01" and "2026-07-28 12:57"
// ============================================================
function parseAttendanceDate(dateStr) {
  if (!dateStr) return null;
  // Replace any potential formatting issues
  const date = new Date(dateStr.replace(' ', 'T'));
  return isNaN(date.getTime()) ? null : date;
}

// ============================================================
// Helper: Enrich attendance record with user data
// ============================================================
function enrichRecord(attendanceDoc, userData, userId) {
  const data = attendanceDoc.data ? attendanceDoc.data() : attendanceDoc;
  const dateParts = (data.date || '').split(' ');

  return {
    id: attendanceDoc.id || data.id,
    userId: userId,
    fullName: userData?.fullName || '',
    code: userData?.code || userId,
    level: userData?.level || '',
    church: userData?.church || '',
    academicYear: data.academicYear || getAcademicYearFromDate(data.date) || '',
    term: data.term || null,
    date: dateParts[0] || '',
    time: dateParts[1] || '',
    rawDate: data.date || '',
    status: data.status || '',
    normalizedStatus: normalizeStatus(data.status),
  };
}

// ============================================================
// GET /api/attendance/user/:userId
// Get attendance records for a single user with filters
// ============================================================
const getUserAttendance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { academicYear, term, status, dateFrom, dateTo, page = 1, pageSize = 50 } = req.query;

    // Verify user exists
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }
    const userData = userDoc.data();

    // Build query
    let query = firestore.collection('users').doc(userId).collection('attendance');

    if (academicYear) {
      query = query.where('academicYear', '==', academicYear);
    }
    if (term) {
      query = query.where('term', '==', Number(term));
    }
    if (status) {
      query = query.where('status', '==', status);
    }

    // Order by date descending
    query = query.orderBy('date', 'desc');

    // Execute query
    const snapshot = await query.get();

    // Client-side date range filtering (Firestore can't do range on date string + other where clauses easily)
    let records = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const record = enrichRecord({ ...data, id: doc.id }, userData, userId);

      // Date range filter
      if (dateFrom || dateTo) {
        const recordDate = record.date; // "YYYY-MM-DD"
        if (dateFrom && recordDate < dateFrom) return;
        if (dateTo && recordDate > dateTo) return;
      }

      records.push(record);
    });

    // Pagination (client-side since we already have filtered results)
    const totalRecords = records.length;
    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const totalPages = Math.ceil(totalRecords / size);
    const startIdx = (pageNum - 1) * size;
    const paginatedRecords = records.slice(startIdx, startIdx + size);

    // Compute stats
    const stats = {
      total: totalRecords,
      present: records.filter(r => r.normalizedStatus === ATTENDANCE_STATUS.PRESENT).length,
      absent: records.filter(r => r.normalizedStatus === ATTENDANCE_STATUS.ABSENT).length,
      late: records.filter(r => r.normalizedStatus === ATTENDANCE_STATUS.LATE).length,
      excused: records.filter(r => r.normalizedStatus === ATTENDANCE_STATUS.EXCUSED).length,
    };
    stats.attendanceRate = stats.total > 0
      ? Math.round((stats.present / stats.total) * 1000) / 10
      : 0;

    return res.status(200).json({
      user: {
        id: userId,
        code: userData.code || userId,
        fullName: userData.fullName,
        level: userData.level,
        church: userData.church,
      },
      records: paginatedRecords,
      stats,
      pagination: {
        page: pageNum,
        pageSize: size,
        totalRecords,
        totalPages,
      }
    });
  } catch (error) {
    console.error('Error getting user attendance:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ============================================================
// GET /api/attendance/report
// Global detailed attendance report using collection group query
// ============================================================
const getAttendanceReport = async (req, res) => {
  try {
    const { 
      academicYear, term, status, level, 
      dateFrom, dateTo, search,
      page = 1, pageSize = 50 
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const startIdx = (pageNum - 1) * size;

    // Check cache
    const cacheKey = generateCacheKey('attendance_report', req.query);
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
      console.log('Serving attendance report from cache');
      return res.status(200).json(cachedData);
    }

    let query = firestore.collectionGroup('attendance');

    if (academicYear) query = query.where('academicYear', '==', academicYear);
    if (term) query = query.where('term', '==', Number(term));
    if (status) query = query.where('status', '==', status);
    if (level) query = query.where('level', '==', level);

    // Native Date Range Filtering
    if (dateFrom && dateTo) {
      query = query.where('date', '>=', dateFrom).where('date', '<=', dateTo + ' 23:59:59');
    } else if (dateFrom) {
      query = query.where('date', '>=', dateFrom);
    } else if (dateTo) {
      query = query.where('date', '<=', dateTo + ' 23:59:59');
    }

    query = query.orderBy('date', 'desc');

    let totalRecords = 0;
    let paginatedRecords = [];

    // If search is provided, we must fetch everything (expensive) and filter in-memory.
    // Otherwise, we use cheap native count() and limit()
    if (search) {
      const snapshot = await query.get();
      let allRecords = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const userId = doc.ref.path.split('/')[1];
        allRecords.push(enrichRecord({ ...data, id: doc.id }, { code: data.code, fullName: data.fullName, level: data.level }, userId));
      });

      const searchLower = search.toLowerCase();
      const filtered = allRecords.filter(r => 
        (r.fullName && r.fullName.toLowerCase().includes(searchLower)) ||
        (r.code && r.code.toLowerCase().includes(searchLower))
      );

      totalRecords = filtered.length;
      paginatedRecords = filtered.slice(startIdx, startIdx + size);
    } else {
      // Fast path: use count() and limit()
      const countSnapshot = await query.count().get();
      totalRecords = countSnapshot.data().count;

      const pageSnapshot = await query.limit(size).offset(startIdx).get();
      pageSnapshot.forEach(doc => {
        const data = doc.data();
        const userId = doc.ref.path.split('/')[1];
        paginatedRecords.push(enrichRecord({ ...data, id: doc.id }, { code: data.code, fullName: data.fullName, level: data.level }, userId));
      });
    }

    const totalPages = Math.ceil(totalRecords / size);

    const responseData = {
      records: paginatedRecords,
      pagination: {
        page: pageNum,
        pageSize: size,
        totalRecords,
        totalPages,
      }
    };

    // Cache the result
    myCache.set(cacheKey, responseData);

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error getting attendance report:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ============================================================
// GET /api/attendance/summary
// Aggregated attendance summary statistics
// ============================================================
const getAttendanceSummary = async (req, res) => {
  try {
    const { academicYear, term, level } = req.query;

    // Check cache
    const cacheKey = generateCacheKey('attendance_summary', req.query);
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
      console.log('Serving attendance summary from cache');
      return res.status(200).json(cachedData);
    }

    // Get users (optionally filtered by level)
    let usersQuery = firestore.collection('users');
    if (level) {
      usersQuery = usersQuery.where('level', '==', level);
    }
    const usersSnapshot = await usersQuery.get();

    const users = {};
    let totalStudents = 0;
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      users[doc.id] = {
        fullName: data.fullName,
        code: data.code || doc.id,
        level: data.level,
        church: data.church,
      };
      totalStudents++;
    });

    // Query attendance
    let query = firestore.collectionGroup('attendance');
    if (academicYear) query = query.where('academicYear', '==', academicYear);
    if (term) query = query.where('term', '==', Number(term));
    if (level) query = query.where('level', '==', level); // Use denormalized field

    // We don't order by date for a summary (aggregation), saves some index overhead
    const snapshot = await query.get();

    // Aggregate
    let totalRecords = 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    const studentStats = {};
    const levelStats = {};

    snapshot.forEach(doc => {
      const pathParts = doc.ref.path.split('/');
      const userId = pathParts[1];

      // Skip if user not in our filtered set
      if (level && !users[userId]) return;

      const data = doc.data();
      const normalized = normalizeStatus(data.status);

      totalRecords++;

      switch (normalized) {
        case ATTENDANCE_STATUS.PRESENT: present++; break;
        case ATTENDANCE_STATUS.ABSENT: absent++; break;
        case ATTENDANCE_STATUS.LATE: late++; break;
        case ATTENDANCE_STATUS.EXCUSED: excused++; break;
        default: break;
      }

      // Student-level aggregation
      if (!studentStats[userId]) {
        const userData = users[userId] || { fullName: data.fullName, code: data.code, level: data.level };
        studentStats[userId] = {
          userId,
          fullName: userData.fullName || '',
          code: userData.code || userId,
          level: userData.level || '',
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          total: 0,
        };
      }
      studentStats[userId].total++;
      switch (normalized) {
        case ATTENDANCE_STATUS.PRESENT: studentStats[userId].present++; break;
        case ATTENDANCE_STATUS.ABSENT: studentStats[userId].absent++; break;
        case ATTENDANCE_STATUS.LATE: studentStats[userId].late++; break;
        case ATTENDANCE_STATUS.EXCUSED: studentStats[userId].excused++; break;
        default: break;
      }

      // Level-level aggregation
      const userLevel = data.level || (users[userId]?.level) || 'غير محدد';
      if (!levelStats[userLevel]) {
        levelStats[userLevel] = {
          level: userLevel,
          students: new Set(),
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          total: 0,
        };
      }
      levelStats[userLevel].students.add(userId);
      levelStats[userLevel].total++;
      switch (normalized) {
        case ATTENDANCE_STATUS.PRESENT: levelStats[userLevel].present++; break;
        case ATTENDANCE_STATUS.ABSENT: levelStats[userLevel].absent++; break;
        case ATTENDANCE_STATUS.LATE: levelStats[userLevel].late++; break;
        case ATTENDANCE_STATUS.EXCUSED: levelStats[userLevel].excused++; break;
        default: break;
      }
    });

    const attendanceRate = totalRecords > 0
      ? Math.round((present / totalRecords) * 1000) / 10
      : 0;

    const studentSummary = Object.values(studentStats).map(s => ({
      ...s,
      attendanceRate: s.total > 0
        ? Math.round((s.present / s.total) * 1000) / 10
        : 0,
    }));

    const levelSummary = Object.values(levelStats).map(l => ({
      level: l.level,
      students: l.students.size,
      present: l.present,
      absent: l.absent,
      late: l.late,
      excused: l.excused,
      total: l.total,
      attendanceRate: l.total > 0
        ? Math.round((l.present / l.total) * 1000) / 10
        : 0,
    }));

    const responseData = {
      summary: {
        totalStudents,
        totalRecords,
        present,
        absent,
        late,
        excused,
        attendanceRate,
      },
      studentSummary,
      levelSummary,
    };

    // Cache it
    myCache.set(cacheKey, responseData);

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error getting attendance summary:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ============================================================
// GET /api/attendance/export
// Export attendance data (returns all filtered records for Excel export)
// ============================================================
const exportAttendance = async (req, res) => {
  try {
    const { 
      academicYear, term, status, level, 
      dateFrom, dateTo, search
    } = req.query;

    // Similar to getAttendanceReport but without pagination
    let userFilter = null;
    if (level || search) {
      const usersSnapshot = await firestore.collection('users').get();
      userFilter = {};
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        let include = true;
        if (level && data.level !== level) include = false;
        if (search) {
          const searchLower = search.toLowerCase();
          const matchesName = (data.fullName || '').toLowerCase().includes(searchLower);
          const matchesCode = (data.code || doc.id).toLowerCase().includes(searchLower);
          if (!matchesName && !matchesCode) include = false;
        }
        if (include) {
          userFilter[doc.id] = {
            fullName: data.fullName,
            code: data.code || doc.id,
            level: data.level,
            church: data.church,
          };
        }
      });
    }

    let query = firestore.collectionGroup('attendance');
    if (academicYear) query = query.where('academicYear', '==', academicYear);
    if (term) query = query.where('term', '==', Number(term));
    if (status) query = query.where('status', '==', status);
    query = query.orderBy('date', 'desc');

    const snapshot = await query.get();
    const userCache = userFilter || {};
    const userIdsToFetch = new Set();
    const rawRecords = [];

    snapshot.forEach(doc => {
      const pathParts = doc.ref.path.split('/');
      const userId = pathParts[1];
      if (userFilter && !userFilter[userId]) return;
      if (!userCache[userId]) userIdsToFetch.add(userId);
      rawRecords.push({ docId: doc.id, userId, data: doc.data() });
    });

    // Fetch missing users
    if (userIdsToFetch.size > 0) {
      const userIds = Array.from(userIdsToFetch);
      for (let i = 0; i < userIds.length; i += 100) {
        const batch = userIds.slice(i, i + 100);
        const refs = batch.map(id => firestore.collection('users').doc(id));
        const docs = await firestore.getAll(...refs);
        docs.forEach(doc => {
          if (doc.exists) {
            const data = doc.data();
            userCache[doc.id] = {
              fullName: data.fullName,
              code: data.code || doc.id,
              level: data.level,
              church: data.church,
            };
          }
        });
      }
    }

    let records = rawRecords.map(r => {
      const userData = userCache[r.userId] || {};
      return enrichRecord({ ...r.data, id: r.docId }, userData, r.userId);
    });

    if (dateFrom || dateTo) {
      records = records.filter(r => {
        if (dateFrom && r.date < dateFrom) return false;
        if (dateTo && r.date > dateTo) return false;
        return true;
      });
    }

    return res.status(200).json({ records });
  } catch (error) {
    console.error('Error exporting attendance:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ============================================================
// GET /api/attendance/academic-years
// Get distinct academic years from attendance data
// ============================================================
const getAcademicYears = async (req, res) => {
  try {
    // Query all attendance and collect distinct academic years
    // For efficiency, we use the config as primary source and supplement with data
    const { db } = require('../config/firebase-config');
    
    const years = new Set();
    
    // Add current academic year
    years.add(getCurrentAcademicYear());
    
    // Try to get from config
    try {
      const configSnapshot = await db.ref('config/academicYear').once('value');
      const configYear = configSnapshot.val();
      if (configYear) years.add(configYear);
    } catch (e) {
      // Config might not have this
    }

    // Sample attendance to find available years (limit to reduce reads)
    const snapshot = await firestore.collectionGroup('attendance')
      .orderBy('date', 'desc')
      .limit(500)
      .get();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.academicYear) {
        years.add(data.academicYear);
      }
    });

    const sortedYears = Array.from(years).sort().reverse();
    
    return res.status(200).json({ 
      years: sortedYears,
      currentYear: getCurrentAcademicYear()
    });
  } catch (error) {
    console.error('Error getting academic years:', error);
    return res.status(500).json({ error: error.message });
  }
};

const bulkMarkAttendance = async (req, res) => {
  try {
    const { userIds, status, date } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'Missing or invalid userIds array' });
    }

    const { db } = require('../config/firebase-config');

    // 1. Fetch active term and config
    const configSnapshot = await db.ref('config').once('value');
    const config = configSnapshot.val();
    const activeTerm = config?.terms?.current_term || 1;
    const academicYear = config?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    const termKeyMap = { 1: 'firstTerm', 2: 'secondTerm', 3: 'thirdTerm' };
    const termConfigKeyMap = { 1: 'first_term', 2: 'second_term', 3: 'third_term' };
    const termKey = termKeyMap[activeTerm] || 'firstTerm';
    const termConfigKey = termConfigKeyMap[activeTerm] || 'first_term';

    const totalAttendanceDegree = Number(config?.degrees?.attendance) || 0;
    const sessionsPerTerm = Number(config?.terms?.[termConfigKey]?.week_count) || 1;
    const degreePerSession = totalAttendanceDegree / sessionsPerTerm;

    // Use provided date or fallback to now
    let dateStr = date;
    if (!dateStr) {
      const now = new Date();
      dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    const attendanceStatus = status || "تم الحضور";

    // 2. Fetch all user data concurrently to get their levels and names
    const userDocs = await Promise.all(
      userIds.map(code => firestore.collection('users').doc(code).get())
    );

    const batches = [];
    let currentBatch = firestore.batch();
    let currentBatchSize = 0;

    for (let i = 0; i < userDocs.length; i++) {
      const userDoc = userDocs[i];
      const code = userIds[i];

      if (!userDoc.exists) continue;
      const userData = userDoc.data();

      // Attendance record
      const attendanceRef = firestore.collection('users').doc(code).collection('attendance').doc();
      const attendanceRecord = {
        date: dateStr,
        status: attendanceStatus,
        term: activeTerm,
        academicYear: academicYear,
        code: userData.code || code,
        fullName: userData.fullName || '',
        level: userData.level || ''
      };

      currentBatch.set(attendanceRef, attendanceRecord);
      currentBatchSize++;

      // Ideally we would update academicRecords here, but because degree calculation relies on
      // knowing the total number of attended sessions, doing it correctly requires a count() query
      // per user, which can't be batched. We will just insert the attendance record. 
      // The frontend can trigger `syncAllAttendanceDegrees` independently or we run it nightly, 
      // OR we just increment their current degree if we fetch it. 
      // For speed and safety in a bulk action, just writing the attendance record is best.

      if (currentBatchSize >= 490) {
        batches.push(currentBatch.commit());
        currentBatch = firestore.batch();
        currentBatchSize = 0;
      }
    }

    if (currentBatchSize > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);
    
    // Invalidate cache
    myCache.flushAll();

    return res.status(200).json({ 
      message: `Successfully marked attendance for ${userIds.length} users`,
      date: dateStr,
      status: attendanceStatus
    });

  } catch (error) {
    console.error('Error bulk marking attendance:', error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getUserAttendance,
  getAttendanceReport,
  getAttendanceSummary,
  exportAttendance,
  getAcademicYears,
  bulkMarkAttendance,
};
