CREATE TABLE practice_games (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    variant     TEXT NOT NULL,
    completed   BOOLEAN NOT NULL,
    duration_ms BIGINT NOT NULL,
    played_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON practice_games(user_id);
CREATE INDEX ON practice_games(user_id, variant);

CREATE TABLE practice_rounds (
    id          BIGSERIAL PRIMARY KEY,
    game_id     BIGINT NOT NULL REFERENCES practice_games(id) ON DELETE CASCADE,
    position    SMALLINT NOT NULL,
    feature     TEXT NOT NULL,
    attempt     SMALLINT NOT NULL DEFAULT 1,
    outcome     TEXT NOT NULL CHECK (outcome IN ('correct', 'wrong', 'skipped')),
    duration_ms BIGINT NOT NULL
);

CREATE INDEX ON practice_rounds(game_id);
