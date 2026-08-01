import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  LogOut,
  PlayCircle,
  Mail,
  Crown,
  Edit2,
  Fingerprint,
  Gauge,
  Lock,
  Radio,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { InfoTip } from '../components/InfoTip';
import { useSocialStore, AVAILABLE_ACHIEVEMENTS } from '../store/socialStore';
import { calculateSecurityScore } from '../game/economy';
import { getUnlockTier, TIER_REQUIREMENTS, type UnlockTier } from '../game/progression';
import { resetLocalState } from '../services/localState';
import { supabase } from '../services/supabaseClient';
import { useSession } from '../services/useSession';

const AVATARS = [
  { id: 'shield', label: 'Vault guardian', Icon: Shield },
  { id: 'target', label: 'Target specialist', Icon: Target },
  { id: 'bot', label: 'Tactical operator', Icon: Bot },
  { id: 'dial', label: 'Dial technician', Icon: Gauge },
  { id: 'signal', label: 'Signal analyst', Icon: Radio },
  { id: 'fingerprint', label: 'Identity specialist', Icon: Fingerprint },
  { id: 'crown', label: 'Master infiltrator', Icon: Crown },
  { id: 'spark', label: 'System architect', Icon: Sparkles },
];

const ACHIEVEMENT_ICONS = {
  'first-heist': Target,
  'safe-cracker': Lock,
  'master-thief': Crown,
  'iron-wall': Shield,
  fortress: Shield,
  millionaire: Trophy,
  'security-expert': Gauge,
  'perfect-heist': Star,
} as const;

