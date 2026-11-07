-- 1. Users foundation role
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- 2. Master competitions table
CREATE TABLE IF NOT EXISTS competitions (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    audience            TEXT NOT NULL DEFAULT 'SEMUA JENJANG',
    description         TEXT,
    participation_type  TEXT NOT NULL DEFAULT 'TEAM' CHECK (participation_type IN ('INDIVIDUAL', 'TEAM')),
    min_team_members    INT NOT NULL DEFAULT 1 CHECK (min_team_members >= 1),
    max_team_members    INT NOT NULL DEFAULT 1 CHECK (max_team_members >= min_team_members),
    status              TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UPCOMING', 'CLOSED')),
    registration_start  TIMESTAMPTZ,
    registration_end    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed competitions catalog
-- CATATAN: Nilai participation_type dan kuota (min/max_team_members) pada seed berikut
-- merupakan baseline teknis operasional, BUKAN keputusan final pengguna/panitia lomba.
-- Panitia/Administrator dapat menyesuaikan tipe kompetisi (INDIVIDUAL/TEAM) dan batas kuota
-- secara dinamis melalui antarmuka Admin Dashboard atau API backend (/api/admin/competitions)
-- tanpa perlu mengubah skema database.
INSERT INTO competitions (slug, name, audience, description, participation_type, min_team_members, max_team_members, status)
VALUES
    ('kriptografi', 'Kriptografi', 'PERGURUAN TINGGI', 'Uji kemampuan Anda dalam memecahkan dan merancang tantangan kriptografi.', 'TEAM', 1, 3, 'OPEN'),
    ('itnsa', 'ITNSA', 'PERGURUAN TINGGI', 'Pecahkan tantangan jaringan dan bangun sistem yang aman serta andal.', 'TEAM', 1, 3, 'UPCOMING'),
    ('ui-ux-design', 'Desain UI/UX', 'SMA/SMK', 'Rancang pengalaman digital yang intuitif dan mengutamakan kebutuhan pengguna.', 'TEAM', 1, 3, 'UPCOMING'),
    ('web-dev-smk', 'Pengembangan Web (SMA/SMK)', 'SMA/SMK', 'Bangun situs web responsif untuk mewujudkan ide kreatif Anda.', 'TEAM', 1, 3, 'UPCOMING'),
    ('web-dev-univ', 'Pengembangan Web (Perguruan Tinggi)', 'PERGURUAN TINGGI', 'Ubah tantangan nyata menjadi aplikasi web yang bermanfaat dan matang.', 'TEAM', 1, 3, 'UPCOMING'),
    ('iot', 'Internet untuk Segala (IoT)', 'SEMUA JENJANG', 'Hubungkan perangkat, data, dan gagasan untuk membantu kehidupan sehari-hari.', 'TEAM', 1, 3, 'UPCOMING'),
    ('devops', 'DevOps', 'SMA/SMK', 'Otomatiskan proses pengembangan dan rilis aplikasi dengan alur kerja yang andal.', 'TEAM', 1, 3, 'UPCOMING'),
    ('keamanan-siber', 'Keamanan Siber', 'PERGURUAN TINGGI', 'Lindungi sistem, jaringan, dan data dari berbagai ancaman siber.', 'TEAM', 1, 3, 'UPCOMING')
ON CONFLICT (slug) DO NOTHING;

-- 3. Connect teams to competitions
ALTER TABLE teams ADD COLUMN IF NOT EXISTS competition_id BIGINT REFERENCES competitions(id) ON DELETE SET NULL;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS name TEXT;
CREATE INDEX IF NOT EXISTS teams_competition_idx ON teams(competition_id);

-- Connect team_members to competition for fast uniqueness validation
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS competition_id BIGINT REFERENCES competitions(id) ON DELETE CASCADE;

-- Backfill existing teams with track = 'KRIPTOGRAFI' to the kriptografi competition
UPDATE teams
SET competition_id = (SELECT id FROM competitions WHERE slug = 'kriptografi')
WHERE competition_id IS NULL AND UPPER(track) = 'KRIPTOGRAFI';

-- Backfill existing team_members competition_id from teams
UPDATE team_members tm
SET competition_id = t.competition_id
FROM teams t
WHERE tm.team_id = t.id AND tm.competition_id IS NULL AND t.competition_id IS NOT NULL;

-- Prevent duplicate registration for a user in the same competition
CREATE UNIQUE INDEX IF NOT EXISTS team_members_user_competition_idx
ON team_members(user_id, competition_id)
WHERE competition_id IS NOT NULL;
