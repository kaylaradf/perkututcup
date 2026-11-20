# Application Logging Standard

This document defines the mandatory logging format and security rules for this application. All logging implementations must strictly adhere to this specification.

## 1. Format Specification

Use the **Hybrid Format (Bracketed Header + Logfmt Body)**. Every log entry must be a **single line**.

### Template
```text
[TIMESTAMP] [LEVEL] [IP_ADDRESS] [ACTOR] [EVENT] [STATUS] key1=value1 key2="value with spaces"
```

### Fixed Header Fields (Mandatory & Ordered)

All 6 bracketed fields must always be present in this exact order:

1. **`[TIMESTAMP]`**: ISO 8601 format in UTC (`YYYY-MM-DDTHH:MM:SSZ`).
2. **`[LEVEL]`**: Severity level in uppercase:
   * `INFO`: Normal operational events (e.g., login success, data update, file upload).
   * `WARN`: Recoverable anomalies or failed security checks (e.g., login failed, unauthorized access attempt, rate limit hit).
   * `ERROR`: Application errors, exceptions, or failed transactions.
   * `CRITICAL`: System-wide failures or severe security breaches.
3. **`[IP_ADDRESS]`**: Client IPv4 or IPv6 address (e.g., `192.168.1.15`). Use `cli` or `system` for background/CLI jobs.
4. **`[ACTOR]`**: Consistent identifier for the user performing the action.
   * Authenticated user: `user_id=<id>` (e.g., `user_id=31`).
   * Unauthenticated / Guest: `user_id=guest` or `user_id=-`.
   * Do **not** mix `user=` and `user_id=` in the header. Put `username` or `email` in the Logfmt body if needed.
5. **`[EVENT]`**: Action name in `UPPER_SNAKE_CASE` (e.g., `LOGIN_FAILED`, `UPLOAD_DOCUMENT`, `UPDATE_COMPETITION`).
6. **`[STATUS]`**: Outcome of the event in uppercase: `SUCCESS`, `DENIED`, `FAILED`, or `ERROR`.

### Dynamic Body Fields (Logfmt)

* Placed after the 6 header brackets, separated by a single **space** (do **not** use commas or brackets).
* Format: `key=value` using `lower_snake_case` for keys.
* Values containing spaces, quotes, or special characters **must** be wrapped in double quotes (`"`).
* If no additional details are needed, leave the body empty.

---

## 2. Security & Sanitization Rules (OWASP & CWE-117)

1. **Prevent Log Injection (CWE-117)**:
   * Strip or replace all newline characters (`\r`, `\n`) and tab characters (`\t`) from user-supplied values before logging.
   * Escape internal double quotes (`"` -> `\"`) inside quoted string values.
2. **No Sensitive Data**:
   * **NEVER** log passwords, password hashes, session tokens, JWTs, API keys, or credit card numbers.
3. **Immutable & Append-Only**:
   * Write logs in append-only mode with proper file permissions (e.g., `0640`).

---

## 3. Examples

### Valid Logs

```text
[2026-11-19T23:03:27Z] [INFO] [192.168.1.10] [user_id=29] [LOGIN_SUCCESS] [SUCCESS]
[2026-11-19T23:13:25Z] [INFO] [192.168.1.15] [user_id=31] [UPLOAD_DOCUMENT] [SUCCESS] team_id=7 document_type=ktm original_name="ktm_baru.png" file_size=70
[2026-11-19T23:37:26Z] [WARN] [192.168.1.15] [user_id=31] [LOGIN_FAILED] [DENIED] email="peserta@perkutut.web.id" reason=wrong_password failed_count=1
[2026-11-19T23:25:12Z] [INFO] [192.168.1.2] [user_id=1] [EVALUATE_SUBMISSION] [SUCCESS] username=superkutut score=88.5 feedback="Struktur rapi, dokumentasi jelas."
[2026-11-19T23:41:07Z] [INFO] [192.168.1.2] [user_id=1] [UPDATE_COMPETITION] [SUCCESS] username=superkutut name=Kriptografi status=OPEN audience="PERGURUAN TINGGI" participation_type=TEAM min_team_members=1 max_team_members=1
```

### Invalid Logs (Do Not Use)

```text
# Missing level and IP, comma-separated details inside brackets, inconsistent actor key
[2026-11-19T23:25:12Z] [user=superkutut] [event=EVALUATE_SUBMISSION, score=88.5, feedback="Struktur rapi, dokumentasi jelas."] [status=SUCCESS]
```

---

## 4. Implementasi di Perkutut Cup

Sumber kebenaran data tetap tabel `audit_logs` (append-only, tidak pernah di-UPDATE).
Format ini adalah **lapisan render/serialisasi**, bukan perubahan skema:

| Header | Sumber kolom `audit_logs` |
| --- | --- |
| `[TIMESTAMP]` | `ts` dikonversi ke UTC, presisi detik |
| `[LEVEL]` | `outcome`: ok→`INFO`, denied→`WARN`, error→`ERROR` |
| `[IP_ADDRESS]` | `ip`; kosong→`system` |
| `[ACTOR]` | `actor_id`; NULL→`user_id=-` (superadmin tidak punya baris users; identitasnya masuk body sebagai `username=superkutut`) |
| `[EVENT]` | `action` di-UPPER_SNAKE_CASE (karakter non-alfanumerik → `_`) |
| `[STATUS]` | `outcome`: ok→`SUCCESS`, denied→`DENIED`, error→`ERROR` |

Body logfmt: `username` (actor_email), `role`, `category`, `target`,
`method`/`path`/`http_status`/`duration_ms` (baris middleware API), lalu seluruh
field `detail` JSONB di-flatten. Nilai >200 karakter dipotong + `…`.

Lokasi implementasi:
* `backend/core.py` — `format_log_line()` (formatter), `_sanitize_detail()`
  (strip CR/LF/TAB sebelum INSERT), `_logfmt_value()` (quoting/escaping).
* `backend/routers/superkutut.py` — `GET /logs/export` mengunduh `.log`
  (satu baris per event, kronologis).
* `assets/js/pages/superkutut.js` — console live memakai format identik,
  bracket diwarnai per level/status/kategori (tanpa emoticon).
* Self-check: `python backend/tests/test_log_format.py`.
