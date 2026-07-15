/*
      # Create media_services table

      1. New Tables
        - `media_services`
          - `id` (uuid, primary key)
          - `title` (text)
          - `description` (text)
          - `service_type` (text)
          - `pricing` (numeric)
          - `rating` (numeric)
          - `image_url` (text)
          - `created_at` (timestamp)
    */

    CREATE TABLE IF NOT EXISTS media_services (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      service_type text NOT NULL,
      pricing numeric,
      rating numeric DEFAULT 0,
      image_url text,
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE media_services ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view media services" ON media_services
      FOR SELECT USING (true);
