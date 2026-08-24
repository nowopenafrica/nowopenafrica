import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Trophy, Zap } from 'lucide-react';
import { Business } from '../../types';
import {
  todayMission,
  completeMission,
  loadMissions,
  levelFor,
  progressToNextLevel,
  isMissionComplete,
} from '../../lib/missions';

interface Props {
  business: Business;
  onCompleted?: () => void;
}

// Today's Mission — the daily growth-points card. Completing a mission banks
// points toward the next level (Newbie → Marketing Mogul).
export default function TodayMission({ business, onCompleted }: Props) {
  const [, setTick] = useState(0);
  const mission = todayMission(business);
  const state = loadMissions(business.id);
  const level = levelFor(state.points);
  const progress = progressToNextLevel(state.points);
  const done = isMissionComplete(business.id);

  const complete = () => {
    const { pointsAdded } = completeMission(business.id);
    setTick((t) => t + 1);
    if (pointsAdded > 0) toast.success(`Mission complete! +${pointsAdded} growth points`);
    else toast('Mission already completed today');
    onCompleted?.();
  };

  return (
    <div className="rounded-2xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-950/40 dark:to-fuchsia-950/40 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-purple-500" />
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Today's Mission</h4>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-600 text-white">
          {level.emoji} {level.label}
        </span>
      </div>

      <div className="mt-4 flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-800 border border-purple-100 dark:border-purple-900 flex items-center justify-center text-2xl shrink-0">
          {mission.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-gray-900 dark:text-white">{mission.title}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{mission.detail}</p>
          <p className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-purple-600 dark:text-purple-400">
            <Zap size={12} /> +{mission.points} growth points
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={complete} disabled={done}
          className={`inline-flex items-center gap-1.5 px-4 rounded-xl text-sm font-semibold transition ${done ? 'bg-green-600 text-white cursor-default' : 'bg-purple-600 text-white hover:bg-purple-700'} min-h-[44px]`}>
          <CheckCircle2 size={15} /> {done ? 'Completed' : 'Mark complete'}
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
            <span>{state.points} pts</span>
            <span>{progress.next ? `${progress.next.at - state.points} pts to ${progress.next.label}` : 'Max level reached'}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
