// Curated African locations for Uber-style location autocomplete.
// Major cities across the markets the platform serves, plus the key
// commercial districts of the launch cities (people search "Lekki" or
// "Westlands" as often as "Lagos"). Live listing locations are merged in
// on top of this list by the autocomplete itself.

export interface PlaceSuggestion {
  /** e.g. "Lekki" or "Lagos" */
  name: string;
  /** e.g. "Lagos, Nigeria" for a district, "Nigeria" for a city */
  region: string;
}

export const AFRICAN_PLACES: PlaceSuggestion[] = [
  // Nigeria
  { name: 'Lagos', region: 'Nigeria' },
  { name: 'Ikeja', region: 'Lagos, Nigeria' },
  { name: 'Victoria Island', region: 'Lagos, Nigeria' },
  { name: 'Lekki', region: 'Lagos, Nigeria' },
  { name: 'Yaba', region: 'Lagos, Nigeria' },
  { name: 'Surulere', region: 'Lagos, Nigeria' },
  { name: 'Ikoyi', region: 'Lagos, Nigeria' },
  { name: 'Lagos Island', region: 'Lagos, Nigeria' },
  { name: 'Ikorodu', region: 'Lagos, Nigeria' },
  { name: 'Ajah', region: 'Lagos, Nigeria' },
  { name: 'Apapa', region: 'Lagos, Nigeria' },
  { name: 'Festac', region: 'Lagos, Nigeria' },
  { name: 'Ikotun', region: 'Lagos, Nigeria' },
  { name: 'Agege', region: 'Lagos, Nigeria' },
  { name: 'Oshodi', region: 'Lagos, Nigeria' },
  { name: 'Abuja', region: 'Nigeria' },
  { name: 'Wuse', region: 'Abuja, Nigeria' },
  { name: 'Maitama', region: 'Abuja, Nigeria' },
  { name: 'Port Harcourt', region: 'Nigeria' },
  { name: 'Ibadan', region: 'Nigeria' },
  { name: 'Kano', region: 'Nigeria' },
  { name: 'Enugu', region: 'Nigeria' },
  { name: 'Benin City', region: 'Nigeria' },
  // Kenya
  { name: 'Nairobi', region: 'Kenya' },
  { name: 'Westlands', region: 'Nairobi, Kenya' },
  { name: 'Kilimani', region: 'Nairobi, Kenya' },
  { name: 'Upper Hill', region: 'Nairobi, Kenya' },
  { name: 'Mombasa', region: 'Kenya' },
  { name: 'Kisumu', region: 'Kenya' },
  { name: 'Nakuru', region: 'Kenya' },
  // Ghana
  { name: 'Accra', region: 'Ghana' },
  { name: 'Osu', region: 'Accra, Ghana' },
  { name: 'East Legon', region: 'Accra, Ghana' },
  { name: 'Kumasi', region: 'Ghana' },
  { name: 'Tema', region: 'Ghana' },
  { name: 'Takoradi', region: 'Ghana' },
  // South Africa
  { name: 'Johannesburg', region: 'South Africa' },
  { name: 'Sandton', region: 'Johannesburg, South Africa' },
  { name: 'Rosebank', region: 'Johannesburg, South Africa' },
  { name: 'Cape Town', region: 'South Africa' },
  { name: 'Durban', region: 'South Africa' },
  { name: 'Pretoria', region: 'South Africa' },
  { name: 'Port Elizabeth (Gqeberha)', region: 'South Africa' },
  // Egypt
  { name: 'Cairo', region: 'Egypt' },
  { name: 'Giza', region: 'Egypt' },
  { name: 'Alexandria', region: 'Egypt' },
  { name: 'New Cairo', region: 'Cairo, Egypt' },
  // East Africa
  { name: 'Dar es Salaam', region: 'Tanzania' },
  { name: 'Dodoma', region: 'Tanzania' },
  { name: 'Arusha', region: 'Tanzania' },
  { name: 'Kampala', region: 'Uganda' },
  { name: 'Entebbe', region: 'Uganda' },
  { name: 'Kigali', region: 'Rwanda' },
  { name: 'Addis Ababa', region: 'Ethiopia' },
  { name: 'Bujumbura', region: 'Burundi' },
  // West & Central Africa
  { name: 'Dakar', region: 'Senegal' },
  { name: 'Abidjan', region: "Côte d'Ivoire" },
  { name: 'Bamako', region: 'Mali' },
  { name: 'Ouagadougou', region: 'Burkina Faso' },
  { name: 'Lomé', region: 'Togo' },
  { name: 'Cotonou', region: 'Benin' },
  { name: 'Niamey', region: 'Niger' },
  { name: 'Conakry', region: 'Guinea' },
  { name: 'Freetown', region: 'Sierra Leone' },
  { name: 'Monrovia', region: 'Liberia' },
  { name: 'Banjul', region: 'Gambia' },
  { name: 'Douala', region: 'Cameroon' },
  { name: 'Yaoundé', region: 'Cameroon' },
  { name: 'Libreville', region: 'Gabon' },
  { name: 'Kinshasa', region: 'DR Congo' },
  { name: 'Brazzaville', region: 'Congo' },
  { name: 'Luanda', region: 'Angola' },
  // North Africa
  { name: 'Casablanca', region: 'Morocco' },
  { name: 'Rabat', region: 'Morocco' },
  { name: 'Marrakech', region: 'Morocco' },
  { name: 'Tunis', region: 'Tunisia' },
  { name: 'Algiers', region: 'Algeria' },
  // Southern Africa
  { name: 'Lusaka', region: 'Zambia' },
  { name: 'Harare', region: 'Zimbabwe' },
  { name: 'Gaborone', region: 'Botswana' },
  { name: 'Windhoek', region: 'Namibia' },
  { name: 'Maputo', region: 'Mozambique' },
  { name: 'Lilongwe', region: 'Malawi' },
  { name: 'Blantyre', region: 'Malawi' },
  { name: 'Antananarivo', region: 'Madagascar' },
  { name: 'Port Louis', region: 'Mauritius' },
];

/** "Lekki, Lagos, Nigeria" — the value written into inputs/filters */
export function placeLabel(place: PlaceSuggestion): string {
  return `${place.name}, ${place.region}`;
}
