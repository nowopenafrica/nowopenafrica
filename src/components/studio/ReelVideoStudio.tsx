import { Clapperboard } from 'lucide-react';
import { Business } from '../../types';
import CreativeDirectorStudio from './CreativeDirectorStudio';

interface Props {
  business: Business;
}

export default function ReelVideoStudio({ business }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Clapperboard size={18} className="text-purple-500" /> AI Creative Director
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your in-house advertising agency — the AI director plans the campaign, then the AI video generator produces the video.
          </p>
        </div>
      </div>

      <CreativeDirectorStudio business={business} />
    </div>
  );
}
