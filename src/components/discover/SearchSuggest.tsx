import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { AFRICAN_PLACES } from '../../data/locations';
import { searchSuggestions, type Suggestion, type DiscoverBusiness } from '../../lib/discover';
import SuggestInput from '../SuggestInput';

/**
 * Discover's search box.
 *
 * The dropdown itself is SuggestInput, shared with Promote and Create; this
 * only decides what a chosen suggestion means here — a business opens, a place
 * fills the place filter, a category selects the category. A suggestion that
 * merely pastes text back into the box makes the reader do the work twice.
 */
export default function SearchSuggest({
  value,
  onChange,
  onPickPlace,
  onPickCategory,
  businesses,
  placeholder = 'Search businesses, services or products',
}: {
  value: string;
  onChange: (v: string) => void;
  onPickPlace: (place: string) => void;
  onPickCategory: (category: string) => void;
  businesses: DiscoverBusiness[];
  placeholder?: string;
}) {
  const navigate = useNavigate();
  const suggestions = useMemo(
    () => searchSuggestions(businesses, AFRICAN_PLACES, value),
    [businesses, value],
  );

  const pick = (s: Suggestion) => {
    if (s.kind === 'business' && s.href) { navigate(s.href); return; }
    // The parent clears the box as part of the same URL update — doing it here
    // as well would be a second write racing the first.
    if (s.kind === 'place') { onPickPlace(s.value); return; }
    onPickCategory(s.value);
  };

  return (
    <SuggestInput
      value={value}
      onChange={onChange}
      suggestions={suggestions}
      onPick={pick}
      placeholder={placeholder}
      ariaLabel="Search businesses"
      itemNoun="Business"
      listId="discover-suggestions"
    />
  );
}
