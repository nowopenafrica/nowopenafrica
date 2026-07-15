/*
  # Add 20 Billboard Placements

  Features:
  - 10 placements in Lagos, Nigeria
  - 10 placements across other African countries
  - All in Billboard category
  - Realistic pricing and locations
  - Diverse dimensions and traffic densities
*/

-- Insert 20 new billboard placements
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
-- Lagos Placements (10)
('Lekki Phase 1 Digital Billboard', 'Premium digital screen along Lekki-Epe Expressway', 'Billboard', 'Lagos, Nigeria', 18000000, 30, 600000, 'high', '12m x 6m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_1', 'business_1'),
('Victoria Island LED Display', 'High-end digital billboard in commercial district', 'Billboard', 'Lagos, Nigeria', 22000000, 60, 366667, 'high', '15m x 8m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_1', 'business_1'),
('Ikoyi Bridge Billboard', 'Strategic location connecting business districts', 'Billboard', 'Lagos, Nigeria', 15000000, 90, 166667, 'high', '10m x 5m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_2', 'business_2'),
('Apapa Port Entry Billboard', 'High visibility for logistics and trade', 'Billboard', 'Lagos, Nigeria', 12000000, 30, 400000, 'high', '8m x 4m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_3', 'business_3'),
('Lagos-Ibadan Expressway', 'Major highway connecting Lagos to northern Nigeria', 'Billboard', 'Lagos, Nigeria', 20000000, 60, 333333, 'high', '14m x 7m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_4', 'business_4'),
('Third Mainland Bridge', 'Longest bridge in Africa with massive traffic', 'Billboard', 'Lagos, Nigeria', 25000000, 90, 277778, 'high', '16m x 8m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_5', 'business_5'),
('Agege Motor Road', 'Busy commercial route with high foot traffic', 'Billboard', 'Lagos, Nigeria', 10000000, 30, 333333, 'high', '6m x 3m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_6', 'business_6'),
('Oshodi Transport Hub', 'Major bus terminal and market area', 'Billboard', 'Lagos, Nigeria', 8000000, 60, 133333, 'high', '5m x 2.5m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_7', 'business_7'),
('Lagos Airport Road', 'High-end residential and commercial area', 'Billboard', 'Lagos, Nigeria', 18000000, 90, 200000, 'high', '10m x 5m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_8', 'business_8'),
('Surulere Digital Screen', 'Central Lagos suburb with dense population', 'Billboard', 'Lagos, Nigeria', 9000000, 30, 300000, 'high', '8m x 4m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_9', 'business_9'),

-- Other African Countries (10)
('Nairobi CBD Digital Billboard', 'Central business district premium location', 'Billboard', 'Nairobi, Kenya', 14000000, 30, 466667, 'high', '10m x 5m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_10', 'business_10'),
('Mombasa Highway Billboard', 'Coastal highway connecting major cities', 'Billboard', 'Mombasa, Kenya', 11000000, 60, 183333, 'medium', '8m x 4m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_11', 'business_11'),
('Accra Airport Road Billboard', 'High-traffic route to Kotoka International', 'Billboard', 'Accra, Ghana', 16000000, 90, 177778, 'high', '12m x 6m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_12', 'business_12'),
('Kumasi Central Billboard', 'Second largest city in Ghana', 'Billboard', 'Kumasi, Ghana', 7000000, 30, 233333, 'medium', '6m x 3m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_13', 'business_13'),
('Cairo Downtown Billboard', 'Historic city center with massive foot traffic', 'Billboard', 'Cairo, Egypt', 19000000, 60, 316667, 'high', '14m x 7m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_14', 'business_14'),
('Giza Pyramid Billboard', 'Tourist hotspot near iconic pyramids', 'Billboard', 'Giza, Egypt', 21000000, 90, 233333, 'high', '10m x 5m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_15', 'business_15'),
('Durban Beachfront Billboard', 'Coastal tourist destination', 'Billboard', 'Durban, South Africa', 13000000, 30, 433333, 'high', '9m x 4.5m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_16', 'business_16'),
('Johannesburg CBD Billboard', 'Financial district premium location', 'Billboard', 'Johannesburg, South Africa', 17000000, 60, 283333, 'high', '11m x 5.5m', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_17', 'business_17'),
('Abidjan Plateau Billboard', 'Business district of Ivory Coast', 'Billboard', 'Abidjan, Ivory Coast', 12000000, 90, 133333, 'high', '8m x 4m', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_18', 'business_18'),
('Casablanca Highway Billboard', 'Major transportation route in Morocco', 'Billboard', 'Casablanca, Morocco', 15000000, 30, 500000, 'high', '10m x 5m', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_19', 'business_19');
