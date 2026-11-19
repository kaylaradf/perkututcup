-- 0005: problem statement per competition + drop legacy 'committee' role
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS problem_statement TEXT;

-- Role 'committee' dihapus dari produk; migrasikan sisa data (jika ada) ke 'user'.
UPDATE users SET role = 'user' WHERE role = 'committee';