export const ProfileScreen = () => {
  const navigate = useNavigate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isPickingAvatar, setIsPickingAvatar] = useState(false);
  const [tempUsername, setTempUsername] = useState('');

  const {
    username,
    setUsername,
    safeBalance,
    securityLoadout,
    totalEarnings,
    totalLosses,
    successfulHeists,
    successfulDefenses,
    riskRating,
  } = usePlayerStore();

  const { achievements, checkAchievements } = useSocialStore();
  const [avatar, setAvatar] = useState(AVATARS[0].id);
  const session = useSession();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const completedHeists = usePlayerStore((state) => state.completedHeists);
  const tier = getUnlockTier({ completedHeists, successfulHeists });
  const email = session?.user?.email ?? null;

  /**
   * Sign out is LOCAL ONLY: it drops the auth token and wipes this
   * device's persisted stores. It never deletes the account, safe,
   * balance or history — all of that is server-side and comes back
   * intact on the next sign-in. Clearing the stores matters as much as
   * the token: leaving them behind lets the previous account's state
   * leak into the next session.
   */
  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if the network call fails, still clear locally — leaving
      // stale state behind is the worse outcome.
    }
    resetLocalState();
    setSigningOut(false);
    setConfirmSignOut(false);
    navigate('/');
  };

  /** Replays the intro without signing out or touching server state. */
  const handleRestartOnboarding = () => {
    usePlayerStore.setState({ onboardingCompleted: false });
    navigate('/');
  };

  const securityScore = calculateSecurityScore(securityLoadout);

  useEffect(() => {
    checkAchievements({
      heists: successfulHeists,
      defenses: successfulDefenses,
      balance: safeBalance,
      score: securityScore,
    });
  }, [checkAchievements, safeBalance, securityScore, successfulDefenses, successfulHeists]);

  const selectedAvatar = AVATARS.find((item) => item.id === avatar) ?? AVATARS[0];
  const AvatarIcon = selectedAvatar.Icon;

  const handleSaveName = () => {
    if (tempUsername.trim()) {
      setUsername(tempUsername.trim());
    }
    setIsEditingName(false);
  };

  const stats = [
    { label: 'Total Earnings', value: `+${totalEarnings.toLocaleString()}`, icon: Trophy, color: 'text-primary' },
    { label: 'Total Losses', value: `-${totalLosses.toLocaleString()}`, icon: Target, color: 'text-danger' },
    { label: 'Successful Heists', value: successfulHeists, icon: Target, color: 'text-warning' },
    { label: 'Successful Defenses', value: successfulDefenses, icon: Shield, color: 'text-primary' },
    { label: 'Security Score', value: Math.round(securityScore), icon: Lock, color: 'text-primary' },
    { label: 'Risk Rating', value: riskRating, icon: Star, color: 'text-warning' },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/')}
            className="p-2 -ml-2 text-text-dim hover:text-text"
            aria-label="Back to vault"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="ml-2 text-lg font-semibold">Profile</h1>
        </div>
      </header>

      <div className="px-4 py-6">
        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-clean p-6 mb-6"
        >
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <button
              onClick={() => setIsPickingAvatar(true)}
              className="w-20 h-20 bg-surface-light rounded-2xl flex items-center justify-center text-4xl hover:bg-surface-light/80 transition-colors"
              aria-label={`Change avatar. Current avatar: ${selectedAvatar.label}`}
            >
              <AvatarIcon size={36} aria-hidden="true" />
            </button>

            {/* Name & Balance */}
            <div className="flex-1">
              {isEditingName ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                    placeholder="Enter username"
                    className="flex-1 px-3 py-1 bg-surface-light border border-border rounded-lg text-text focus:outline-none focus:border-primary"
                    maxLength={20}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="px-3 py-1 bg-primary text-background rounded-lg text-sm"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{username || 'Anonymous'}</h2>
                  <button
                    onClick={() => {
                      setTempUsername(username);
                      setIsEditingName(true);
                    }}
                    className="p-1 text-text-dim hover:text-text"
                    aria-label="Edit callsign"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              )}
              <p className="text-2xl font-display font-bold text-primary mt-1">
                {safeBalance.toLocaleString()} tokens
              </p>
            </div>
          </div>
        </motion.div>

        {/* Avatar picker modal */}
        {isPickingAvatar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            onClick={() => setIsPickingAvatar(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="card-clean p-6 w-full max-w-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4 text-center">Choose Avatar</h3>
              <div className="grid grid-cols-4 gap-3">
                {AVATARS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setAvatar(option.id);
                      setIsPickingAvatar(false);
                    }}
                    className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl transition-all ${
                      avatar === option.id
                        ? 'bg-primary/20 border-2 border-primary'
                        : 'bg-surface-light hover:bg-surface-light/80'
                    }`}
                    aria-label={`Use ${option.label} avatar`}
                    aria-pressed={avatar === option.id}
                  >
                    <option.Icon size={25} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3 mb-6"
        >
          {stats.map((stat, idx) => (
            <div key={idx} className="card-clean p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon size={14} className={stat.color} />
                <span className="text-xs text-text-dim">{stat.label}</span>
              </div>
              <p className={`text-lg font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </motion.div>

        {/* Achievements */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-sm font-semibold text-text-dim mb-3 uppercase tracking-wide">
            Achievements ({achievements.length}/{AVAILABLE_ACHIEVEMENTS.length})
          </h3>

          <div className="grid grid-cols-4 gap-3">
            {AVAILABLE_ACHIEVEMENTS.map((achievement) => {
              const unlocked = achievements.some((a) => a.id === achievement.id);
              const AchievementIcon = ACHIEVEMENT_ICONS[achievement.id as keyof typeof ACHIEVEMENT_ICONS] ?? Trophy;
              return (
                <div
                  key={achievement.id}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center p-2 text-center ${
                    unlocked
                      ? 'bg-primary/20 border border-primary/30'
                      : 'bg-surface-light opacity-50'
                  }`}
                  aria-label={`${achievement.name}: ${unlocked ? 'unlocked' : 'locked'}.`}
                >
                  <span className="mb-1" aria-hidden="true">{unlocked ? <AchievementIcon size={23} /> : <Lock size={23} />}</span>
                  <span className="text-[10px] text-text-dim leading-tight">{achievement.name}</span>
                  <InfoTip label={achievement.name} body={achievement.description} />
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Account controls */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="card-clean p-5 mt-6"
          aria-label="Account"
        >
          <h2 className="text-sm font-semibold mb-3">Account</h2>

          <dl className="text-sm">
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-text-dim flex items-center gap-2"><Mail size={15} aria-hidden="true" /> Signed in as</dt>
              <dd className="text-text truncate max-w-[55%] text-right">{email || username || 'Not signed in'}</dd>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-text-dim">Unlock tier</dt>
              <dd className="text-text">
                Tier {tier}
                {tier < 3 && (
                  <span className="text-text-dim"> · {TIER_REQUIREMENTS[(tier + 1) as Exclude<UnlockTier, 0>]}</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2 mt-4">
            <button
              onClick={handleRestartOnboarding}
              className="w-full flex items-center justify-center gap-2 py-3 bg-surface-light border border-border rounded-xl"
            >
              <PlayCircle size={18} className="text-primary" aria-hidden="true" />
              <span className="text-sm">Restart onboarding</span>
            </button>
            <button
              onClick={() => setConfirmSignOut(true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-surface-light border border-danger/40 rounded-xl text-danger"
            >
              <LogOut size={18} aria-hidden="true" />
              <span className="text-sm">Sign out</span>
            </button>
          </div>
        </motion.section>

        {confirmSignOut && (
          <div
            className="locked-sheet-backdrop"
            role="dialog"
            aria-label="Confirm sign out"
            onClick={() => setConfirmSignOut(false)}
          >
            <div
              className="locked-sheet w-full max-w-md m-3 mb-24 p-5 rounded-xl border border-surface-light bg-background shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="font-display text-base font-bold text-text mb-2">Sign out of SAFE?</p>
              <p className="text-sm text-text-dim">
                Your vault, balance and history stay safe on the server — nothing is deleted. But
                signing back in needs a fresh magic link by email.
              </p>
              <div className="flex gap-2 mt-4">
                <button className="btn-secondary flex-1" onClick={() => setConfirmSignOut(false)}>Stay signed in</button>
                <button className="btn-danger flex-1" onClick={handleSignOut} disabled={signingOut}>
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6"
        >
          <button
            onClick={() => navigate('/leaderboard')}
            className="w-full flex items-center justify-center gap-2 py-3 bg-surface-light border border-border rounded-xl hover:border-primary/30 transition-colors"
          >
            <Trophy size={18} className="text-warning" />
            <span className="text-sm">View Leaderboard</span>
          </button>
        </motion.div>
      </div>
    </div>
  );
};
