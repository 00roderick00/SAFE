import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { CustomGameSuggestion } from '../types';

interface CustomGameSuggestProps {
  onSuggestionSubmit: (suggestion: CustomGameSuggestion) => void;
}

export const CustomGameSuggest = ({ onSuggestionSubmit }: CustomGameSuggestProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mechanics, setMechanics] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rating, setRating] = useState<CustomGameSuggestion['aiRating'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeGame = async () => {
    if (!name.trim() || !description.trim() || !mechanics.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    // Simulate AI analysis (in a real app, this would call an AI API)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock AI rating based on input complexity
    const wordCount = mechanics.split(' ').length;
    const hasActions = /click|tap|swipe|drag|shoot|jump|move|avoid|collect/i.test(mechanics);
    const hasGoal = /win|score|complete|finish|survive|reach/i.test(mechanics);
    const hasChallenge = /enemy|obstacle|timer|limit|fast|quick/i.test(mechanics);

    let difficulty = 0.5;
    let feasibility = 0.8;
    let feedback = '';

    if (wordCount < 10) {
      feasibility -= 0.2;
      feedback = 'Description is brief. More detail would help create a better game. ';
    } else if (wordCount > 50) {
      difficulty += 0.2;
      feedback = 'Detailed description! This could be a complex challenge. ';
    }

    if (hasActions) {
      feasibility += 0.1;
      feedback += 'Good action-based mechanics identified. ';
    } else {
      feasibility -= 0.1;
      feedback += 'Consider adding specific actions (tap, swipe, click). ';
    }

    if (hasGoal) {
      feasibility += 0.05;
      feedback += 'Clear win condition detected. ';
    }

    if (hasChallenge) {
      difficulty += 0.15;
      feedback += 'Challenge elements found - this will test players! ';
    }

    // Clamp values
    difficulty = Math.min(1, Math.max(0.1, difficulty));
    feasibility = Math.min(1, Math.max(0.2, feasibility));

    const aiRating: CustomGameSuggestion['aiRating'] = {
      difficulty,
      feasibility,
      estimatedTime: difficulty > 0.7 ? '20-25 seconds' : difficulty > 0.4 ? '15-20 seconds' : '10-15 seconds',
      feedback: feedback.trim(),
    };

    setRating(aiRating);
    setIsAnalyzing(false);
  };

  const handleSubmit = () => {
    if (!rating) return;

    const suggestion: CustomGameSuggestion = {
      id: `custom-${Date.now()}`,
      name,
      description,
      mechanics,
      suggestedAt: Date.now(),
      aiRating: rating,
      status: rating.feasibility >= 0.6 ? 'approved' : 'pending',
    };

    onSuggestionSubmit(suggestion);
    resetForm();
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setMechanics('');
    setRating(null);
    setError(null);
    setIsOpen(false);
  };

  return (
    <div className="mt-4">
      <Button
        variant="ghost"
        className="w-full border-2 border-dashed border-primary/30 hover:border-primary/60"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Suggest Custom Game
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card variant="default" className="mt-4 p-4">
              <h3 className="text-lg font-display text-primary mb-4">
                Create Your Own Security Game
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-dim mb-1">Game Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Laser Maze"
                    className="w-full px-3 py-2 bg-surface rounded-lg border border-primary/30 text-text placeholder:text-text-dim/50 focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-dim mb-1">Short Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Navigate through laser beams"
                    className="w-full px-3 py-2 bg-surface rounded-lg border border-primary/30 text-text placeholder:text-text-dim/50 focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-dim mb-1">How It Works</label>
                  <textarea
                    value={mechanics}
                    onChange={(e) => setMechanics(e.target.value)}
                    placeholder="Describe the game mechanics, controls, win/lose conditions..."
                    rows={4}
                    className="w-full px-3 py-2 bg-surface rounded-lg border border-primary/30 text-text placeholder:text-text-dim/50 focus:border-primary focus:outline-none resize-none"
                  />
                </div>

                {error && (
                  <p className="text-danger text-sm">{error}</p>
                )}

                {!rating && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={analyzeGame}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing with AI...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Analyze Game Idea
                      </>
                    )}
                  </Button>
                )}

                {rating && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div className="bg-surface-light rounded-lg p-4">
                      <h4 className="text-sm font-display text-primary mb-3">AI Analysis</h4>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-text-dim">Difficulty</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                              <div
                                className="h-full bg-warning"
                                style={{ width: `${rating.difficulty * 100}%` }}
                              />
                            </div>
                            <span className="text-sm text-warning">
                              {Math.round(rating.difficulty * 100)}%
                            </span>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-text-dim">Feasibility</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                              <div
                                className={`h-full ${rating.feasibility >= 0.6 ? 'bg-primary' : 'bg-danger'}`}
                                style={{ width: `${rating.feasibility * 100}%` }}
                              />
                            </div>
                            <span className={`text-sm ${rating.feasibility >= 0.6 ? 'text-primary' : 'text-danger'}`}>
                              {Math.round(rating.feasibility * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-text-dim mb-1">Estimated Duration</p>
                      <p className="text-sm text-text mb-3">{rating.estimatedTime}</p>

                      <p className="text-xs text-text-dim mb-1">AI Feedback</p>
                      <p className="text-sm text-text">{rating.feedback}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {rating.feasibility >= 0.6 ? (
                        <CheckCircle className="w-5 h-5 text-primary" />
                      ) : (
                        <XCircle className="w-5 h-5 text-warning" />
                      )}
                      <span className={`text-sm ${rating.feasibility >= 0.6 ? 'text-primary' : 'text-warning'}`}>
                        {rating.feasibility >= 0.6
                          ? 'This game can be built!'
                          : 'Consider refining your idea for better results'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1"
                        onClick={resetForm}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={handleSubmit}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Submit Suggestion
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
