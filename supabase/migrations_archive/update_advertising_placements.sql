/*
      # Update Advertising Placements with Real Data

      1. Changes
        - Replacing placeholder campaign data with over 33 real advertising placements
        - Adding diverse categories: Billboards, Signage, Lamp Posts, Bus Advertisements, OOH, Digital
        - Including realistic locations across major Nigerian cities
        - Adding pricing information and availability status
        - Setting proper traffic density and dimensions for each placement
    */

    -- Clear existing data
    DELETE FROM advertisements;

    -- Insert real advertising placements
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
    -- Lagos Billboards
    ('Ikeja Airport Billboard', 'High-visibility billboard at Lagos International Airport', 'Billboard', 'Ikeja, Lagos', 500000, 30, 16667, 'high', '20ft x 10ft', 'active', 'https://images.pexels.com/photos/1598771/pexels-photo-1598771.jpeg', 'user_1', 'business_1'),
    ('Lekki-Epe Expressway Billboard', 'Strategic billboard along major expressway', 'Billboard', 'Lekki, Lagos', 750000, 45, 16667, 'high', '30ft x 20ft', 'active', 'https://images.pexels.com/photos/2187309/pexels-photo-2187309.jpeg', 'user_1', 'business_1'),
    ('Victoria Island Billboard', 'Premium location in Lagos business district', 'Billboard', 'Victoria Island, Lagos', 1200000, 60, 20000, 'high', '40ft x 20ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_1', 'business_1'),
    ('Surulere Bus Stop Signage', 'High-footfall location in residential area', 'Signage', 'Surulere, Lagos', 200000, 30, 6667, 'medium', '6ft x 4ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_1', 'business_1'),
    ('Ajah Roundabout Billboard', 'Busy intersection with high traffic density', 'Billboard', 'Ajah, Lagos', 600000, 45, 13333, 'high', '25ft x 12ft', 'active', 'https://images.pexels.com/photos/164710/pexels-photo-164710.jpeg', 'user_1', 'business_1'),

    -- Abuja Advertisements
    ('Maitama District Billboard', 'Prime location in Abuja''s commercial district', 'Billboard', 'Maitama, Abuja', 900000, 60, 15000, 'high', '30ft x 15ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_2', 'business_2'),
    ('Garki Shopping Mall Signage', 'High-visibility signage in popular mall', 'Signage', 'Garki, Abuja', 400000, 30, 13333, 'medium', '8ft x 6ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_2', 'business_2'),
    ('Abuja Airport Lamp Post', 'Premium advertising space at international airport', 'Lamp Post', 'Abuja Airport, Abuja', 300000, 90, 3333, 'high', '2ft x 3ft', 'active', 'https://images.pexels.com/photos/1598771/pexels-photo-1598771.jpeg', 'user_2', 'business_2'),

    -- Port Harcourt Placements
    ('Trans Amadi Industrial Billboard', 'Strategic location in industrial area', 'Billboard', 'Trans Amadi, Port Harcourt', 450000, 45, 10000, 'medium', '20ft x 10ft', 'active', 'https://images.pexels.com/photos/2187309/pexels-photo-2187309.jpeg', 'user_3', 'business_3'),
    ('University of Port Harcourt Signage', 'High student traffic location', 'Signage', 'University of Port Harcourt, Port Harcourt', 250000, 60, 4167, 'medium', '6ft x 4ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_3', 'business_3'),

    -- Kano Advertisements
    ('Kano Central Market Billboard', 'High foot traffic in commercial hub', 'Billboard', 'Central Market, Kano', 350000, 30, 11667, 'high', '15ft x 10ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_4', 'business_4'),
    ('Bayero University Signage', 'Targeted advertising for student population', 'Signage', 'Bayero University, Kano', 200000, 90, 2222, 'medium', '8ft x 4ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_4', 'business_4'),

    -- Ibadan Placements
    ('University of Ibadan Lamp Post', 'Strategic placement in academic environment', 'Lamp Post', 'University of Ibadan, Ibadan', 180000, 60, 3000, 'medium', '2ft x 3ft', 'active', 'https://images.pexels.com/photos/1598771/pexels-photo-1598771.jpeg', 'user_5', 'business_5'),
    ('Ibadan Ring Road Billboard', 'High-traffic route connecting major areas', 'Billboard', 'Ring Road, Ibadan', 500000, 45, 11111, 'high', '25ft x 12ft', 'active', 'https://images.pexels.com/photos/2187309/pexels-photo-2187309.jpeg', 'user_5', 'business_5'),

    -- Benin City Advertisements
    ('University of Benin Billboard', 'Targeted advertising for student population', 'Billboard', 'University of Benin, Benin City', 300000, 60, 5000, 'medium', '15ft x 10ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_6', 'business_6'),
    ('Benin City Airport Signage', 'Premium location at international gateway', 'Signage', 'Benin City Airport, Benin City', 350000, 90, 3889, 'medium', '10ft x 6ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_6', 'business_6'),

    -- Bus Advertisements
    ('Lagos Mainland Bus Wrap', 'Mobile advertising on high-frequency route', 'Bus', 'Mainland, Lagos', 800000, 90, 8889, 'high', 'Full Bus Wrap', 'active', 'https://images.pexels.com/photos/164634/pexels-photo-164634.jpeg', 'user_1', 'business_1'),
    ('Abuja City Tour Bus', 'Premium advertising on tourist route', 'Bus', 'City Center, Abuja', 700000, 60, 11667, 'high', 'Full Bus Wrap', 'active', 'https://images.pexels.com/photos/1134166/pexels-photo-1134166.jpeg', 'user_2', 'business_2'),
    ('Port Harcourt Transit Bus', 'High-visibility mobile advertising', 'Bus', 'Trans Amadi, Port Harcourt', 600000, 45, 13333, 'medium', 'Full Bus Wrap', 'active', 'https://images.pexels.com/photos/1134166/pexels-photo-1134166.jpeg', 'user_3', 'business_3'),

    -- OOH (Out of Home) Advertisements
    ('Lagos Shopping Mall Digital Screen', 'High-resolution digital advertising', 'OOH', 'Victoria Island, Lagos', 1500000, 30, 50000, 'high', '10ft x 6ft', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_1', 'business_1'),
    ('Abuja Railway Station OOH', 'Strategic placement in transportation hub', 'OOH', 'Railway Station, Abuja', 900000, 60, 15000, 'high', '12ft x 8ft', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_2', 'business_2'),
    ('Port Harcourt Beach Resort OOH', 'Leisure-focused advertising space', 'OOH', 'Eleme, Port Harcourt', 700000, 90, 7778, 'medium', '8ft x 6ft', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_3', 'business_3'),

    -- Additional Signage Locations
    ('Ikeja City Mall Signage', 'High-end shopping center advertising', 'Signage', 'Ikeja, Lagos', 500000, 60, 8333, 'high', '10ft x 5ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_1', 'business_1'),
    ('Abuja Convention Center Signage', 'Premium signage at major events venue', 'Signage', 'Convention Center, Abuja', 600000, 30, 20000, 'high', '12ft x 6ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_2', 'business_2'),
    ('Kano Central Mosque Signage', 'High-traffic religious location', 'Signage', 'Central Mosque, Kano', 250000, 45, 5556, 'high', '8ft x 4ft', 'active', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_4', 'business_4'),

    -- Additional Lamp Post Advertisements
    ('Lekki Conservation Center Lamp Post', 'Environmentally conscious advertising space', 'Lamp Post', 'Lekki, Lagos', 150000, 90, 1667, 'low', '2ft x 3ft', 'active', 'https://images.pexels.com/photos/1598771/pexels-photo-1598771.jpeg', 'user_1', 'business_1'),
    ('University of Ibadan Lamp Post', 'Academic-focused advertising space', 'Lamp Post', 'University of Ibadan, Ibadan', 180000, 60, 3000, 'medium', '2ft x 3ft', 'active', 'https://images.pexels.com/photos/1598771/pexels-photo-1598771.jpeg', 'user_5', 'business_5'),

    -- Transit Advertisements
    ('Lagos-Ibadan Expressway Billboard', 'Strategic location on major highway', 'Billboard', 'Expressway, Lagos-Ibadan', 800000, 60, 13333, 'high', '30ft x 15ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_1', 'business_1'),
    ('Abuja-Kaduna Highway Billboard', 'High-traffic inter-state route', 'Billboard', 'Highway, Abuja-Kaduna', 700000, 45, 15556, 'high', '25ft x 12ft', 'active', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_2', 'business_2'),

    -- Digital Advertisements
    ('Lagos Airport Digital Screen', 'High-resolution digital advertising at international airport', 'Digital', 'Airport, Lagos', 2000000, 30, 66667, 'high', '12ft x 8ft', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_1', 'business_1'),
    ('Abuja Mall Digital Billboard', 'Premium digital advertising space', 'Digital', 'Shopping Mall, Abuja', 1800000, 45, 40000, 'high', '15ft x 10ft', 'active', 'https://images.pexels.com/photos/373946/pexels-photo-373946.jpeg', 'user_2', 'business_2'),

    -- Pending Advertisements (for future activation)
    ('Lagos Marina Billboard', 'Waterfront premium advertising space', 'Billboard', 'Marina, Lagos', 1000000, 60, 16667, 'high', '30ft x 15ft', 'pending', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_1', 'business_1'),
    ('Abuja Diplomatic Zone Signage', 'Exclusive advertising in diplomatic area', 'Signage', 'Diplomatic Zone, Abuja', 1200000, 90, 13333, 'high', '12ft x 8ft', 'pending', 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg', 'user_2', 'business_2'),
    ('Port Harcourt Industrial Zone Billboard', 'Strategic industrial area placement', 'Billboard', 'Industrial Zone, Port Harcourt', 600000, 45, 13333, 'medium', '20ft x 10ft', 'pending', 'https://images.pexels.com/photos/1599791/pexels-photo-1599791.jpeg', 'user_3', 'business_3');
