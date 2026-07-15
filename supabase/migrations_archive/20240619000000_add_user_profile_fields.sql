/*
      # Add User Profile Fields

      1. New Fields
        - `name` (text) - User's full name
        - `bio` (text) - Short biography
        - `location` (text) - User's location
        - `website` (text) - Personal website URL
        - `phone` (text) - Contact phone number
        - `profile_image_url` (text) - Profile photo URL
        - `cover_image_url` (text) - Cover photo URL
        - `skills` (text) - Professional skills
        - `experience` (text) - Work experience
        - `education` (text) - Educational background
        - `awards` (text) - Awards and recognitions
        - `services` (text) - Services offered

      2. Changes
        - Add comprehensive profile fields to users table
        - Enable row level security for profile data
        - Add policies for users to manage their own profiles
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS awards text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS services text;

-- Enable RLS if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Add policies for profile management
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
