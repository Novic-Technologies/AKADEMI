import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  CourseItem,
  QuizAttempt,
  QuizCurriculumTag,
  QuizItem,
  QuizQuestion,
} from '../types/akademi';

interface QuizManagerModalProps {
  course: CourseItem;
  onClose: () => void;
}

const CURRICULUM_TAGS: QuizCurriculumTag[] = [
  'UNEB UACE',
  'UNEB UCE',
  'UNEB PLE',
  'UBTEB',
  'NCHE',
  'KCSE',
  'WASSCE',
  'GENERAL',
];

export const QuizManagerModal: React.FC<QuizManagerModalProps> = ({ course, onClose }) => {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);

  // Builder state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [curriculumTag, setCurriculumTag] = useState<QuizCurriculumTag>('UNEB UACE');
  const [isPastPaper, setIsPastPaper] = useState(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(20);
  const [passingPercent, setPassingPercent] = useState(60);
  const [questions, setQuestions] = useState<QuizQuestion[]>([
    {
      id: 'q-draft-1',
      kind: 'MCQ',
      prompt: '',
      marks: 5,
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      workedSolution: '',
    },
  ]);

  const loadQuizzes = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ quizzes: QuizItem[]; attempts: QuizAttempt[] }>(
        `/api/courses/${course.id}/quizzes`
      );
      setQuizzes(res.quizzes);
      setAttempts(res.attempts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load course assessments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuizzes();
  }, [course.id]);

  const addQuestionDraft = (kind: 'MCQ' | 'STRUCTURED') => {
    setQuestions((prev) => [
      ...prev,
      kind === 'MCQ'
        ? {
            id: `q-draft-${prev.length + 1}-${Date.now()}`,
            kind: 'MCQ',
            prompt: '',
            marks: 5,
            options: ['', '', '', ''],
            correctOptionIndex: 0,
            workedSolution: '',
          }
        : {
            id: `q-draft-${prev.length + 1}-${Date.now()}`,
            kind: 'STRUCTURED',
            prompt: '',
            marks: 10,
            acceptedKeywords: [],
            sampleAnswer: '',
            workedSolution: '',
          },
    ]);
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const cleanQuestions = questions.map((q) => ({
        ...q,
        options: q.kind === 'MCQ' ? (q.options || []).filter((o) => o.trim().length > 0) : undefined,
      }));
      await apiFetch(`/api/courses/${course.id}/quizzes`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          curriculumTag,
          isPastPaper,
          timeLimitMinutes,
          passingPercent,
          published: true,
          questions: cleanQuestions,
        }),
      });
      setTitle('');
      setDescription('');
      setShowBuilder(false);
      setNotice('Interactive assessment created and published to enrolled learners.');
      await loadQuizzes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create quiz.');
    }
  };

  const handleTogglePublish = async (q: QuizItem) => {
    try {
      await apiFetch(`/api/quizzes/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ published: !q.published }),
      });
      await loadQuizzes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update publish status.');
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    try {
      await apiFetch(`/api/quizzes/${id}`, { method: 'DELETE' });
      await loadQuizzes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete quiz.');
    }
  };

  const fieldCls =
    'w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-2 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ak-divider)] px-6 py-4">
          <div>
            <p className="text-xs font-semibold text-[var(--ak-accent-ink)]">
              Assessments &amp; Past-Paper Drills
            </p>
            <h2 className="text-lg font-bold text-[var(--ak-ink)]">{course.title}</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBuilder((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-2 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
            >
              <Plus className="h-3.5 w-3.5" />
              {showBuilder ? 'Close Builder' : 'New Quiz / Past Paper'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close quiz manager"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-4 py-3 text-sm text-[var(--ak-err-fg)]">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)] px-4 py-3 text-sm text-[var(--ak-ok-fg)]">
              {notice}
            </div>
          )}

          {showBuilder && (
            <form
              onSubmit={handleCreateQuiz}
              className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-5"
            >
              <h3 className="text-sm font-bold text-[var(--ak-ink)]">
                Create Timed Assessment (Auto-Graded with Worked Solutions)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--ak-ink-2)]">
                    Quiz Title
                  </label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. UNEB UACE Mathematics Paper 1 Drill"
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--ak-ink-2)]">
                    Curriculum Alignment
                  </label>
                  <select
                    value={curriculumTag}
                    onChange={(e) => setCurriculumTag(e.target.value as QuizCurriculumTag)}
                    className={fieldCls}
                  >
                    {CURRICULUM_TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-ink-2)]">
                  Instructions / Description
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Timed assessment covering past-paper questions and worked solutions."
                  className={fieldCls}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--ak-ink-2)]">
                    Time Limit (min)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={180}
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--ak-ink-2)]">
                    Passing Score (%)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={100}
                    value={passingPercent}
                    onChange={(e) => setPassingPercent(Number(e.target.value))}
                    className={fieldCls}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-[var(--ak-ink)]">
                    <input
                      type="checkbox"
                      checked={isPastPaper}
                      onChange={(e) => setIsPastPaper(e.target.checked)}
                    />
                    Past-Paper Exam Mode
                  </label>
                </div>
              </div>

              {/* Questions Builder */}
              <div className="space-y-3 border-t border-[var(--ak-divider)] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ak-muted)]">
                    Questions ({questions.length})
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => addQuestionDraft('MCQ')}
                      className="rounded-md border border-[var(--ak-border)] bg-[var(--ak-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)]"
                    >
                      + Add MCQ
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestionDraft('STRUCTURED')}
                      className="rounded-md border border-[var(--ak-border)] bg-[var(--ak-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)]"
                    >
                      + Add Structured
                    </button>
                  </div>
                </div>

                {questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-surface)] p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--ak-accent-ink)]">
                        Q{qIdx + 1} · {q.kind}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={q.marks}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, marks: Number(e.target.value) } : item
                              )
                            )
                          }
                          className="w-20 rounded border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-2 py-1 text-xs text-[var(--ak-ink)]"
                          aria-label="Marks"
                        />
                        {questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
                            }
                            className="text-[var(--ak-err-fg)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      required
                      value={q.prompt}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item, idx) =>
                            idx === qIdx ? { ...item, prompt: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Question prompt..."
                      className={fieldCls}
                    />

                    {q.kind === 'MCQ' && q.options ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={q.correctOptionIndex === optIdx}
                              onChange={() =>
                                setQuestions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === qIdx ? { ...item, correctOptionIndex: optIdx } : item
                                  )
                                )
                              }
                            />
                            <input
                              required={optIdx < 2}
                              value={opt}
                              onChange={(e) =>
                                setQuestions((prev) =>
                                  prev.map((item, idx) => {
                                    if (idx !== qIdx) return item;
                                    const nextOpts = [...(item.options || [])];
                                    nextOpts[optIdx] = e.target.value;
                                    return { ...item, options: nextOpts };
                                  })
                                )
                              }
                              placeholder={`Option ${optIdx + 1}`}
                              className={fieldCls}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={(q.acceptedKeywords || []).join(', ')}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx
                                  ? {
                                      ...item,
                                      acceptedKeywords: e.target.value
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    }
                                  : item
                              )
                            )
                          }
                          placeholder="Rubric keywords (comma-separated, e.g. gradient, intercept)"
                          className={fieldCls}
                        />
                        <input
                          value={q.sampleAnswer || ''}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, sampleAnswer: e.target.value } : item
                              )
                            )
                          }
                          placeholder="Model marking-scheme answer"
                          className={fieldCls}
                        />
                      </div>
                    )}

                    <input
                      required
                      value={q.workedSolution}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item, idx) =>
                            idx === qIdx ? { ...item, workedSolution: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Step-by-step worked solution shown to learner immediately after grading..."
                      className={fieldCls}
                    />
                  </div>
                ))}
              </div>

              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-5 py-2.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                Publish Assessment
              </button>
            </form>
          )}

          {/* Existing Quizzes */}
          {loading ? (
            <p className="text-sm text-[var(--ak-muted)]">Loading assessments...</p>
          ) : quizzes.length === 0 ? (
            <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-6 text-center text-sm text-[var(--ak-muted)]">
              No interactive quizzes in this course yet. Click &ldquo;New Quiz / Past Paper&rdquo;
              above to build one.
            </div>
          ) : (
            <div className="space-y-3">
              {quizzes.map((q) => {
                const quizAttempts = attempts.filter((a) => a.quizId === q.id);
                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-[var(--ak-accent-ink)]">
                          {q.curriculumTag} · {q.timeLimitMinutes} min · Pass ≥ {q.passingPercent}% ·{' '}
                          <span className={q.published ? 'text-[var(--ak-ok-fg)]' : 'text-[var(--ak-warn-fg)]'}>
                            {q.published ? 'PUBLISHED' : 'DRAFT'}
                          </span>
                        </p>
                        <h4 className="mt-0.5 text-sm font-bold text-[var(--ak-ink)]">{q.title}</h4>
                        <p className="text-xs text-[var(--ak-muted)]">
                          {q.questions.length} questions · {quizAttempts.length} learner submission(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(q)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-border)] bg-[var(--ak-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)]"
                        >
                          {q.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {q.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuiz(q.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-err-fg)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>

                    {quizAttempts.length > 0 && (
                      <div className="divide-y divide-[var(--ak-divider)] rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-surface)] text-xs">
                        {quizAttempts.slice(0, 6).map((att) => (
                          <div
                            key={att.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                          >
                            <span className="font-medium text-[var(--ak-ink)]">{att.learnerName}</span>
                            <span className="inline-flex items-center gap-2 font-mono-nums">
                              <span
                                className={
                                  att.passed ? 'text-[var(--ak-ok-fg)] font-semibold' : 'text-[var(--ak-warn-fg)]'
                                }
                              >
                                <CheckCircle2 className="mr-1 inline h-3 w-3" />
                                {att.percentScore}% ({att.gradeLabel})
                              </span>
                              <span className="text-[var(--ak-muted)]">
                                {new Date(att.submittedAt).toLocaleDateString()}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
