CREATE TABLE user_achievements (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug             TEXT NOT NULL,
    game_id          BIGINT REFERENCES practice_games(id) ON DELETE SET NULL,
    manifest_version TEXT NOT NULL,
    unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, slug)
);

CREATE INDEX ON user_achievements(user_id);
