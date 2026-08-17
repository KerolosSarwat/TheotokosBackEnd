/**
 * One-time migration script: Realtime DB → Firestore
 * 
 * Migrates:
 * 1. users/ → Firestore users collection (with degree → academicRecords subcollection)
 * 2. penddingUsers/ → Firestore pendingUsers collection
 * 
 * Usage:
 *   cd TheotokosBackEnd
 *   node scripts/migrateToFirestore.js [academicYear]
 * 
 * Example:
 *   node scripts/migrateToFirestore.js 2026-2027
 * 
 * If no academic year is provided, it defaults to config.academicYear or current year range.
 * 
 * ⚠️  BACK UP YOUR DATABASE BEFORE RUNNING THIS SCRIPT!
 */

const dotenv = require('dotenv');
dotenv.config();

const { db, firestore } = require('../config/firebase-config');

async function migrate() {
  const argYear = process.argv[2]; // e.g. "2026-2027"

  // Determine academic year
  let academicYear = argYear;
  if (!academicYear) {
    const configSnapshot = await db.ref('config/academicYear').once('value');
    academicYear = configSnapshot.val();
  }
  if (!academicYear) {
    const now = new Date();
    const year = now.getFullYear();
    // Academic year runs Sep–Aug. If current month >= 9, it's YEAR-YEAR+1. Otherwise YEAR-1-YEAR.
    if (now.getMonth() >= 8) { // 8 = September (0-indexed)
      academicYear = `${year}-${year + 1}`;
    } else {
      academicYear = `${year - 1}-${year}`;
    }
  }

  console.log(`\n🎓 Academic year for migration: ${academicYear}\n`);

  // ==========================================
  // 1. Migrate users
  // ==========================================
  console.log('📦 Fetching users from Realtime DB...');
  const usersSnapshot = await db.ref('users').once('value');
  const usersData = usersSnapshot.val();

  if (!usersData) {
    console.log('⚠️  No users found in Realtime DB. Skipping users migration.');
  } else {
    const userCodes = Object.keys(usersData);
    console.log(`✅ Found ${userCodes.length} users. Starting migration...\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const code of userCodes) {
      try {
        const userData = usersData[code];
        const { degree, ...userWithoutDegree } = userData;

        // Write user document to Firestore (without degree)
        const userDocRef = firestore.collection('users').doc(code);
        await userDocRef.set({
          ...userWithoutDegree,
          code: code
        });

        // If there's degree data, write it as an academic record subcollection doc
        if (degree) {
          const academicRecordRef = userDocRef.collection('academicRecords').doc(academicYear);
          await academicRecordRef.set({
            academicYear: academicYear,
            level: userData.level || '',
            firstTerm: degree.firstTerm || { agbya: 0, coptic: 0, hymns: 0, taks: 0, attencance: 0, total: 0 },
            secondTerm: degree.secondTerm || { agbya: 0, coptic: 0, hymns: 0, taks: 0, attencance: 0, total: 0 },
            thirdTerm: degree.thirdTerm || { agbya: 0, coptic: 0, hymns: 0, taks: 0, attencance: 0, total: 0 }
          });
        }

        successCount++;
        if (successCount % 50 === 0) {
          console.log(`   ... migrated ${successCount}/${userCodes.length} users`);
        }
      } catch (err) {
        errorCount++;
        console.error(`   ❌ Error migrating user ${code}:`, err.message);
      }
    }

    console.log(`\n✅ Users migration complete: ${successCount} succeeded, ${errorCount} failed.\n`);
  }

  // ==========================================
  // 2. Migrate pendingUsers
  // ==========================================
  console.log('📦 Fetching pendingUsers from Realtime DB...');
  const pendingSnapshot = await db.ref('penddingUsers').once('value');
  const pendingData = pendingSnapshot.val();

  if (!pendingData) {
    console.log('⚠️  No pending users found in Realtime DB. Skipping pending users migration.');
  } else {
    const pendingCodes = Object.keys(pendingData);
    console.log(`✅ Found ${pendingCodes.length} pending users. Starting migration...\n`);

    let pSuccessCount = 0;
    let pErrorCount = 0;

    for (const code of pendingCodes) {
      try {
        const userData = pendingData[code];
        const { degree, ...userWithoutDegree } = userData;

        await firestore.collection('pendingUsers').doc(code).set({
          ...userWithoutDegree,
          code: code
        });

        pSuccessCount++;
      } catch (err) {
        pErrorCount++;
        console.error(`   ❌ Error migrating pending user ${code}:`, err.message);
      }
    }

    console.log(`\n✅ Pending users migration complete: ${pSuccessCount} succeeded, ${pErrorCount} failed.\n`);
  }

  // ==========================================
  // 3. Set academic year in config if not set
  // ==========================================
  const configAcademicYear = (await db.ref('config/academicYear').once('value')).val();
  if (!configAcademicYear) {
    await db.ref('config/academicYear').set(academicYear);
    console.log(`📝 Set config.academicYear to "${academicYear}" in Realtime DB.`);
  } else {
    console.log(`📝 config.academicYear already set to "${configAcademicYear}".`);
  }

  console.log('\n🎉 Migration complete!\n');
  process.exit(0);
}

migrate().catch(err => {
  console.error('💥 Migration failed:', err);
  process.exit(1);
});
