
-- Add the first user (Felixahuruonye) as admin
INSERT INTO user_roles (user_id, role)
VALUES ('f85adfb3-b9ee-450d-b9ba-9a3759796f5f', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
