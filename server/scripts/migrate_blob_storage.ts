/**
 * Vercel Blob Storage Migration Script: Public Store to Private Store
 * 
 * Safely and non-destructively migrates existing files from legacy public Vercel Blob URLs
 * or unauthenticated URLs into a genuinely private Vercel Blob store, updating database
 * references to point to secure, access-controlled LMS gateway endpoints (/api/v1/storage/${storageKey}).
 * 
 * Flags:
 *   --dry-run         Inspect and report records that require migration without modifying storage or database.
 *   --delete-legacy   Delete the original legacy blob from the public store only AFTER successful migration.
 *                     (Default: false - leaves legacy objects intact to ensure zero data loss).
 * 
 * Usage:
 *   npx ts-node server/scripts/migrate_blob_storage.ts [--dry-run] [--delete-legacy]
 */

import { PrismaClient } from '@prisma/client';
import { put, del } from '@vercel/blob';
import path from 'path';

const prisma = new PrismaClient();

const isDryRun = process.argv.includes('--dry-run');
const deleteLegacy = process.argv.includes('--delete-legacy');

async function migrate() {
  console.log('========================================================');
  console.log('  LMS VERCEL BLOB STORAGE MIGRATION SUITE');
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (Read Only)' : 'LIVE EXECUTION'}`);
  console.log(`  Delete Legacy Blobs: ${deleteLegacy ? 'YES' : 'NO (Non-destructive safe default)'}`);
  console.log('========================================================\n');

  const privateToken =
    process.env.BLOB_PRIVATE_READ_WRITE_TOKEN ||
    process.env.BLOB_READ_WRITE_TOKEN;

  if (!privateToken) {
    console.error('ERROR: Missing BLOB_PRIVATE_READ_WRITE_TOKEN (or BLOB_READ_WRITE_TOKEN).');
    console.error('Cannot migrate to private store without a valid private read/write token.');
    process.exit(1);
  }

  let totalScanned = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // 1. Migrate Assignment Submissions
  console.log('[1/4] Scanning AssignmentSubmission attachments...');
  const submissions = await prisma.assignmentSubmission.findMany({
    where: {
      attachmentUrl: {
        not: null,
      },
    },
    select: { id: true, attachmentUrl: true },
  });

  for (const sub of submissions) {
    totalScanned++;
    const currentUrl = sub.attachmentUrl!;
    if (isLegacyPublicBlob(currentUrl)) {
      console.log(`  Found public blob submission [${sub.id}]: ${currentUrl}`);
      if (isDryRun) {
        totalMigrated++;
        continue;
      }

      try {
        const newUrl = await migrateObject(currentUrl, 'submissions', privateToken);
        await prisma.assignmentSubmission.update({
          where: { id: sub.id },
          data: { attachmentUrl: newUrl },
        });
        console.log(`  -> Migrated to private gateway: ${newUrl}`);
        totalMigrated++;

        if (deleteLegacy) {
          await safelyDeleteOld(currentUrl);
        }
      } catch (err: any) {
        console.error(`  -> Failed migrating submission ${sub.id}: ${err.message}`);
        totalErrors++;
      }
    } else {
      totalSkipped++;
    }
  }

  // 2. Migrate Lesson Attachments
  console.log('\n[2/4] Scanning LessonAttachment files...');
  const lessonAttachments = await prisma.lessonAttachment.findMany({
    select: { id: true, fileUrl: true, fileName: true, fileType: true },
  });

  for (const att of lessonAttachments) {
    totalScanned++;
    if (isLegacyPublicBlob(att.fileUrl)) {
      console.log(`  Found public blob lesson attachment [${att.id}]: ${att.fileUrl}`);
      if (isDryRun) {
        totalMigrated++;
        continue;
      }

      try {
        const newUrl = await migrateObject(att.fileUrl, 'courses', privateToken, att.fileType);
        await prisma.lessonAttachment.update({
          where: { id: att.id },
          data: { fileUrl: newUrl },
        });
        console.log(`  -> Migrated to private gateway: ${newUrl}`);
        totalMigrated++;

        if (deleteLegacy) {
          await safelyDeleteOld(att.fileUrl);
        }
      } catch (err: any) {
        console.error(`  -> Failed migrating lesson attachment ${att.id}: ${err.message}`);
        totalErrors++;
      }
    } else {
      totalSkipped++;
    }
  }

  // 3. Migrate Assessment Items
  console.log('\n[3/4] Scanning AssessmentItem attachments...');
  const assessmentItems = await prisma.assessmentItem.findMany({
    where: { attachmentUrl: { not: null } },
    select: { id: true, attachmentUrl: true },
  });

  for (const item of assessmentItems) {
    totalScanned++;
    if (isLegacyPublicBlob(item.attachmentUrl!)) {
      console.log(`  Found public blob assessment item [${item.id}]: ${item.attachmentUrl}`);
      if (isDryRun) {
        totalMigrated++;
        continue;
      }

      try {
        const newUrl = await migrateObject(item.attachmentUrl!, 'exams', privateToken);
        await prisma.assessmentItem.update({
          where: { id: item.id },
          data: { attachmentUrl: newUrl },
        });
        console.log(`  -> Migrated to private gateway: ${newUrl}`);
        totalMigrated++;

        if (deleteLegacy) {
          await safelyDeleteOld(item.attachmentUrl!);
        }
      } catch (err: any) {
        console.error(`  -> Failed migrating assessment item ${item.id}: ${err.message}`);
        totalErrors++;
      }
    } else {
      totalSkipped++;
    }
  }

  // 4. Migrate Assessment Submission Records
  console.log('\n[4/4] Scanning AssessmentSubmissionRecord attachments...');
  const submissionRecords = await prisma.assessmentSubmissionRecord.findMany({
    where: { attachmentUrl: { not: null } },
    select: { id: true, attachmentUrl: true },
  });

  for (const rec of submissionRecords) {
    totalScanned++;
    if (isLegacyPublicBlob(rec.attachmentUrl!)) {
      console.log(`  Found public blob assessment record [${rec.id}]: ${rec.attachmentUrl}`);
      if (isDryRun) {
        totalMigrated++;
        continue;
      }

      try {
        const newUrl = await migrateObject(rec.attachmentUrl!, 'submissions', privateToken);
        await prisma.assessmentSubmissionRecord.update({
          where: { id: rec.id },
          data: { attachmentUrl: newUrl },
        });
        console.log(`  -> Migrated to private gateway: ${newUrl}`);
        totalMigrated++;

        if (deleteLegacy) {
          await safelyDeleteOld(rec.attachmentUrl!);
        }
      } catch (err: any) {
        console.error(`  -> Failed migrating assessment record ${rec.id}: ${err.message}`);
        totalErrors++;
      }
    } else {
      totalSkipped++;
    }
  }

  console.log('\n========================================================');
  console.log('  MIGRATION SUMMARY');
  console.log(`  Total Records Scanned:  ${totalScanned}`);
  console.log(`  Total Migrated:         ${totalMigrated}`);
  console.log(`  Total Already Secure:   ${totalSkipped}`);
  console.log(`  Total Errors:           ${totalErrors}`);
  console.log('========================================================\n');

  await prisma.$disconnect();
}

