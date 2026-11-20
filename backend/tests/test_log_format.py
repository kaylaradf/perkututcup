"""Self-check Application Logging Standard (core.format_log_line + sanitasi CWE-117).
Jalankan: PERKUTUT_DATABASE_URL=postgresql://x python backend/tests/test_log_format.py
"""
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("PERKUTUT_DATABASE_URL", "postgresql://selfcheck:selfcheck@localhost/selfcheck")
os.environ.setdefault("PERKUTUT_ALTCHA_HMAC_KEY", "selfcheck")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core import format_log_line, _sanitize_detail, _logfmt_value  # noqa: E402

HEADER = re.compile(
    r"^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\] "
    r"\[(INFO|WARN|ERROR|CRITICAL)\] \[[^\]\r\n]+\] \[user_id=[^\]\r\n]+\] "
    r"\[[A-Z0-9_]+\] \[(SUCCESS|DENIED|FAILED|ERROR)\]( .*)?$"
)

def row(**kw):
    base = dict(ts=datetime(2026, 11, 19, 23, 13, 25, tzinfo=timezone.utc),
                actor_id=31, actor_email=None, actor_role=None, ip="192.168.1.15",
                category="document", action="upload_document", target_type=None,
                target_id=None, detail={}, outcome="ok")
    base.update(kw)
    return base

# header wajib 6 bracket berurutan, satu baris
line = format_log_line(row(detail={"team_id": 7, "document_type": "ktm", "original_name": "ktm_baru.png", "file_size": 70}))
assert HEADER.match(line), line
assert line.startswith("[2026-11-19T23:13:25Z] [INFO] [192.168.1.15] [user_id=31] [UPLOAD_DOCUMENT] [SUCCESS] ")
assert "team_id=7" in line and 'original_name="ktm_baru.png"' not in line  # tanpa spasi tak dikutip
assert "\n" not in line

# outcome -> level/status
assert "[WARN]" in format_log_line(row(outcome="denied")) and "[DENIED]" in format_log_line(row(outcome="denied"))
assert "[ERROR]" in format_log_line(row(outcome="error"))

# aktor anonim & tanpa ip
anon = format_log_line(row(actor_id=None, ip=None))
assert "[user_id=-]" in anon and "[system]" in anon

# CWE-117: newline/tab user-supplied tidak boleh memecah baris / menyuntik header palsu
evil = 'nama\r\n[2026-01-01T00:00:00Z] [INFO] palsu\tkey'
inj = format_log_line(row(detail={"feedback": evil, "note": 'kutip " dan \\ backslash'}))
assert "\n" not in inj and "\r" not in inj and "\t" not in inj
# payload tetap SATU baris & header asli utuh di awal; "[INFO]" palsu hanya teks dalam nilai terkutip
assert inj.startswith("[2026-11-19T23:13:25Z] [INFO]")
assert '[INFO] palsu' not in inj.split('feedback="', 1)[0]
assert '\\"' in inj and "\\\\" in inj
assert HEADER.match(inj)

# sanitasi sebelum masuk DB (rekursif)
s = _sanitize_detail({"a": "x\r\ny\tz", "b": ["p\nq", {"c": "r\ts"}], "n": 5})
assert s == {"a": "x  y z", "b": ["p q", {"c": "r s"}], "n": 5}

# nilai panjang dipotong, dict jadi JSON terkutip, None dilewati
long = format_log_line(row(detail={"problem_statement": "A" * 500, "changed": {"status": "OPEN"}, "null": None}))
assert "A" * 200 + "…" in long and "null=" not in long
assert 'changed="{\\"status\\": \\"OPEN\\"}"' in long or 'changed="{' in long
assert HEADER.match(long)

# ts ISO string (jalur _serialize) & konversi zona ke UTC
from datetime import timedelta
iso = format_log_line(row(ts=datetime(2026, 11, 20, 7, 13, 25, tzinfo=timezone(timedelta(hours=8))).isoformat()))
assert iso.startswith("[2026-11-19T23:13:25Z]")

# baris middleware api: method/path/status/duration masuk body
api = format_log_line(row(category="api", action="POST /api/auth/login", method="POST",
                          path="/api/auth/login", status=200, duration_ms=12, actor_id=None))
assert "[POST_API_AUTH_LOGIN]" in api and "method=POST" in api and "http_status=200" in api and "duration_ms=12" in api

# kutip kosong tetap dikutip agar parser logfmt tidak kehilangan key
assert _logfmt_value("") == '""'

print("log format self-check: OK")
