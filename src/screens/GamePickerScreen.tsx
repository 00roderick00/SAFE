import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock3,
  Gamepad2,
  Heart,
  Play,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameEmblem, StateBadge } from '../components/game';
import { MiniGameHost } from '../components/minigames';
import { getCatalogMeta } from '../game/catalog';
import { ALL_MODULE_TYPES, MODULE_CONFIG } from '../game/constants';
import { calculateModuleStrength } from '../game/economy';
import { buildCustomModule } from '../game/loadout';
import { api, type CustomGame } from '../services/api';
import { supabase } from '../services/supabaseClient';
import { useSession } from '../services/useSession';
import { usePlayerStore } from '../store/playerStore';
import type { ModuleType, SecurityModule } from '../types';
import { sanitizeUserText } from '../utils/sanitize';

type PickerTab = 'arcade' | 'puzzle' | 'classic' | 'community' | 'recent' | 'favorites';
const TABS: { id: PickerTab; label: string }[] = [
  { id: 'arcade', label: 'Arcade' },
  { id: 'puzzle', label: 'Puzzle' },
  { id: 'classic', label: 'Locks' },
  { id: 'community', label: 'Community' },
  { id: 'recent', label: 'Recent' },
  { id: 'favorites', label: 'Favorites' },
];

const getDifficultyLabel = (value: number) => value < .33 ? 'Easy' : value < .66 ? 'Tactical' : 'Punishing';

