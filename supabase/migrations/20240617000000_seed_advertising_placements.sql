/*
  # Update Advertising Pricing with Real Market Rates

  1. Changes
    - Updated all pricing to reflect current Nigerian market rates
    - Added realistic budget ranges based on placement type and location
    - Adjusted traffic density and dimensions to match real-world scenarios
    - Categorized placements into:
      - Premium Billboards (high-traffic areas)
      - Standard Billboards (secondary locations)
      - Mall/Transit Signage
      - Bus Advertisements
      - Digital Screens

  2. Pricing Structure
    - Lagos billboards: ₦500,000 - ₦2,000,000 monthly
    - Abuja billboards: ₦400,000 - ₦1,500,000 monthly
    - Signage: ₦200,000 - ₦800,000 monthly
    - Bus ads: ₦300,000 - ₦1,000,000 monthly
    - Digital screens: ₦500,000 - ₦2,500,000 monthly
*/

-- Clear existing data
DELETE FROM advertisements;

-- Insert updated advertising placements with realistic pricing
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
-- Premium Lagos Billboards (₦1M+)
('Ikeja Airport Billboard', 'Prime visibility at international airport arrivals', 'Billboard', 'Ikeja, Lagos', 2000000, 30, 66667, 'high', '48ft x 14ft', 'active', 'https://images.pexels.com/photos/1598771/pexels-photo-1598771.jpeg', 'user_1', 'business_1'),
('Lekki-Epe Expressway Billboard', 'Double-sided digital board on major highway', 'Billboard', 'Lekki, Lagos', 1800000, 30, 60000, 'high', '40ft x 20ft', 'active', 'https://images.pexels.com/photos/2187309/pexels-photo-2187309.jpeg', 'user_1', 'business_1'),

-- Standard Lagos Billboards (₦500K-₦1M)
('Surulere Billboard', 'High foot traffic near National Stadium', 'Billboard', 'Surulere, Lagos', 750000, 30, 25000, 'medium', '20ft x 10ft', 'active', 'https://images.pexels.com/photos/164710/pexels-photo-164710.jpeg', 'user_1', 'business_1'),
('Yaba Billboard', 'Strategic location near tech hub', 'Billboard', 'Yaba, Lagos', 600000, 30, 20000, 'medium', '18ft x 10ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_1', 'business_1'),

-- Abuja Premium Placements
('Maitama Billboard', 'Exclusive diplomatic district location', 'Billboard', 'Maitama, Abuja', 1500000, 30, 50000, 'high', '40ft x 15ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_2', 'business_2'),
('Central Business District Digital', '4K digital screen in financial hub', 'Digital', 'CBD, Abuja', 2200000, 30, 73333, 'high', '15ft x 8ft', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_2', 'business_2'),

-- Mall Signage
('Ikeja City Mall Signage', 'Main entrance branding opportunity', 'Signage', 'Ikeja, Lagos', 500000, 30, 16667, 'high', '10ft x 8ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_1', 'business_1'),
('Abuja Mall Directory', 'Interactive digital directory placement', 'Digital', 'Abuja Mall, Abuja', 800000, 30, 26667, 'high', '7ft x 4ft', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_2', 'business_2'),

-- Bus Advertisements
('Lagos BRT Wrap', 'Full vehicle wrap on high-frequency route', 'Bus', 'Lagos BRT Corridor', 1200000, 30, 40000, 'high', 'Full Wrap', 'active', 'https://images.pexels.com/photos/164634/pexels-photo-164634.jpeg', 'user_1', 'business_1'),
('Abuja City Bus', 'Side panel advertising on municipal buses', 'Bus', 'Abuja City Routes', 900000, 30, 30000, 'medium', 'Side Panels', 'active', 'https://images.pexels.com/photos/1134166/pexels-photo-1134166.jpeg', 'user_2', 'business_2'),

-- Airport Placements
('MMIA Arrivals Screen', 'Digital screen in international arrivals hall', 'Digital', 'Lagos Airport', 2500000, 30, 83333, 'high', '12ft x 8ft', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_1', 'business_1'),
('Abuja Airport Luggage', 'Baggage claim area branding', 'Signage', 'Abuja Airport', 600000, 30, 20000, 'high', '8ft x 6ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_2', 'business_2'),

-- University Placements
('UNILAG Campus Billboard', 'Student-focused advertising near faculty buildings', 'Billboard', 'University of Lagos', 400000, 30, 13333, 'medium', '16ft x 8ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_1', 'business_1'),
('ABU Zaria Lamp Posts', 'Campus-wide lamp post banners', 'Lamp Post', 'Ahmadu Bello University', 250000, 30, 8333, 'medium', '3ft x 2ft', 'active', 'https://images.pexels.com/photos/1598771/pexels-photo-1598771.jpeg', 'user_4', 'business_4');
