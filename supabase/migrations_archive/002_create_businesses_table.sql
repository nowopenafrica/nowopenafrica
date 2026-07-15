/*
      # Create businesses table

      1. New Tables
        - `businesses`
          - `id` (uuid, primary key)
          - `name` (text)
          - `description` (text)
          - `category` (text)
          - `location` (text)
          - `phone` (text)
          - `website` (text)
          - `rating` (numeric)
          - `image_url` (text)
          - `created_at` (timestamp)
          - `status` (text, default 'open')
    */

    CREATE TABLE IF NOT EXISTS businesses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      category text NOT NULL,
      location text,
      phone text,
      website text,
      rating numeric DEFAULT 0,
      image_url text,
      created_at timestamptz DEFAULT now(),
      status text DEFAULT 'open'
    );

    ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view businesses" ON businesses
      FOR SELECT USING (true);
