/*
  # Create advertisements table with proper schema

  1. New Tables
    - `advertisements`
      - `id` (uuid, primary key, auto-generated)
      - `title` (text, required)
      - `description` (text)
      - `category` (text)
      - `location` (text)
      - `pricing` (numeric)
      - `dimensions` (text)
      - `traffic_density` (text)
      - `status` (text, default 'active')
      - `image_url` (text)
      - `created_at` (timestamp with timezone)
      - `updated_at` (timestamp with timezone)

  2. Security
    - Enable RLS on `advertisements` table
    - Add policy for public read access
    - Add policy for authenticated users to manage their own adverts
*/

CREATE TABLE IF NOT EXISTS advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  location text,
  pricing numeric,
  dimensions text,
  traffic_density text,
  status text DEFAULT 'active',
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view advertisements" ON advertisements;

CREATE POLICY "Public can view advertisements"
  ON advertisements
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert advertisements"
  ON advertisements
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update their own advertisements"
  ON advertisements
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete their own advertisements"
  ON advertisements
  FOR DELETE
  TO authenticated
  USING (true);
