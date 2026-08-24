import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Kept for schema compatibility with the previous D1/R2 release.
// New submissions do not write student data to this table.
export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    classId: text("class_id").notNull(),
    sessionId: text("session_id").notNull(),
    studentNumber: integer("student_number").notNull(),
    studentName: text("student_name").notNull(),
    observedAt: text("observed_at").notNull(),
    memo: text("memo").notNull().default(""),
    imageKey: text("image_key").notNull(),
    imageType: text("image_type").notNull().default("image/jpeg"),
    imageBytes: integer("image_bytes").notNull(),
    status: text("status").notNull().default("visible"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("observations_request_id_unique").on(table.requestId),
    uniqueIndex("observations_image_key_unique").on(table.imageKey),
    index("observations_class_created_idx").on(table.classId, table.createdAt),
    index("observations_session_created_idx").on(table.sessionId, table.createdAt),
    index("observations_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const teachers = sqliteTable(
  "teachers",
  {
    id: text("id").primaryKey(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    rootFolderId: text("root_folder_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("teachers_google_sub_unique").on(table.googleSub),
    index("teachers_email_idx").on(table.email),
  ],
);

export const classes = sqliteTable(
  "classes",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id").notNull(),
    label: text("label").notNull(),
    inviteTokenHash: text("invite_token_hash").notNull(),
    encryptedInviteToken: text("encrypted_invite_token").notNull(),
    driveFolderId: text("drive_folder_id").notNull(),
    galleryEnabled: integer("gallery_enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("classes_teacher_unique").on(table.teacherId),
    uniqueIndex("classes_invite_token_hash_unique").on(table.inviteTokenHash),
    index("classes_drive_folder_idx").on(table.driveFolderId),
  ],
);

export const submissionReceipts = sqliteTable(
  "submission_receipts",
  {
    requestId: text("request_id").primaryKey(),
    classId: text("class_id").notNull(),
    sessionId: text("session_id").notNull(),
    driveFileId: text("drive_file_id").notNull(),
    status: text("status").notNull().default("visible"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("submission_receipts_drive_file_unique").on(table.driveFileId),
    index("submission_receipts_class_created_idx").on(table.classId, table.createdAt),
    index("submission_receipts_session_created_idx").on(table.sessionId, table.createdAt),
    index("submission_receipts_status_idx").on(table.classId, table.status),
  ],
);
