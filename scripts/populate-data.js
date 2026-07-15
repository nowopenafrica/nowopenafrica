const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const sampleAdverts = [
  {
    title: "Premium Billboard Space",
    description: "High-traffic location billboard perfect for brand visibility",
    type: "Billboard",
    location: "Lagos, Nigeria",
    price_per_day: 150,
    available_until: "2024-12-31",
    awards: "Award-winning location",
    image_url: "https://via.placeholder.com/400x300"
  },
  {
    title: "Digital Screen Advertising",
    description: "Modern digital screens in shopping centers",
    type: "Digital",
    location: "Nairobi, Kenya",
    price_per_day: 80,
    available_until: "2024-11-30",
    image_url: "https://via.placeholder.com/400x300"
  },
  {
    title: "Radio Ad Slots",
    description: "Prime time radio advertising slots",
    type: "Radio",
    location: "Accra, Ghana",
    price_per_day: 45,
    available_until: "2024-10-15",
    image_url: "https://via.placeholder.com/400x300"
  }
];

const sampleBusinesses = [
  {
    name: "Tech Hub Africa",
    description: "Leading technology solutions provider",
    category: "Technology",
    location: "Johannesburg, South Africa",
    phone: "+27 12 345 6789",
    website: "www.techhubafrica.com",
    rating: 4.5,
    image_url: "https://via.placeholder.com/400x300"
  },
  {
    name: "African Fashion House",
    description: "Contemporary African fashion and design",
    category: "Fashion",
    location: "Lagos, Nigeria",
    phone: "+234 812 345 6789",
    website: "www.africanfashionhouse.com",
    rating: 4.2,
    image_url: "https://via.placeholder.com/400x300"
  },
  {
    name: "Nile Restaurant",
    description: "Authentic African cuisine and dining experience",
    category: "Food & Beverage",
    location: "Cairo, Egypt",
    phone: "+20 2 345 6789",
    website: "www.nilerestaurant.com",
    rating: 4.8,
    image_url: "https://via.placeholder.com/400x300"
  }
];

const sampleMediaServices = [
  {
    title: "Professional Photography",
    description: "High-quality photography services for businesses",
    service_type: "Photography",
    pricing: 200,
    rating: 4.7,
    image_url: "https://via.placeholder.com/400x300"
  },
  {
    title: "Video Production",
    description: "Corporate and commercial video production",
    service_type: "Video Production",
    pricing: 500,
    rating: 4.9,
    image_url: "https://via.placeholder.com/400x300"
  },
  {
    title: "Social Media Management",
    description: "Complete social media marketing solutions",
    service_type: "Social Media",
    pricing: 300,
    rating: 4.3,
    image_url: "https://via.placeholder.com/400x300"
  }
];

async function populateData() {
  console.log('Populating sample data...');

  // Insert sample adverts
  for (const advert of sampleAdverts) {
    const { data, error } = await supabase
      .from('advertisements')
      .insert(advert)
      .select();

    if (error) {
      console.error('Error inserting advert:', error);
    } else {
      console.log('Inserted advert:', data[0].id);
    }
  }

  // Insert sample businesses
  for (const business of sampleBusinesses) {
    const { data, error } = await supabase
      .from('businesses')
      .insert(business)
      .select();

    if (error) {
      console.error('Error inserting business:', error);
    } else {
      console.log('Inserted business:', data[0].id);
    }
  }

  // Insert sample media services
  for (const service of sampleMediaServices) {
    const { data, error } = await supabase
      .from('media_services')
      .insert(service)
      .select();

    if (error) {
      console.error('Error inserting service:',
