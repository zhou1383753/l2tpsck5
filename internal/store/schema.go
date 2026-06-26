package store

func (s *Store) Init() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS kv (
		key TEXT PRIMARY KEY,
		value BLOB NOT NULL
	)`)
	return err
}
