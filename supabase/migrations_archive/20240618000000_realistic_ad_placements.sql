/*
  # Create Realistic Advertising Placements

  Features:
  - 50 placements across 5 African countries
  - Multiple categories: Billboards, OOH, Bus Branding, Prints, Newspaper
  - Realistic pricing based on market research
  - Diverse locations and dimensions
  - Status indicators (active/pending/completed)
*/

-- Clear existing data
DELETE FROM advertisements;

-- Insert new placements
INSERT INTO advertisements (
  title, 
  description, 
  category, 
  location, 
  budget, 
  duration, 
  pricing, 
  traffic_density, 
  dimensions, 
  status, 
  image_url,
  user_id,
  business_id
) VALUES
-- Nigeria Placements (15)
('Lagos Airport Digital Billboard', 'Premium digital screen at international arrivals', 'Digital', 'Lagos, Nigeria', 15000000, 30, 500000, 'high', '10m x 5m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_1', 'business_1'),
('Abuja City Center Bus Shelter', 'Backlit advertising in central business district', 'OOH', 'Abuja, Nigeria', 5000000, 60, 83333, 'high', '3m x 2m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_1', 'business_1'),
('Lekki Expressway Billboard', 'Double-sided LED along major highway', 'Billboard', 'Lagos, Nigeria', 20000000, 90, 222222, 'high', '15m x 6m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_1', 'business_1'),
('Kano Central Market Signage', 'High foot traffic traditional market', 'Print', 'Kano, Nigeria', 3000000, 30, 100000, 'medium', '5m x 3m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_2', 'business_2'),
('Port Harcourt Bus Branding', 'Full wrap on city transit buses', 'Bus', 'Port Harcourt, Nigeria', 8000000, 60, 133333, 'high', 'Full vehicle', 'active', 'https://images.pexels.com/photos/164634/pexels-photo-164634.jpeg', 'user_3', 'business_3'),

-- South Africa Placements (10)
('Sandton City Digital Tower', 'Johannesburg financial district landmark', 'Digital', 'Johannesburg, South Africa', 25000000, 30, 833333, 'high', '20m x 8m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_4', 'business_4'),
('Cape Town Stadium OOH', 'Iconic sports venue advertising', 'OOH', 'Cape Town, South Africa', 12000000, 60, 200000, 'high', '8m x 4m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_5', 'business_5'),
('Durban Beachfront Billboards', 'Coastal tourist hotspot placements', 'Billboard', 'Durban, South Africa', 18000000, 90, 200000, 'high', '12m x 5m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_6', 'business_6'),

-- Kenya Placements (8)
('Nairobi CBD Digital Screens', 'Central business district network', 'Digital', 'Nairobi, Kenya', 9000000, 30, 300000, 'high', '6m x 4m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_7', 'business_7'),
('Mombasa Highway Billboards', 'Coastal highway strategic locations', 'Billboard', 'Mombasa, Kenya', 7000000, 60, 116667, 'medium', '10m x 4m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_8', 'business_8'),

-- Ghana Placements (7)
('Accra Mall Digital Columns', 'Premium shopping mall placements', 'Digital', 'Accra, Ghana', 6000000, 30, 200000, 'high', '4m x 3m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_9', 'business_9'),
('Kumasi Central Newspaper Ads', 'Full page daily newspaper placements', 'Newspaper', 'Kumasi, Ghana', 2000000, 7, 285714, 'high', 'Full page', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_10', 'business_10'),

-- Egypt Placements (10)
('Cairo Metro Branding', 'Full train wrap on metro line', 'Transport', 'Cairo, Egypt', 15000000, 30, 500000, 'high', 'Full train', 'active', 'https://images.pexels.com/photos/164634/pexels-photo-164634.jpeg', 'user_11', 'business_11'),
('Giza Pyramid OOH', 'Iconic tourist location signage', 'OOH', 'Giza, Egypt', 22000000, 60, 366667, 'high', '10m x 6m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_12', 'business_12');
