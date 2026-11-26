import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  CertificateRecord,
  EnrollmentRecord,
  QuizAttempt,
  QuizItem,
} from '../types/akademi';

interface QuizRunnerModalProps {
  quiz: QuizItem;
  existingAttempt?: QuizAttempt;
  onClose: () => void;
  onSubmitted: (result: {
    attempt: QuizAttempt;
    enrollment?: EnrollmentRecord;
    issuedCertificate?: CertificateRecord | null;
  }) => void;
  onOpenCertificate?: (certificateId: string) => void;
}

export const QuizRunnerModal: React.FC<QuizRunnerModalProps> = ({
  quiz,
  existingAttempt,
  onClose,
  onSubmitted,
  onOpenCertificate,
}) => {
  const totalSeconds = Math.max(60, quiz.timeLimitMinutes * 60);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resultAttempt, setResultAttempt] = useState<QuizAttempt | null>(null);
  const [issuedCert, setIssuedCert] = useState<CertificateRecord | null>(null);
  const [reviewingPrevious, setReviewingPrevious] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (resultAttempt || reviewingPrevious) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resultAttempt, reviewingPrevious]);

  const handleSubmit = async () => {
    if (submitting || resultAttempt) return;
    setSubmitting(true);
    setError('');
    try {
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - startedAtRef.current) / 1000)
      );
      const res = await apiFetch<{
        attempt: QuizAttempt;
        enrollment?: EnrollmentRecord;
        issuedCertificate?: CertificateRecord | null;
      }>(`/api/quizzes/${quiz.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers, durationSeconds }),
      });
      setResultAttempt(res.attempt);
      setIssuedCert(res.issuedCertificate || null);
      onSubmitted(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit quiz.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (secondsLeft === 0 && !autoSubmittedRef.current && !resultAttempt && !reviewingPrevious) {
      autoSubmittedRef.current = true;
      handleSubmit();
    }
  }, [secondsLeft]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const activeAttempt = resultAttempt || (reviewingPrevious ? existingAttempt || null : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ak-divider)] px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--ak-accent-ink)]">
              {quiz.curriculumTag}
              {quiz.isPastPaper ? ' · Past-Paper Timed Drill' : ' · Course Assessment'} ·{' '}
              {quiz.courseTitle}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-bold text-[var(--ak-ink)]">{quiz.title}</h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!activeAttempt && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono-nums text-sm font-bold ${
                  secondsLeft <= 60
                    ? 'border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] text-[var(--ak-err-fg)]'
                    : 'border-[var(--ak-border)] bg-[var(--ak-recessed)] text-[var(--ak-ink)]'
                }`}
              >
                <Clock className="h-4 w-4" />
                {formatTimer(secondsLeft)}
              </span>
            )}
            {existingAttempt && !resultAttempt && (
              <button
                type="button"
                onClick={() => setReviewingPrevious((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ak-ink)]"
              >
                <Eye className="h-3.5 w-3.5" />
                {reviewingPrevious ? 'Retake Quiz' : `Review Last (${existingAttempt.percentScore}%)`}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assessment"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-4 py-3 text-sm text-[var(--ak-err-fg)]">
              {error}
            </div>
          )}

          {activeAttempt ? (
            <div className="space-y-5">
              {/* Instant Score Summary */}
              <div
                className={`rounded-xl border p-5 ${
                  activeAttempt.passed
                    ? 'border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)]'
                    : 'border-[var(--ak-warn-bd)] bg-[var(--ak-warn-bg)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ak-muted)]">
                      Auto-Graded Assessment Report
                    </p>
                    <h3 className="mt-1 text-2xl font-bold text-[var(--ak-ink)]">
                      {activeAttempt.percentScore}% · Grade {activeAttempt.gradeLabel}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--ak-ink-2)]">
                      Score: <strong className="font-mono-nums">{activeAttempt.scoreEarned}</strong> /{' '}
                      <strong className="font-mono-nums">{activeAttempt.totalMarks}</strong> marks ·{' '}
                      {activeAttempt.passed
                        ? `Passed (required ${quiz.passingPercent}%)`
                        : `Below passing threshold (${quiz.passingPercent}%) — review worked solutions below and retake anytime.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeAttempt.passed ? (
                      <CheckCircle2 className="h-8 w-8 text-[var(--ak-ok-fg)]" />
                    ) : (
                      <XCircle className="h-8 w-8 text-[var(--ak-warn-fg)]" />
                    )}
                  </div>
                </div>

                {issuedCert && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--ak-ok-bd)] bg-[var(--ak-surface)] px-4 py-3">
                    <div className="flex items-center gap-2.5 text-sm">
                      <Award className="h-5 w-5 text-[var(--ak-ok-fg)] shrink-0" />
                      <div>
                        <p className="font-bold text-[var(--ak-ink)]">
                          100% Course Completion Reached — Verifiable Certificate Issued!
                        </p>
                        <p className="text-xs text-[var(--ak-muted)] font-mono">
                          Code: {issuedCert.certificateCode}
                        </p>
                      </div>
                    </div>
                    {onOpenCertificate && (
                      <button
                        type="button"
                        onClick={() => onOpenCertificate(issuedCert.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-2 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                      >
                        <FileCheck2 className="h-3.5 w-3.5" />
                        Inspect QR PDF Certificate
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Worked Solutions Breakdown */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[var(--ak-ink)]">
                  Step-by-Step Worked Solutions &amp; Marking Guide
                </h4>
                {activeAttempt.questionResults.map((qr, idx) => {
                  const questionDef = quiz.questions.find((q) => q.id === qr.questionId);
                  const rawAnswer = activeAttempt.answers?.[qr.questionId];
                  const fallbackSubmitted =
                    questionDef?.kind === 'MCQ' &&
                    typeof rawAnswer === 'number' &&
                    questionDef.options?.[rawAnswer]
                      ? questionDef.options[rawAnswer]
                      : rawAnswer !== undefined
                        ? String(rawAnswer)
                        : 'Submitted';
                  return (
                    <div
                      key={qr.questionId}
                      className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-4 space-y-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--ak-ink)]">
                          Q{idx + 1}. {qr.prompt || questionDef?.prompt || 'Assessment Question'}
                        </span>
                        <span
                          className={`font-mono-nums text-xs font-bold ${
                            qr.isCorrect ? 'text-[var(--ak-ok-fg)]' : 'text-[var(--ak-err-fg)]'
                          }`}
                        >
                          {qr.earnedMarks} / {qr.maxMarks} marks
                        </span>
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-2">
                        <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-surface)] p-2.5">
                          <p className="font-semibold text-[var(--ak-muted)]">Your Answer</p>
                          <p className="mt-0.5 text-[var(--ak-ink)]">
                            {qr.submittedAnswer || fallbackSubmitted}
                          </p>
                        </div>
                        <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-surface)] p-2.5">
                          <p className="font-semibold text-[var(--ak-ok-fg)]">Expected / Rubric</p>
                          <p className="mt-0.5 text-[var(--ak-ink)]">
                            {qr.correctAnswer || qr.correctAnswerDisplay}
                          </p>
                          {qr.matchedKeywords && qr.matchedKeywords.length > 0 && (
                            <p className="mt-1 text-[var(--ak-muted)]">
                              Matched concepts: {qr.matchedKeywords.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-surface)] p-3 text-xs leading-relaxed text-[var(--ak-ink-2)]">
                        <strong className="text-[var(--ak-accent-ink)]">Worked Solution: </strong>
                        {qr.workedSolution}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-[var(--ak-ink-2)]">
                {quiz.description} · Passing score: <strong>{quiz.passingPercent}%</strong> ·{' '}
                {quiz.questions.length} questions
              </p>

              {quiz.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--ak-ink)]">
                      Q{idx + 1}. {q.prompt}
                    </p>
                    <span className="font-mono-nums text-xs font-semibold text-[var(--ak-accent-ink)] shrink-0">
                      [{q.marks} marks · {q.kind}]
                    </span>
                  </div>

                  {q.kind === 'MCQ' && q.options ? (
                    <div className="space-y-2">
                      {q.options.map((opt, optIdx) => {
                        const checked = answers[q.id] === optIdx;
                        return (
                          <label
                            key={optIdx}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                              checked
                                ? 'border-[#C9642E] bg-[var(--ak-surface)] text-[var(--ak-ink)] font-medium'
                                : 'border-[var(--ak-border)] bg-[var(--ak-surface)]/70 text-[var(--ak-ink-2)] hover:bg-[var(--ak-surface)]'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`quiz-${quiz.id}-q-${q.id}`}
                              checked={checked}
                              onChange={() =>
                                setAnswers((prev) => ({ ...prev, [q.id]: optIdx }))
                              }
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      rows={3}
                      value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder="Write your structured explanation, equations, or working steps..."
                      className="w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-surface)] px-3 py-2 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ak-divider)] px-6 py-4">
          <span className="text-xs text-[var(--ak-muted)]">
            Submitting automatically updates your course progress &amp; verified grade.
          </span>
          <div className="flex items-center gap-2">
            {activeAttempt ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setResultAttempt(null);
                    setReviewingPrevious(false);
                    setAnswers({});
                    setSecondsLeft(totalSeconds);
                    startedAtRef.current = Date.now();
                    autoSubmittedRef.current = false;
                  }}
                  className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-4 py-2 text-sm font-semibold text-[var(--ak-ink)]"
                >
                  Attempt Again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-[#C9642E] px-5 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-4 py-2 text-sm font-semibold text-[var(--ak-ink-2)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="rounded-lg bg-[#C9642E] px-5 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
                >
                  {submitting ? 'Auto-Grading...' : 'Submit & Auto-Grade'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
