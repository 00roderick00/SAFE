import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, Trophy, Target, Shield } from 'lucide-react';
import { useSocialStore, LeaderboardEntry } from '../store/socialStore';
import { usePlayerStore } from '../store/playerStore';

type LeaderboardTab = 'earnings' | 'heists' | 'defense';

export const LeaderboardScreen = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('earnings');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { leaderboard, refreshLeaderboard } = useSocialStore();
  const { username, safeBalance, successfulHeists, successfulDefenses } = usePlayerStore();

  // Add player to leaderboard
  const playerEntry = {
    id: 'player',
    username: username || 'You',
    score: safeBalance,
    rank: 0,
    safeBalance,
    totalHeists: successfulHeists,
    successRate: successfulHeists > 0 ? 0.65 : 0,
    isPlayer: true,
  };

  // Sort and rank based on active tab
  const getSortedLeaderboard = () => {
    const combined = [...leaderboard, playerEntry];
    let sorted;

    switch (activeTab) {
      case 'heists':
        sorted = combined.sort((a, b) => b.totalHeists - a.totalHeists);
        break;
      case 'defense':
        sorted = combined.sort((a, b) => b.successRate - a.successRate);
        break;
      case 'earnings':
      default:
        sorted = combined.sort((a, b) => b.score - a.score);
    }

    return sorted.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
  };

  const sortedLeaderboard = getSortedLeaderboard();
  const playerRank = sortedLeaderboard.find((e) => e.isPlayer)?.rank || 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    refreshLeaderboard();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const getTabValue = (entry: LeaderboardEntry) => {
    switch (activeTab) {
      case 'heists':
        return entry.totalHeists;
      case 'defense':
        return `${Math.round(entry.successRate * 100)}%`;
      case 'earnings':
      default:
        return entry.score.toLocaleString();
    }
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-yellow-500/20 text-yellow-500';
    if (rank === 2) return 'bg-gray-400/20 text-gray-400';
    if (rank === 3) return 'bg-orange-600/20 text-orange-600';
    return 'bg-surface-light text-text-dim';
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/')}
              className="p-2 -ml-2 text-text-dim hover:text-text"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="ml-2 text-lg font-semibold">Leaderboard</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-text-dim hover:text-text"
          >
            <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="px-4 py-6">
        {/* Player rank card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-clean p-4 mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-dim text-sm">Your Rank</p>
              <p className="text-3xl font-display font-bold text-primary">
                #{playerRank}
              </p>
            </div>
            <div className="text-right">
              <p className="text-text-dim text-sm">
                {activeTab === 'earnings' ? 'Balance' : activeTab === 'heists' ? 'Heists' : 'Defense'}
              </p>
              <p className="text-xl font-semibold">{getTabValue(playerEntry)}</p>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('earnings')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${
              activeTab === 'earnings'
                ? 'bg-primary/20 text-primary border border-primary/50'
                : 'bg-surface border border-border text-text-dim'
            }`}
          >
            <Trophy size={16} />
            <span className="text-sm">Earnings</span>
          </button>
          <button
            onClick={() => setActiveTab('heists')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${
              activeTab === 'heists'
                ? 'bg-primary/20 text-primary border border-primary/50'
                : 'bg-surface border border-border text-text-dim'
            }`}
          >
            <Target size={16} />
            <span className="text-sm">Heists</span>
          </button>
          <button
            onClick={() => setActiveTab('defense')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${
              activeTab === 'defense'
                ? 'bg-primary/20 text-primary border border-primary/50'
                : 'bg-surface border border-border text-text-dim'
            }`}
          >
            <Shield size={16} />
            <span className="text-sm">Defense</span>
          </button>
        </div>

        {/* Leaderboard list */}
        <div className="space-y-2">
          {sortedLeaderboard.slice(0, 20).map((entry, idx) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              className={`flex items-center gap-3 p-3 rounded-xl ${
                entry.isPlayer
                  ? 'bg-primary/10 border border-primary/30'
                  : 'bg-surface border border-border'
              }`}
            >
              {/* Rank */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${getRankStyle(
                  entry.rank
                )}`}
              >
                {getRankIcon(entry.rank) || entry.rank}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${entry.isPlayer ? 'text-primary' : ''}`}>
                  {entry.username}
                  {entry.isPlayer && ' (You)'}
                </p>
                <p className="text-xs text-text-dim">
                  {entry.totalHeists} heists • {Math.round(entry.successRate * 100)}% success
                </p>
              </div>

              {/* Score */}
              <div className="text-right">
                <p className="font-semibold font-mono">{getTabValue(entry)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