export const GamePickerScreen = () => {
  const navigate = useNavigate();
  const session = useSession();
  const { slotIndex } = useParams<{ slotIndex: string }>();
  const index = Number.parseInt(slotIndex || '0', 10);
  const { securityLoadout, setModuleType, setModuleDifficulty } = usePlayerStore();
  const currentModule = securityLoadout.modules[index];
  const [selectedType, setSelectedType] = useState<ModuleType>(currentModule?.type || 'pattern');
  const [selectedCustom, setSelectedCustom] = useState<CustomGame | null>(null);
  const [difficulty, setDifficulty] = useState(currentModule?.difficulty ?? .5);
  const [activeTab, setActiveTab] = useState<PickerTab>('community');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [recent, setRecent] = useState<ModuleType[]>(() => securityLoadout.modules.map((module) => module.type));
  const [customGames, setCustomGames] = useState<CustomGame[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const market = await api.listMarketplaceGames(30);
        const own = session?.user?.id ? (await api.listOwnCustomGames(session.user.id)).filter((game) => game.status === 'live') : [];
        const unique = new Map<string, CustomGame>();
        for (const game of [...own, ...market]) unique.set(game.id, game);
        if (!cancelled) setCustomGames([...unique.values()]);
      } catch {
        if (!cancelled) setCustomGames([]);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const selectedConfig = MODULE_CONFIG[selectedType as keyof typeof MODULE_CONFIG];
  const selectedMeta = getCatalogMeta(selectedType);
  const selectedName = selectedCustom ? sanitizeUserText(selectedCustom.name, { maxLength: 60 }) : selectedConfig.name;
  const selectedDescription = selectedCustom ? sanitizeUserText(selectedCustom.description, { maxLength: 200 }) : selectedConfig.description;
  const selectedDifficulty = selectedCustom?.calibrated_difficulty ?? difficulty;
  const selectedModule: SecurityModule = selectedCustom
    ? buildCustomModule(selectedCustom, index)
    : {
        id: currentModule?.id ?? `preview-${index}`,
        type: selectedType,
        difficulty,
        weight: selectedConfig.baseWeight,
        name: selectedConfig.name,
        description: selectedConfig.description,
      };
  const securityContribution = Math.round(calculateModuleStrength(selectedModule) * 10);
  const attackerExperience = selectedDifficulty < .33
    ? 'Forgiving timing and a clear objective.'
    : selectedDifficulty < .66
      ? 'Tighter timing with moderate cognitive load.'
      : 'Little recovery time and a demanding pass condition.';

  const builtInGames = useMemo(() => ALL_MODULE_TYPES.filter((type) => {
    const config = MODULE_CONFIG[type as keyof typeof MODULE_CONFIG];
    const matchesSearch = `${config.name} ${config.description}`.toLowerCase().includes(search.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === 'recent') return recent.includes(type);
    if (activeTab === 'favorites') return favorites.has(type);
    return config.category === activeTab;
  }), [activeTab, favorites, recent, search]);

  const visibleCustomGames = useMemo(() => customGames.filter((game) => {
    const matchesSearch = `${game.name} ${game.description}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (activeTab === 'community' || (activeTab === 'favorites' && favorites.has(game.id)));
  }), [activeTab, customGames, favorites, search]);

  const selectBuiltIn = (type: ModuleType) => {
    setSelectedType(type);
    setSelectedCustom(null);
    setRecent((items) => [type, ...items.filter((item) => item !== type)].slice(0, 8));
  };
  const selectCustom = (game: CustomGame) => {
    setSelectedCustom(game);
    setSelectedType(game.base_engine as ModuleType);
  };
  const toggleFavorite = (id: string) => setFavorites((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSave = async () => {
    if (selectedCustom) usePlayerStore.getState().updateSecurityModule(index, buildCustomModule(selectedCustom, index));
    else {
      setModuleType(index, selectedType);
      setModuleDifficulty(index, difficulty);
    }
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) await api.updateLoadout(data.session.user.id, usePlayerStore.getState().securityLoadout);
    } catch {
      // Local configuration remains valid for offline practice.
    } finally {
      setSaving(false);
    }
    navigate('/security');
  };

  const previewType = (selectedCustom?.base_engine ?? selectedType) as ModuleType;
  const previewConfig = selectedCustom ? (selectedCustom.mode === 'dsl_program' ? selectedCustom.dsl_program : selectedCustom.config) : undefined;

  return (
    <div className="defense-picker">
      <header className="picker-header">
        <button className="icon-button" onClick={() => navigate('/security')} aria-label="Back to defense configuration"><ArrowLeft size={20} /></button>
        <div><p className="eyebrow">DEFENSE BUILDER</p><h1>Configure lock {index + 1}</h1></div>
        <StateBadge state="secure" label={`Slot ${index + 1}`} compact />
      </header>

      <aside className="picker-config" aria-label="Selected game configuration">
        <div className="picker-config__identity">
          <GameEmblem type={previewType} />
          <div><p className="eyebrow">SELECTED GAME</p><h2>{selectedName}</h2><p>{selectedDescription}</p></div>
          <StateBadge state={selectedDifficulty < .33 ? 'secure' : selectedDifficulty < .66 ? 'warning' : 'attacking'} label={getDifficultyLabel(selectedDifficulty)} compact />
        </div>
        <div className="picker-config__details">
          {!selectedCustom ? (
            <label className="difficulty-control">
              <span><b>Difficulty</b><output>{Math.round(difficulty * 100)}% · {getDifficultyLabel(difficulty)}</output></span>
              <input type="range" min="0" max="1" step="0.01" value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))} aria-describedby="difficulty-explanation" />
              <small id="difficulty-explanation">Raises speed, complexity, sequence length, or reduces recovery time continuously—depending on the game.</small>
            </label>
          ) : (
            <div className="calibrated-lock"><Sparkles size={18} /><span>Community difficulty is calibrated and locked at {Math.round(selectedDifficulty * 100)}%.</span></div>
          )}
          <div className="configuration-metrics"><span><ShieldCheck size={15} />Security contribution <b>+{securityContribution}</b></span><span><Clock3 size={15} />Expected time <b>~{selectedMeta.duration}s</b></span><span><Gamepad2 size={15} />Attacker experience <b>{attackerExperience}</b></span></div>
        </div>
        <div className="picker-config__actions"><button className="btn-secondary" onClick={() => setIsPlaying(true)}><Play size={17} /> Try it</button><button className="btn-neon" onClick={handleSave} disabled={saving}><Save size={17} /> {saving ? 'Saving…' : 'Save lock'}</button></div>
      </aside>

      <main className="game-catalog">
        <div className="catalog-tools">
          <label className="catalog-search"><Search size={18} /><span className="sr-only">Search games</span><input type="search" placeholder="Search 36 games" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <nav className="catalog-tabs" aria-label="Game categories">
            {TABS.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)} aria-pressed={activeTab === tab.id}>{tab.label}</button>)}
          </nav>
        </div>

        {activeTab === 'community' && (
          <div className="community-tools"><button onClick={() => navigate('/custom-games')}><Sparkles size={16} /> Build your own game</button><button onClick={() => navigate('/marketplace')}><Store size={16} /> Browse all</button></div>
        )}

        <section className="rich-game-grid" aria-label={`${TABS.find((tab) => tab.id === activeTab)?.label} games`}>
          {visibleCustomGames.map((game) => {
            const selected = selectedCustom?.id === game.id;
            const favorite = favorites.has(game.id);
            const meta = getCatalogMeta(game.base_engine as ModuleType);
            return (
              <motion.article key={game.id} className={`rich-game-card ${selected ? 'selected' : ''}`} layout>
                <button className="rich-game-card__select" onClick={() => selectCustom(game)} aria-label={`Select ${sanitizeUserText(game.name, { maxLength: 60 })}`}>
                  <GameEmblem type={game.base_engine} /><div className="rich-game-card__copy"><span className="eyebrow">COMMUNITY</span><h3>{sanitizeUserText(game.name, { maxLength: 60 })}</h3><p>{sanitizeUserText(game.description, { maxLength: 110 })}</p></div>
                </button>
                <button className="favorite-button" onClick={() => toggleFavorite(game.id)} aria-label={favorite ? `Remove ${game.name} from favorites` : `Add ${game.name} to favorites`} aria-pressed={favorite}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></button>
                <div className="game-card-meta"><span>{meta.skills.join(' · ')}</span><span>~{meta.duration}s</span><span>{meta.control}</span><span>{game.calibration_stats?.solveRate === undefined ? 'Solve rate unavailable' : `${Math.round(game.calibration_stats.solveRate * 100)}% solve rate`}</span></div>
                {selected && <StateBadge state="secure" label="Selected" compact />}
              </motion.article>
            );
          })}

          {builtInGames.map((type) => {
            const config = MODULE_CONFIG[type as keyof typeof MODULE_CONFIG];
            const meta = getCatalogMeta(type);
            const selected = !selectedCustom && selectedType === type;
            const equipped = securityLoadout.modules.some((module) => module.type === type);
            const favorite = favorites.has(type);
            return (
              <motion.article key={type} className={`rich-game-card ${selected ? 'selected' : ''}`} layout>
                <button className="rich-game-card__select" onClick={() => selectBuiltIn(type)} aria-label={`Select ${config.name}`}>
                  <GameEmblem type={type} /><div className="rich-game-card__copy"><span className="eyebrow">{config.category}</span><h3>{config.name}</h3><p>{config.description}</p></div>
                </button>
                <button className="favorite-button" onClick={() => toggleFavorite(type)} aria-label={favorite ? `Remove ${config.name} from favorites` : `Add ${config.name} to favorites`} aria-pressed={favorite}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></button>
                <div className="game-card-meta"><span>{meta.skills.join(' · ')}</span><span>~{meta.duration}s</span><span>{meta.control}</span><span>Calibration pending</span></div>
                <div className="game-card-states">{equipped && <StateBadge state="secure" label="Equipped" compact />}{selected && <StateBadge state="cracked" label="Selected" compact />}{recent.includes(type) && <span className="recent-tag">Recent</span>}</div>
              </motion.article>
            );
          })}

          {visibleCustomGames.length === 0 && builtInGames.length === 0 && (
            <div className="honest-empty catalog-empty"><Search size={26} /><div><strong>No games in this view</strong><span>{activeTab === 'favorites' ? 'Favorite a game to keep it here.' : activeTab === 'community' ? 'No live community games are available offline.' : 'Try a different search.'}</span></div></div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {isPlaying && (
          <motion.div className="game-preview-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <section className="game-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
              <header><div><p className="eyebrow">DEFENSE TEST</p><h2 id="preview-title">{selectedName}</h2></div><button className="icon-button" onClick={() => setIsPlaying(false)} aria-label="Close game preview"><X size={20} /></button></header>
              <div className="game-preview-playfield"><MiniGameHost moduleType={previewType} moduleId={`preview-${selectedCustom?.id ?? selectedType}`} difficulty={selectedDifficulty} seed={`preview-${selectedCustom?.id ?? selectedType}`} config={previewConfig} mode={selectedCustom?.mode} onComplete={() => setIsPlaying(false)} onFail={() => setIsPlaying(false)} /></div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
