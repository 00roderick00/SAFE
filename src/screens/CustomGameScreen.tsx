import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useCustomGameStore } from '../store/customGameStore';
import { CustomGameSuggestion } from '../types';

export const CustomGameScreen = () => {
  const navigate = useNavigate();
  const { suggestions, addSuggestion, removeSuggestion } = useCustomGameStore();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mechanics, setMechanics] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mechanics.trim()) return;

    addSuggestion(name.trim(), description.trim(), mechanics.trim());
    setName('');
    setDescription('');
    setMechanics('');
    setShowForm(false);
  };

  const getStatusIcon = (status: CustomGameSuggestion['status']) => {
    switch (status) {
      case 'pending':
        return <Loader2 size={16} className="animate-spin text-text-dim" />;
      case 'rated':
        return <Clock size={16} className="text-warning" />;
      case 'approved':
        return <CheckCircle size={16} className="text-primary" />;
      case 'built':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'rejected':
        return <XCircle size={16} className="text-danger" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: CustomGameSuggestion['status']) => {
    switch (status) {
      case 'pending':
        return 'Analyzing...';
      case 'rated':
        return 'Under Review';
      case 'approved':
        return 'Approved';
      case 'built':
        return 'Built & Ready';
      case 'rejected':
        return 'Needs More Detail';
      default:
        return status;
    }
  };

  const getFeasibilityColor = (feasibility: number) => {
    if (feasibility > 0.7) return 'text-primary';
    if (feasibility > 0.4) return 'text-warning';
    return 'text-danger';
  };

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
            <h1 className="ml-2 text-lg font-semibold">Custom Games</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-background font-medium rounded-xl"
          >
            <Plus size={18} />
            Suggest
          </button>
        </div>
      </header>

      <div className="px-4 py-6">
        {/* Info card */}
        <div className="card-clean p-4 mb-6">
          <p className="text-sm text-text-dim">
            Suggest new security games for your safe! Describe the gameplay mechanics and our AI will
            analyze if it can be built. Approved games will be added to your security options.
          </p>
        </div>

        {/* Suggestion form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <form onSubmit={handleSubmit} className="card-clean p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Game Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Color Match"
                    className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-text placeholder:text-text-dim focus:outline-none focus:border-primary"
                    maxLength={30}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Short Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Match colors before time runs out"
                    className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-text placeholder:text-text-dim focus:outline-none focus:border-primary"
                    maxLength={60}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Gameplay Mechanics</label>
                  <textarea
                    value={mechanics}
                    onChange={(e) => setMechanics(e.target.value)}
                    placeholder="Describe how the game works in detail. Include:
- What the player sees
- What they need to do to win
- Time limits or scoring system
- Any special rules"
                    className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-text placeholder:text-text-dim focus:outline-none focus:border-primary min-h-[120px] resize-none"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-2 bg-surface border border-border rounded-lg hover:bg-surface-light"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-primary text-background font-medium rounded-lg hover:opacity-90"
                  >
                    Submit
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Suggestions list */}
        {suggestions.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl block mb-4">🎮</span>
            <p className="text-text-dim">No game suggestions yet.</p>
            <p className="text-text-dim text-sm mt-1">Tap "Suggest" to create your first custom game!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-clean p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(suggestion.status)}
                    <span className="text-xs text-text-dim">{getStatusText(suggestion.status)}</span>
                  </div>
                  <button
                    onClick={() => removeSuggestion(suggestion.id)}
                    className="p-1 text-text-dim hover:text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <h3 className="font-semibold mb-1">{suggestion.name}</h3>
                {suggestion.description && (
                  <p className="text-sm text-text-dim mb-2">{suggestion.description}</p>
                )}

                <p className="text-xs text-text-dim mb-3 line-clamp-2">{suggestion.mechanics}</p>

                {/* AI Rating */}
                {suggestion.aiRating && (
                  <div className="bg-surface-light rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-dim">Feasibility</span>
                      <span className={getFeasibilityColor(suggestion.aiRating.feasibility)}>
                        {Math.round(suggestion.aiRating.feasibility * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-dim">Difficulty</span>
                      <span className={
                        suggestion.aiRating.difficulty < 0.4 ? 'text-primary' :
                        suggestion.aiRating.difficulty < 0.7 ? 'text-warning' : 'text-danger'
                      }>
                        {suggestion.aiRating.difficulty < 0.4 ? 'Easy' :
                         suggestion.aiRating.difficulty < 0.7 ? 'Medium' : 'Hard'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-dim">Est. Time</span>
                      <span>{suggestion.aiRating.estimatedTime}</span>
                    </div>
                    <p className="text-xs text-text-dim border-t border-border pt-2 mt-2">
                      {suggestion.aiRating.feedback}
                    </p>
                  </div>
                )}

                {/* Submitted time */}
                <p className="text-xs text-text-dim mt-3">
                  Submitted {new Date(suggestion.suggestedAt).toLocaleDateString()}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