function isLegacyPublicBlob(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('.public.blob.vercel-storage.com') ||
    (url.startsWith('https://') && url.includes('blob.vercel-storage.com') && !url.includes('.private.blob.'))
  );
}

async function migrateObject(
  legacyUrl: string,
  folder: string,
  privateToken: string,
  explicitMimeType?: string
): Promise<string> {
  const res = await fetch(legacyUrl);
  if (!res.ok) {
    throw new Error(`Failed to download legacy blob from ${legacyUrl}: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = explicitMimeType || res.headers.get('content-type') || 'application/octet-stream';
  const urlObj = new URL(legacyUrl);
  const originalFilename = path.basename(urlObj.pathname) || 'migrated-file';

  const newKey = `${folder}/migrated-${Date.now()}-${originalFilename}`;

  // Upload to genuine private store
  await put(newKey, buffer, {
    access: 'private',
    token: privateToken,
    contentType: mimeType,
  });

  return `/api/v1/storage/${newKey}`;
}

async function safelyDeleteOld(oldUrl: string) {
  try {
    await del(oldUrl);
    console.log(`  -> Old public blob removed from store: ${oldUrl}`);
  } catch (err: any) {
    console.warn(`  -> Note: Old blob could not be removed (${err.message}). Safe to prune manually.`);
  }
}

if (require.main === module) {
  migrate().catch((e) => {
    console.error('Fatal migration error:', e);
    process.exit(1);
  });
}

