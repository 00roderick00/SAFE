import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Check, X, Sparkles, Store } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { MODULE_CONFIG, MODULE_CATEGORIES } from '../game/constants';
import { getModulesByCategory } from '../game/modules';
import { ModuleType } from '../types';
import { MiniGameHost } from '../components/minigames';
import { api, type CustomGame } from '../services/api';
import { useSession } from '../services/useSession';
import { supabase } from '../services/supabaseClient';
import { buildCustomModule } from '../game/loadout';
import { sanitizeUserText } from '../utils/sanitize';

export const GamePickerScreen = () => {
  const navigate = useNavigate();
  const session = useSession();
  const { slotIndex } = useParams<{ slotIndex: string }>();
  const index = parseInt(slotIndex || '0', 10);

  const { securityLoadout, setModuleType, setModuleDifficulty } = usePlayerStore();
  const currentModule = securityLoadout.modules[index];

  const [selectedType, setSelectedType] = useState<ModuleType>(currentModule?.type || 'pacman');
  const [difficulty, setDifficulty] = useState(currentModule?.difficulty || 0.5);
  // When set, the user is equipping a live custom/community game rather
  // than a built-in module.
  const [selectedCustom, setSelectedCustom] = useState<CustomGame | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);

  const modulesByCategory = getModulesByCategory();

  // Live custom games the user can equip: their own live creations +
  // the community marketplace, de-duped by id.
  const [customGames, setCustomGames] = useState<CustomGame[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const market = await api.listMarketplaceGames(30);
        let own: CustomGame[] = [];
        if (session?.user?.id) {
          own = (await api.listOwnCustomGames(session.user.id)).filter((g) => g.status === 'live');
        }
        const byId = new Map<string, CustomGame>();
        for (const g of [...own, ...market]) if (!byId.has(g.id)) byId.set(g.id, g);
        if (!cancelled) setCustomGames([...byId.values()]);
      } catch {
        // Section just stays empty if the fetch fails (offline/dev).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const handleSelectGame = (type: ModuleType) => {
    setSelectedType(type);
    setSelectedCustom(null);
  };

  const handleSelectCustom = (game: CustomGame) => {
    setSelectedCustom(game);
  };

  const handleTryGame = () => {
    setIsPlaying(true);
  };

  const handleGameComplete = () => {
    setIsPlaying(false);
  };

  const handleConfirm = async () => {
    if (selectedCustom) {
      // Equip the custom game onto this slot (sanitized + server-shaped).
      usePlayerStore.getState().updateSecurityModule(index, buildCustomModule(selectedCustom, index));
    } else {
      setModuleType(index, selectedType);
      setModuleDifficulty(index, difficulty);
    }
    // Persist the whole loadout to the server so the safe's defense
    // reflects this change (attackers see the server loadout). Best
    // effort — the local store is already updated for dev/offline.
    setSaving(true);
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (s) {
        await api.updateLoadout(s.user.id, usePlayerStore.getState().securityLoadout);
      }
    } catch {
      // ignore — local store already reflects the change
    } finally {
      setSaving(false);
    }
    navigate('/security');
  };

  const selectedConfig = MODULE_CONFIG[selectedType as keyof typeof MODULE_CONFIG];

  const previewName = selectedCustom ? sanitizeUserText(selectedCustom.name, { maxLength: 60 }) : selectedConfig?.name;
  const previewIcon = selectedCustom ? '✨' : selectedConfig?.icon;
  const previewDesc = selectedCustom
    ? sanitizeUserText(selectedCustom.description, { maxLength: 200 })
    : selectedConfig?.description;

  const renderGamePreview = () => {
    if (!isPlaying) return null;
    if (selectedCustom) {
      const isDsl = selectedCustom.mode === 'dsl_program';
      return (
        <MiniGameHost
          moduleType={selectedCustom.base_engine as ModuleType}
          moduleId={`preview-${selectedCustom.id}`}
          difficulty={selectedCustom.calibrated_difficulty ?? 0.5}
          seed={`preview-${selectedCustom.id}`}
          config={isDsl ? selectedCustom.dsl_program : selectedCustom.config}
          mode={selectedCustom.mode}
          onComplete={handleGameComplete}
          onFail={handleGameComplete}
        />
      );
    }
    return (
      <MiniGameHost
        moduleType={selectedType}
        moduleId={`preview-${selectedType}`}
        difficulty={difficulty}
        seed={`preview-${selectedType}`}
        onComplete={handleGameComplete}
        onFail={handleGameComplete}
      />
    );
  };

  // Order categories: arcade, puzzle, classic
  const categoryOrder = ['arcade', 'puzzle', 'classic'];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/security')}
              className="p-2 -ml-2 text-text-dim hover:text-text"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="ml-2 text-lg font-semibold">
              Lock #{index + 1}
            </h1>
          </div>
          {!isPlaying && (
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-background font-medium rounded-xl disabled:opacity-60"
            >
              <Check size={18} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-6">
        {/* Preview/Test Area */}
        <AnimatePresence mode="wait">
          {isPlaying ? (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              <div className="card-clean p-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-text-dim">Testing: {previewName}</span>
                  <button
                    onClick={() => setIsPlaying(false)}
                    className="p-2 text-text-dim hover:text-text"
                  >
                    <X size={20} />
                  </button>
                </div>
                {renderGamePreview()}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              <div className="card-clean p-6 text-center">
                <span className="text-6xl block mb-3">{previewIcon}</span>
                <h2 className="text-xl font-semibold mb-1">{previewName}</h2>
                <p className="text-text-dim text-sm mb-4">{previewDesc}</p>
                {selectedCustom && (
                  <p className="text-xs text-primary mb-4">
                    Community game · calibrated {selectedCustom.calibrated_difficulty !== null
                      ? `${Math.round(selectedCustom.calibrated_difficulty * 100)}%`
                      : '—'} difficulty
                  </p>
                )}

                <button
                  onClick={handleTryGame}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-light border border-border rounded-xl text-text hover:border-primary/50 transition-colors"
                >
                  <Play size={18} />
                  Try It
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Selection Grid */}
        {!isPlaying && (
          <>
            {/* Community + custom games. Equipping one pays its creator a
                royalty on every attack that hits this slot. */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-dim uppercase tracking-wide">
                  Community Games
                </h3>
                <button
                  onClick={() => navigate('/marketplace')}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Store size={12} />
                  Browse all
                </button>
              </div>
              {customGames.length === 0 ? (
                <button
                  onClick={() => navigate('/custom-games')}
                  className="w-full card-clean p-4 text-left flex items-center gap-3 hover:border-primary/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Build your own game</p>
                    <p className="text-xs text-text-dim">No live community games yet — design one with AI.</p>
                  </div>
                </button>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {customGames.map((game) => (
                    <motion.button
                      key={game.id}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${
                        selectedCustom?.id === game.id
                          ? 'bg-primary/20 border-2 border-primary'
                          : 'bg-surface border border-border hover:border-primary/30'
                      }`}
                      onClick={() => handleSelectCustom(game)}
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="text-2xl mb-1">✨</span>
                      <span
                        className={`text-xs truncate w-full text-center ${
                          selectedCustom?.id === game.id ? 'text-primary' : 'text-text-dim'
                        }`}
                      >
                        {sanitizeUserText(game.name, { maxLength: 24 })}
                      </span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {categoryOrder.map((catKey) => {
              const catInfo = MODULE_CATEGORIES[catKey as keyof typeof MODULE_CATEGORIES];
              const games = modulesByCategory[catKey as keyof typeof modulesByCategory];
              if (!games || games.length === 0) return null;

              return (
                <div key={catKey} className="mb-6">
                  <h3 className="text-sm font-semibold text-text-dim mb-3 uppercase tracking-wide">
                    {catInfo.name}
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {games.map((game) => (
                      <motion.button
                        key={game.type}
                        className={`
                          flex flex-col items-center justify-center p-3
                          rounded-xl transition-all
                          ${selectedType === game.type && !selectedCustom
                            ? 'bg-primary/20 border-2 border-primary'
                            : 'bg-surface border border-border hover:border-primary/30'
                          }
                        `}
                        onClick={() => handleSelectGame(game.type as ModuleType)}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="text-2xl mb-1">{game.icon}</span>
                        <span className={`text-xs truncate w-full text-center ${
                          selectedType === game.type && !selectedCustom ? 'text-primary' : 'text-text-dim'
                        }`}>
                          {game.name}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Difficulty Slider — built-in modules only; custom games use
                their calibrated difficulty. */}
            {!selectedCustom && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-text-dim mb-3 uppercase tracking-wide">
                  Difficulty
                </h3>
                <div className="card-clean p-4">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={difficulty}
                    onChange={(e) => setDifficulty(parseFloat(e.target.value))}
                    className="w-full h-2 bg-surface-light rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between mt-2 text-sm">
                    <span className="text-text-dim">Easy</span>
                    <span className={`font-medium ${
                      difficulty < 0.33 ? 'text-primary' : difficulty < 0.66 ? 'text-warning' : 'text-danger'
                    }`}>
                      {difficulty < 0.33 ? 'Easy' : difficulty < 0.66 ? 'Medium' : 'Hard'}
                    </span>
                    <span className="text-text-dim">Hard</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
