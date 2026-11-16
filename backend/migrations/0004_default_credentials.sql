-- Migration 0004: Default credentials for admin, jury, and participant (user)

INSERT INTO users (email, full_name, password_hash, role, institution)
VALUES
    (
        'admin@perkutut.web.id',
        'Admin Perkutut Cup',
        '$2b$12$hc./8GMQlL0IAZH0JSf3RumVDhjv9htDTga9icg.CZ.aC8N78JQ4i',
        'admin',
        'Panitia Perkutut Cup 2026'
    ),
    (
        'juri@perkutut.web.id',
        'Juri Perkutut Cup',
        '$2b$12$JtyYsJWE68A/Q3Tp4Mb3HOIXJyBzjNS47j7F3lNjsaAK3qLE/WqQ6',
        'jury',
        'Dewan Juri Perkutut Cup 2026'
    ),
    (
        'peserta@perkutut.web.id',
        'Peserta Perkutut Cup',
        '$2b$12$keZhvQPue5H4k7l83T9LG.7hlHU3EnsLTAt8pkUQo361v96.WNlw2',
        'user',
        'Universitas Perkutut Indonesia'
    )
ON CONFLICT (email) DO UPDATE SET
    role = EXCLUDED.role,
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    institution = EXCLUDED.institution,
    failed_login_count = 0,
    locked_at = NULL;

-- Automatically assign the default jury to all registered competitions
INSERT INTO jury_competitions (jury_user_id, competition_id)
SELECT u.id, c.id
FROM users u
CROSS JOIN competitions c
WHERE u.email = 'juri@perkutut.web.id'
ON CONFLICT (jury_user_id, competition_id) DO NOTHING;

-- Ensure default team for default peserta in kriptografi competition
DO $$
DECLARE
    v_user_id BIGINT;
    v_comp_id BIGINT;
    v_team_id BIGINT;
BEGIN
    SELECT id INTO v_user_id FROM users WHERE email = 'peserta@perkutut.web.id';
    SELECT id INTO v_comp_id FROM competitions WHERE slug = 'kriptografi';

    IF v_user_id IS NOT NULL AND v_comp_id IS NOT NULL THEN
        SELECT tm.team_id INTO v_team_id
        FROM team_members tm
        WHERE tm.user_id = v_user_id AND tm.competition_id = v_comp_id
        LIMIT 1;

        IF v_team_id IS NULL THEN
            INSERT INTO teams (code, track, leader_user_id, payment_status, competition_id, name, verification_status)
            VALUES ('PKT-DEFAULT', 'Kriptografi', v_user_id, 'PENDING', v_comp_id, 'Tim Garuda Perkutut', 'UNVERIFIED')
            RETURNING id INTO v_team_id;

            INSERT INTO team_members (team_id, user_id, role, competition_id)
            VALUES (v_team_id, v_user_id, 'leader', v_comp_id)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END $$;
