import { Business } from '../../types';
import { GrowthPlanModule } from '../../lib/growth';
import MarketingAssistant from './MarketingAssistant';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

const DIRECTOR_PROMPTS = [
  'What is trending for my industry?',
  "What's my growth score?",
  "What should I do today?",
  'Show me my morning brief',
  'Who are my competitors?',
  'Write a caption for a weekend offer',
];

// The AI Marketing Director — the same instant, offline chat as the assistant
// but pitched as your in-house marketing lead, with prompts that span the
// whole AI Marketing Department.
export default function MarketingDirector({ business, onNavigate }: Props) {
  return (
    <MarketingAssistant
      business={business}
      onNavigate={onNavigate}
      title="AI Marketing Director"
      subtitle="Your in-house marketing lead · free & instant"
      quickPrompts={DIRECTOR_PROMPTS}
    />
  );
}
