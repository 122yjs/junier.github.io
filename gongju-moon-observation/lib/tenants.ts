import { getEnv } from "./runtime";

export interface TeacherRecord {
  id: string;
  googleSub: string;
  email: string;
  displayName: string;
  encryptedRefreshToken: string;
  rootFolderId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassRecord {
  id: string;
  teacherId: string;
  label: string;
  inviteTokenHash: string;
  encryptedInviteToken: string;
  driveFolderId: string;
  galleryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionReceipt {
  requestId: string;
  classId: string;
  sessionId: string;
  driveFileId: string;
  status: "visible" | "hidden";
  createdAt: string;
}

interface TeacherRow {
  id: string;
  google_sub: string;
  email: string;
  display_name: string;
  encrypted_refresh_token: string;
  root_folder_id: string;
  created_at: string;
  updated_at: string;
}

interface ClassRow {
  id: string;
  teacher_id: string;
  label: string;
  invite_token_hash: string;
  encrypted_invite_token: string;
  drive_folder_id: string;
  gallery_enabled: number;
  created_at: string;
  updated_at: string;
}

interface ReceiptRow {
  request_id: string;
  class_id: string;
  session_id: string;
  drive_file_id: string;
  status: "visible" | "hidden";
  created_at: string;
}

export async function getTeacherById(id: string) {
  const row = await getEnv().DB.prepare(
    `SELECT id, google_sub, email, display_name, encrypted_refresh_token,
            root_folder_id, created_at, updated_at
       FROM teachers WHERE id = ? LIMIT 1`,
  )
    .bind(id)
    .first<TeacherRow>();
  return row ? teacherFromRow(row) : null;
}

export async function getTeacherByGoogleSub(googleSub: string) {
  const row = await getEnv().DB.prepare(
    `SELECT id, google_sub, email, display_name, encrypted_refresh_token,
            root_folder_id, created_at, updated_at
       FROM teachers WHERE google_sub = ? LIMIT 1`,
  )
    .bind(googleSub)
    .first<TeacherRow>();
  return row ? teacherFromRow(row) : null;
}

export async function insertTeacher(record: TeacherRecord) {
  await getEnv().DB.prepare(
    `INSERT INTO teachers
      (id, google_sub, email, display_name, encrypted_refresh_token,
       root_folder_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      record.id,
      record.googleSub,
      record.email,
      record.displayName,
      record.encryptedRefreshToken,
      record.rootFolderId,
      record.createdAt,
      record.updatedAt,
    )
    .run();
  return record;
}

export async function updateTeacher(record: TeacherRecord) {
  await getEnv().DB.prepare(
    `UPDATE teachers
        SET email = ?, display_name = ?, encrypted_refresh_token = ?,
            root_folder_id = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      record.email,
      record.displayName,
      record.encryptedRefreshToken,
      record.rootFolderId,
      record.updatedAt,
      record.id,
    )
    .run();
  return record;
}

export async function getClassById(id: string) {
  const row = await getEnv().DB.prepare(
    `SELECT id, teacher_id, label, invite_token_hash, encrypted_invite_token,
            drive_folder_id, gallery_enabled, created_at, updated_at
       FROM classes WHERE id = ? LIMIT 1`,
  )
    .bind(id)
    .first<ClassRow>();
  return row ? classFromRow(row) : null;
}

export async function getClassByTeacherId(teacherId: string) {
  const row = await getEnv().DB.prepare(
    `SELECT id, teacher_id, label, invite_token_hash, encrypted_invite_token,
            drive_folder_id, gallery_enabled, created_at, updated_at
       FROM classes WHERE teacher_id = ? ORDER BY created_at LIMIT 1`,
  )
    .bind(teacherId)
    .first<ClassRow>();
  return row ? classFromRow(row) : null;
}

export async function getClassByInviteHash(inviteTokenHash: string) {
  const row = await getEnv().DB.prepare(
    `SELECT id, teacher_id, label, invite_token_hash, encrypted_invite_token,
            drive_folder_id, gallery_enabled, created_at, updated_at
       FROM classes WHERE invite_token_hash = ? LIMIT 1`,
  )
    .bind(inviteTokenHash)
    .first<ClassRow>();
  return row ? classFromRow(row) : null;
}

export async function insertClass(record: ClassRecord) {
  await getEnv().DB.prepare(
    `INSERT INTO classes
      (id, teacher_id, label, invite_token_hash, encrypted_invite_token,
       drive_folder_id, gallery_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      record.id,
      record.teacherId,
      record.label,
      record.inviteTokenHash,
      record.encryptedInviteToken,
      record.driveFolderId,
      record.galleryEnabled ? 1 : 0,
      record.createdAt,
      record.updatedAt,
    )
    .run();
  return record;
}

export async function updateClass(record: ClassRecord) {
  await getEnv().DB.prepare(
    `UPDATE classes
        SET label = ?, invite_token_hash = ?, encrypted_invite_token = ?,
            drive_folder_id = ?, gallery_enabled = ?, updated_at = ?
      WHERE id = ? AND teacher_id = ?`,
  )
    .bind(
      record.label,
      record.inviteTokenHash,
      record.encryptedInviteToken,
      record.driveFolderId,
      record.galleryEnabled ? 1 : 0,
      record.updatedAt,
      record.id,
      record.teacherId,
    )
    .run();
  return record;
}

export async function getClassAndTeacher(classId: string) {
  const classRecord = await getClassById(classId);
  if (!classRecord) return null;
  const teacher = await getTeacherById(classRecord.teacherId);
  if (!teacher) return null;
  return { classRecord, teacher };
}

export async function getTeacherWorkspace(teacherId: string) {
  const [teacher, classRecord] = await Promise.all([
    getTeacherById(teacherId),
    getClassByTeacherId(teacherId),
  ]);
  if (!teacher || !classRecord) return null;
  return { teacher, classRecord };
}

export async function deleteTeacherWorkspace(teacherId: string, classId: string) {
  const runtime = getEnv();
  await runtime.DB.batch([
    runtime.DB.prepare("DELETE FROM submission_receipts WHERE class_id = ?").bind(classId),
    runtime.DB.prepare("DELETE FROM classes WHERE id = ? AND teacher_id = ?").bind(classId, teacherId),
    runtime.DB.prepare("DELETE FROM teachers WHERE id = ?").bind(teacherId),
  ]);
}

export async function getReceipt(requestId: string) {
  const row = await getEnv().DB.prepare(
    `SELECT request_id, class_id, session_id, drive_file_id, status, created_at
       FROM submission_receipts WHERE request_id = ? LIMIT 1`,
  )
    .bind(requestId)
    .first<ReceiptRow>();
  return row ? receiptFromRow(row) : null;
}

export async function insertReceipt(record: SubmissionReceipt) {
  await getEnv().DB.prepare(
    `INSERT INTO submission_receipts
      (request_id, class_id, session_id, drive_file_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      record.requestId,
      record.classId,
      record.sessionId,
      record.driveFileId,
      record.status,
      record.createdAt,
    )
    .run();
  return record;
}

export async function updateReceiptStatus(
  classId: string,
  driveFileId: string,
  status: "visible" | "hidden",
) {
  await getEnv().DB.prepare(
    "UPDATE submission_receipts SET status = ? WHERE class_id = ? AND drive_file_id = ?",
  )
    .bind(status, classId, driveFileId)
    .run();
}

export async function deleteReceiptByDriveFileId(classId: string, driveFileId: string) {
  await getEnv().DB.prepare(
    "DELETE FROM submission_receipts WHERE class_id = ? AND drive_file_id = ?",
  )
    .bind(classId, driveFileId)
    .run();
}

export async function countVisibleReceipts(classId: string) {
  const row = await getEnv().DB.prepare(
    "SELECT COUNT(*) AS count FROM submission_receipts WHERE class_id = ? AND status = 'visible'",
  )
    .bind(classId)
    .first<{ count: number }>();
  return Number(row?.count || 0);
}

export async function countRecentSubmissions(sessionId: string, classId: string) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [deviceCount, classCount] = await Promise.all([
    getEnv().DB.prepare(
      "SELECT COUNT(*) AS count FROM submission_receipts WHERE session_id = ? AND created_at >= ?",
    )
      .bind(sessionId, tenMinutesAgo)
      .first<{ count: number }>(),
    getEnv().DB.prepare(
      "SELECT COUNT(*) AS count FROM submission_receipts WHERE class_id = ? AND created_at >= ?",
    )
      .bind(classId, oneHourAgo)
      .first<{ count: number }>(),
  ]);
  return {
    deviceCount: Number(deviceCount?.count || 0),
    classCount: Number(classCount?.count || 0),
  };
}

function teacherFromRow(row: TeacherRow): TeacherRecord {
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    displayName: row.display_name,
    encryptedRefreshToken: row.encrypted_refresh_token,
    rootFolderId: row.root_folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function classFromRow(row: ClassRow): ClassRecord {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    label: row.label,
    inviteTokenHash: row.invite_token_hash,
    encryptedInviteToken: row.encrypted_invite_token,
    driveFolderId: row.drive_folder_id,
    galleryEnabled: Boolean(row.gallery_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function receiptFromRow(row: ReceiptRow): SubmissionReceipt {
  return {
    requestId: row.request_id,
    classId: row.class_id,
    sessionId: row.session_id,
    driveFileId: row.drive_file_id,
    status: row.status,
    createdAt: row.created_at,
  };
}
