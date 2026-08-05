-- Replaces placeholder placement images with realistic, type-appropriate
-- photos on EXISTING advertisement rows — non-destructive (only image_url
-- changes; titles, prices and ids stay untouched).
--
-- Safe to re-run. Rows within the same category cycle through that
-- category's photo set so repeats vary.

WITH pools (key, urls) AS (
  VALUES
    ('billboard', ARRAY[
      'https://images.pexels.com/photos/802024/pexels-photo-802024.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/1580625/pexels-photo-1580625.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/1058759/pexels-photo-1058759.jpeg?auto=compress&cs=tinysrgb&w=640'
    ]),
    ('digital', ARRAY[
      'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/2614818/pexels-photo-2614818.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/2372982/pexels-photo-2372982.jpeg?auto=compress&cs=tinysrgb&w=640'
    ]),
    ('transit', ARRAY[
      'https://images.pexels.com/photos/2031758/pexels-photo-2031758.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/3626589/pexels-photo-3626589.jpeg?auto=compress&cs=tinysrgb&w=640'
    ]),
    ('mall', ARRAY[
      'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/2861656/pexels-photo-2861656.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/3962285/pexels-photo-3962285.jpeg?auto=compress&cs=tinysrgb&w=640'
    ]),
    ('airport', ARRAY[
      'https://images.pexels.com/photos/227690/pexels-photo-227690.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/2033343/pexels-photo-2033343.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/358319/pexels-photo-358319.jpeg?auto=compress&cs=tinysrgb&w=640'
    ]),
    ('street', ARRAY[
      'https://images.pexels.com/photos/374815/pexels-photo-374815.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/2422588/pexels-photo-2422588.jpeg?auto=compress&cs=tinysrgb&w=640'
    ]),
    ('stadium', ARRAY[
      'https://images.pexels.com/photos/270085/pexels-photo-270085.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/2263436/pexels-photo-2263436.jpeg?auto=compress&cs=tinysrgb&w=640'
    ]),
    ('radio', ARRAY[
      'https://images.pexels.com/photos/164829/pexels-photo-164829.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/1054713/pexels-photo-1054713.jpeg?auto=compress&cs=tinysrgb&w=640',
      'https://images.pexels.com/photos/744318/pexels-photo-744318.jpeg?auto=compress&cs=tinysrgb&w=640'
    ])
),
ranked AS (
  SELECT
    id,
    CASE
      WHEN category ILIKE '%digital%' OR category ILIKE '%led%' OR category ILIKE '%screen%' THEN 'digital'
      WHEN category ILIKE '%transit%' OR category ILIKE '%bus%' AND category NOT ILIKE '%shelter%' THEN 'transit'
      WHEN category ILIKE '%mall%' OR category ILIKE '%indoor%' THEN 'mall'
      WHEN category ILIKE '%airport%' THEN 'airport'
      WHEN category ILIKE '%street%' OR category ILIKE '%shelter%' THEN 'street'
      WHEN category ILIKE '%stadium%' OR category ILIKE '%sport%' THEN 'stadium'
      WHEN category ILIKE '%radio%' THEN 'radio'
      -- billboard, outdoor, poster, banner and anything else default here
      ELSE 'billboard'
    END AS key,
    row_number() OVER (PARTITION BY category ORDER BY created_at) - 1 AS rn
  FROM advertisements
)
UPDATE advertisements a
SET image_url = p.urls[(r.rn % array_length(p.urls, 1)) + 1]
FROM ranked r
JOIN pools p ON p.key = r.key
WHERE a.id = r.id;
