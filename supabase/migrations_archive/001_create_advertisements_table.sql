/*
      # Create advertisements table

      1. New Tables
        - `advertisements`
          - `id` (uuid, primary key)
          - `title` (text)
          - `description` (text)
          - `type` (text)
          - `location` (text)
          - `price_per_day` (numeric)
          - `available_until` (timestamp)
          - `awards` (text)
          - `image_url` (text)
          - `created_at` (timestamp)
          - `status` (text, default 'open')
    */

    CREATE TABLE IF NOT EXISTS advertisements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      type text NOT NULL,
      location text,
      price_per_day numeric,
      available_until timestamptz,
      awards text,
      image_url text,
      created_at timestamptz DEFAULT now(),
      status text DEFAULT 'open'
    );

    ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view advertisements" ON advertisements
      FOR SELECT USING (true);
