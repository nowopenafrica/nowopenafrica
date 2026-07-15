/*
      # Create Advert Table

      1. New Tables
        - `advert`
          - `id` (uuid, primary key)
          - `title` (text)
          - `description` (text)
          - `category` (text)
          - `location` (text)
          - `budget` (integer)
          - `duration` (integer)
          - `pricing` (integer)
          - `traffic_density` (text)
          - `dimensions` (text)
          - `status` (text)
          - `image_url` (text)
          - `user_id` (text)
          - `business_id` (text)
          - `start_date` (timestamp)
          - `created_at` (timestamp)
          - `updated_at` (timestamp)

      2. Security
        - Enable RLS on `advert` table
        - Add policies for authenticated users to manage their own adverts
    */

    CREATE TABLE IF NOT EXISTS advert (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      category text,
      location text,
      budget integer,
      duration integer,
      pricing integer,
      traffic_density text,
      dimensions text,
      status text DEFAULT 'active',
      image_url text,
      user_id text REFERENCES auth.users(id) ON DELETE CASCADE,
      business_id text REFERENCES businesses(id) ON DELETE CASCADE,
      start_date timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    ALTER TABLE advert ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view all adverts" ON advert
      FOR SELECT USING (true);

    CREATE POLICY "Users can insert their own adverts" ON advert
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can update their own adverts" ON advert
      FOR UPDATE USING (auth.uid() = user_id);

    CREATE POLICY "Users can delete their own adverts" ON advert
      FOR DELETE USING (auth.uid() = user_id);
