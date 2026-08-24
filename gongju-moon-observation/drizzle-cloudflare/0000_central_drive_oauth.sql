CREATE TABLE `teachers` (
  `id` text PRIMARY KEY NOT NULL,
  `google_sub` text NOT NULL,
  `email` text NOT NULL,
  `display_name` text NOT NULL,
  `encrypted_refresh_token` text NOT NULL,
  `root_folder_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teachers_google_sub_unique` ON `teachers` (`google_sub`);
--> statement-breakpoint
CREATE INDEX `teachers_email_idx` ON `teachers` (`email`);
--> statement-breakpoint
CREATE TABLE `classes` (
  `id` text PRIMARY KEY NOT NULL,
  `teacher_id` text NOT NULL,
  `label` text NOT NULL,
  `invite_token_hash` text NOT NULL,
  `encrypted_invite_token` text NOT NULL,
  `drive_folder_id` text NOT NULL,
  `gallery_enabled` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_teacher_unique` ON `classes` (`teacher_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_invite_token_hash_unique` ON `classes` (`invite_token_hash`);
--> statement-breakpoint
CREATE INDEX `classes_drive_folder_idx` ON `classes` (`drive_folder_id`);
--> statement-breakpoint
CREATE TABLE `submission_receipts` (
  `request_id` text PRIMARY KEY NOT NULL,
  `class_id` text NOT NULL,
  `session_id` text NOT NULL,
  `drive_file_id` text NOT NULL,
  `status` text DEFAULT 'visible' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_receipts_drive_file_unique` ON `submission_receipts` (`drive_file_id`);
--> statement-breakpoint
CREATE INDEX `submission_receipts_class_created_idx` ON `submission_receipts` (`class_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `submission_receipts_session_created_idx` ON `submission_receipts` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `submission_receipts_status_idx` ON `submission_receipts` (`class_id`,`status`);
