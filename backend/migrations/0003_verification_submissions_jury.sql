-- 0003_verification_submissions_jury.sql
-- Migration for document verification, jury assignments, and project submissions

-- 1. Add verification_status to teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'REJECTED'));
CREATE INDEX IF NOT EXISTS teams_verification_status_idx ON teams(verification_status);

-- 2. Documents table (KTM, Pasfoto, Twibbon per member, Payment Proof per team)
CREATE TABLE IF NOT EXISTS documents (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id        BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type  TEXT NOT NULL CHECK (document_type IN ('ktm', 'pasfoto', 'twibbon', 'payment_proof')),
    file_path      TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    mime_type      TEXT NOT NULL,
    file_size      BIGINT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    feedback       TEXT,
    verified_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    verified_at    TIMESTAMPTZ,
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT documents_team_user_type_uniq UNIQUE (team_id, user_id, document_type)
);
CREATE INDEX IF NOT EXISTS documents_team_idx ON documents(team_id);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents(user_id);

-- 3. Team verifier assignment (Round-robin to admin)
CREATE TABLE IF NOT EXISTS team_verifications (
    team_id           BIGINT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    assigned_admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_verifications_admin_idx ON team_verifications(assigned_admin_id);

-- 4. Jury assignment to competitions
CREATE TABLE IF NOT EXISTS jury_competitions (
    jury_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id BIGINT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (jury_user_id, competition_id)
);

-- 5. Submissions table
CREATE TABLE IF NOT EXISTS submissions (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id        BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    competition_id BIGINT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    item_key       TEXT NOT NULL DEFAULT 'main',
    file_path      TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    mime_type      TEXT NOT NULL,
    file_size      BIGINT NOT NULL,
    notes          TEXT,
    submitted_by   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT submissions_team_item_uniq UNIQUE (team_id, item_key)
);
CREATE INDEX IF NOT EXISTS submissions_team_idx ON submissions(team_id);
CREATE INDEX IF NOT EXISTS submissions_comp_idx ON submissions(competition_id);

-- 6. Submission assignment to 1 jury (Round-robin per competition)
CREATE TABLE IF NOT EXISTS submission_assignments (
    team_id        BIGINT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    competition_id BIGINT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    jury_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submission_assignments_jury_idx ON submission_assignments(jury_user_id);

-- 7. Submission evaluation by jury (0-100 score + feedback)
CREATE TABLE IF NOT EXISTS submission_evaluations (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id        BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    jury_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score          NUMERIC(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
    feedback       TEXT,
    evaluated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT submission_evaluations_team_jury_uniq UNIQUE (team_id, jury_user_id)
);
