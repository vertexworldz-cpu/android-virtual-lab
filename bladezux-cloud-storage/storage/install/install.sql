-- =====================================================================
-- Bladezux Cloud Storage — MySQL / MariaDB installation script
-- Requires MySQL 5.7+ or MariaDB 10.3+ (InnoDB, utf8mb4)
-- Import via phpMyAdmin or: mysql -u USER -p DBNAME < install.sql
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Administrator accounts (Owner + Admins)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `id`                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`                     VARCHAR(120) NOT NULL,
  `email`                    VARCHAR(190) NOT NULL,
  `password_hash`            VARCHAR(255) NULL DEFAULT NULL,
  `role`                     ENUM('owner','admin') NOT NULL DEFAULT 'admin',
  `status`                   ENUM('active','pending','disabled') NOT NULL DEFAULT 'pending',
  `created_by`               INT UNSIGNED NULL DEFAULT NULL,
  `last_login_at`            DATETIME NULL DEFAULT NULL,
  `last_login_ip`            VARCHAR(45) NULL DEFAULT NULL,
  `password_changed_at`      DATETIME NULL DEFAULT NULL,
  `notifications_seen_at`    DATETIME NULL DEFAULT NULL,
  `created_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admins_email` (`email`),
  KEY `idx_admins_role` (`role`),
  KEY `idx_admins_status` (`status`),
  CONSTRAINT `fk_admins_created_by` FOREIGN KEY (`created_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Password reset + invitation tokens (only SHA-256 hashes are stored)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id`      INT UNSIGNED NOT NULL,
  `token_hash`    CHAR(64) NOT NULL,
  `purpose`       ENUM('reset','invite') NOT NULL DEFAULT 'reset',
  `expires_at`    DATETIME NOT NULL,
  `used_at`       DATETIME NULL DEFAULT NULL,
  `requested_ip`  VARCHAR(45) NULL DEFAULT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_resets_token` (`token_hash`),
  KEY `idx_password_resets_admin` (`admin_id`),
  KEY `idx_password_resets_expires` (`expires_at`),
  CONSTRAINT `fk_password_resets_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Active login sessions (session IDs are stored as SHA-256 hashes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `login_sessions` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id`          INT UNSIGNED NOT NULL,
  `session_hash`      CHAR(64) NOT NULL,
  `ip_address`        VARCHAR(45) NULL DEFAULT NULL,
  `user_agent`        VARCHAR(255) NULL DEFAULT NULL,
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at`        DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_login_sessions_hash` (`session_hash`),
  KEY `idx_login_sessions_admin` (`admin_id`, `revoked_at`),
  CONSTRAINT `fk_login_sessions_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Login attempts (rate limiting + login history)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id`      INT UNSIGNED NULL DEFAULT NULL,
  `email_hash`    CHAR(64) NOT NULL,
  `ip_address`    VARCHAR(45) NOT NULL,
  `user_agent`    VARCHAR(255) NULL DEFAULT NULL,
  `success`       TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_login_attempts_email` (`email_hash`, `created_at`),
  KEY `idx_login_attempts_ip` (`ip_address`, `created_at`),
  KEY `idx_login_attempts_admin` (`admin_id`, `created_at`),
  CONSTRAINT `fk_login_attempts_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Generic rate-limit buckets (password reset requests, API bursts)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rate_limits` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `bucket`      VARCHAR(64) NOT NULL,
  `key_hash`    CHAR(64) NOT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rate_limits_lookup` (`bucket`, `key_hash`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Folders (mirrors the folder tree inside the Google Drive app folder)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `folders` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `parent_id`        INT UNSIGNED NULL DEFAULT NULL,
  `name`             VARCHAR(255) NOT NULL,
  `drive_folder_id`  VARCHAR(128) NOT NULL,
  `created_by`       INT UNSIGNED NULL DEFAULT NULL,
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_folders_drive_id` (`drive_folder_id`),
  KEY `idx_folders_parent` (`parent_id`, `name`),
  CONSTRAINT `fk_folders_parent` FOREIGN KEY (`parent_id`) REFERENCES `folders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_folders_created_by` FOREIGN KEY (`created_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Files (metadata only — file contents live in Google Drive)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `files` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `folder_id`       INT UNSIGNED NULL DEFAULT NULL,
  `name`            VARCHAR(255) NOT NULL,
  `extension`       VARCHAR(32) NOT NULL DEFAULT '',
  `mime_type`       VARCHAR(190) NOT NULL DEFAULT 'application/octet-stream',
  `category`        ENUM('image','video','audio','document','pdf','archive','spreadsheet','presentation','other') NOT NULL DEFAULT 'other',
  `size`            BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `drive_file_id`   VARCHAR(128) NOT NULL,
  `md5_checksum`    CHAR(32) NULL DEFAULT NULL,
  `has_thumbnail`   TINYINT(1) NOT NULL DEFAULT 0,
  `uploaded_by`     INT UNSIGNED NULL DEFAULT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_files_drive_id` (`drive_file_id`),
  KEY `idx_files_folder_name` (`folder_id`, `name`),
  KEY `idx_files_category` (`category`),
  KEY `idx_files_created` (`created_at`),
  KEY `idx_files_size` (`size`),
  CONSTRAINT `fk_files_folder` FOREIGN KEY (`folder_id`) REFERENCES `folders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_files_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Google Drive resumable upload sessions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `upload_sessions` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id`          CHAR(32) NOT NULL,
  `admin_id`           INT UNSIGNED NOT NULL,
  `folder_id`          INT UNSIGNED NULL DEFAULT NULL,
  `file_name`          VARCHAR(255) NOT NULL,
  `file_size`          BIGINT UNSIGNED NOT NULL,
  `mime_type`          VARCHAR(190) NOT NULL,
  `fingerprint`        CHAR(64) NOT NULL,
  `session_uri_enc`    TEXT NOT NULL,
  `bytes_uploaded`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `status`             ENUM('pending','uploading','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `replace_file_id`    INT UNSIGNED NULL DEFAULT NULL,
  `drive_file_id`      VARCHAR(128) NULL DEFAULT NULL,
  `error_message`      VARCHAR(255) NULL DEFAULT NULL,
  `expires_at`         DATETIME NOT NULL,
  `created_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_upload_sessions_public` (`public_id`),
  KEY `idx_upload_sessions_fingerprint` (`admin_id`, `fingerprint`, `status`),
  KEY `idx_upload_sessions_expires` (`expires_at`),
  CONSTRAINT `fk_upload_sessions_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_upload_sessions_folder` FOREIGN KEY (`folder_id`) REFERENCES `folders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_upload_sessions_replace` FOREIGN KEY (`replace_file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Google Drive connection (single row, id = 1). Secrets are AES-256-GCM
-- encrypted with the application key stored in the private config file.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `google_settings` (
  `id`                    TINYINT UNSIGNED NOT NULL,
  `client_id`             VARCHAR(255) NULL DEFAULT NULL,
  `client_secret_enc`     TEXT NULL,
  `scope`                 VARCHAR(255) NOT NULL DEFAULT 'https://www.googleapis.com/auth/drive.file',
  `access_token_enc`      TEXT NULL,
  `refresh_token_enc`     TEXT NULL,
  `token_expires_at`      DATETIME NULL DEFAULT NULL,
  `account_email`         VARCHAR(190) NULL DEFAULT NULL,
  `account_name`          VARCHAR(190) NULL DEFAULT NULL,
  `root_folder_id`        VARCHAR(128) NULL DEFAULT NULL,
  `status`                ENUM('not_configured','disconnected','connected','error') NOT NULL DEFAULT 'not_configured',
  `last_error`            VARCHAR(255) NULL DEFAULT NULL,
  `quota_limit`           BIGINT UNSIGNED NULL DEFAULT NULL,
  `quota_usage`           BIGINT UNSIGNED NULL DEFAULT NULL,
  `quota_usage_in_drive`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `quota_updated_at`      DATETIME NULL DEFAULT NULL,
  `last_sync_at`          DATETIME NULL DEFAULT NULL,
  `connected_by`          INT UNSIGNED NULL DEFAULT NULL,
  `connected_at`          DATETIME NULL DEFAULT NULL,
  `updated_at`            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_google_settings_admin` FOREIGN KEY (`connected_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Application settings (key/value). Sensitive values are encrypted.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_settings` (
  `setting_key`    VARCHAR(100) NOT NULL,
  `setting_value`  TEXT NULL,
  `is_encrypted`   TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Activity / audit log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id`      INT UNSIGNED NULL DEFAULT NULL,
  `action`        VARCHAR(64) NOT NULL,
  `target_type`   VARCHAR(32) NULL DEFAULT NULL,
  `target_id`     VARCHAR(64) NULL DEFAULT NULL,
  `description`   VARCHAR(500) NOT NULL,
  `ip_address`    VARCHAR(45) NULL DEFAULT NULL,
  `user_agent`    VARCHAR(255) NULL DEFAULT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_admin` (`admin_id`, `created_at`),
  KEY `idx_activity_action` (`action`),
  KEY `idx_activity_created` (`created_at`),
  CONSTRAINT `fk_activity_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Default data
-- ---------------------------------------------------------------------
INSERT IGNORE INTO `google_settings` (`id`, `status`) VALUES (1, 'not_configured');

INSERT IGNORE INTO `app_settings` (`setting_key`, `setting_value`, `is_encrypted`) VALUES
  ('app_name',            'Bladezux Cloud Storage', 0),
  ('theme',               'light', 0),
  ('timezone',            'UTC', 0),
  ('logo_path',           '', 0),
  ('max_upload_bytes',    '0', 0),
  ('blocked_extensions',  'php,php3,php4,php5,php7,php8,phtml,phar,pht,phps,cgi,pl,py,sh,bash,asp,aspx,jsp,jspx,exe,msi,bat,cmd,com,scr,dll,vbs,ps1,htaccess,htpasswd', 0),
  ('chunk_size_mb',       '16', 0),
  ('duplicate_policy',    'ask', 0),
  ('smtp_host',           '', 0),
  ('smtp_port',           '465', 0),
  ('smtp_encryption',     'ssl', 0),
  ('smtp_username',       '', 0),
  ('smtp_password',       '', 1),
  ('smtp_from_email',     '', 0),
  ('smtp_from_name',      'Bladezux Cloud Storage', 0);
