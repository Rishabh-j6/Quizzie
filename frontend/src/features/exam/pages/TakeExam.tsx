import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, AlertTriangle } from 'lucide-react';
import { useToastStore } from '@/shared/components/feedback/Toast';

import { useExamStore } from '../store/examStore';
import QuestionCard from '../components/QuestionCard';
import QuestionPalette from '../components/QuestionPalette';
import ExamTimer from '../components/ExamTimer';
import AutoSaveIndicator from '../components/AutoSaveIndicator';
import SubmitModal from '../components/SubmitModal';
import HealthBar from '../components/HealthBar';
import CameraProctoring from '../components/CameraProctoring';

import api from '@/lib/api';

const TakeExam = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  const {
    questions,
    currentQuestionIndex,
    isSubmitted,
    attemptId,
    initExam,
    nextQuestion,
    prevQuestion,
    submitExam,
    answers,
  } = useExamStore();
  
  const { addToast } = useToastStore();

  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<any>(null);
  const [proctoringSettings, setProctoringSettings] = useState<any>(null);
  const [examError, setExamError] = useState<string | null>(null);
  const [slideDirection, setSlideDirection] = useState<'forward' | 'backward'>('forward');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHealthZero, setIsHealthZero] = useState(false);
  const [isFullscreenStart, setIsFullscreenStart] = useState(false);
  const hasSubmittedRef = useRef(false);
  const answersRef = useRef(answers);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const handleNextQuestion = () => {
    setSlideDirection('forward');
    nextQuestion();
  };

  const handlePrevQuestion = () => {
    setSlideDirection('backward');
    prevQuestion();
  };

  /* --------------------------------
     Enforce Browser Anti-Cheat Checks
  -------------------------------- */
  useEffect(() => {
    const handleFullscreenChange = () => {
      // If student drops out of fullscreen while the exam is active
      if (!document.fullscreenElement && isFullscreenStart && !hasSubmittedRef.current) {
        api.post('/monitor/enhanced/violation', {
          attempt_id: attemptId,
          event_type: 'proctoring_flag',
          flags: [{
            type: 'fullscreen_exit',
            severity: 'high',
            message: 'Student exited full-screen mode',
            metadata: { timestamp: new Date().toISOString() }
          }]
        }).catch(() => {});
        addToast('VIOLATION: You have exited full-screen mode! This has been reported to the examiner.', 'error');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Prevent Copy / Paste
    const preventCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      addToast('Copying and pasting is strictly prohibited during the exam.', 'warning');
    };
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();

    document.addEventListener('copy', preventCopyPaste);
    document.addEventListener('paste', preventCopyPaste);
    document.addEventListener('contextmenu', preventContextMenu);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('contextmenu', preventContextMenu);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [isFullscreenStart, attemptId]);

  /* --------------------------------
     Auto-Submit Handlers
  -------------------------------- */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasSubmittedRef.current && attemptId && exam) {
        // Build payload
        const responses = Array.from(answersRef.current.values()).map((a: any) => {
          const q = exam.questions.find((q: any) => q.id === a.questionId);
          let mappedOptionIds: string[] = [];
          if (q) {
            mappedOptionIds = a.selectedOptionIndices.map((idx: number) => q.options[idx].id);
          }
          return {
            question_id: a.questionId,
            selected_option_ids: mappedOptionIds,
            marked_for_review: a.markedForReview,
          };
        });
        
        const payload = JSON.stringify({ responses });
        // Send a beacon that doesn't block unmount
        navigator.sendBeacon(
          `http://localhost:8000/api/v1/attempts/${attemptId}/submit`,
          new Blob([payload], { type: 'application/json' })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [attemptId, exam]);

  /* --------------------------------
     Fetch Exam + Questions
  -------------------------------- */
  useEffect(() => {
    fetchExamAndQuestions();
  }, [examId]);

  /* --------------------------------
     Fetch Proctoring Settings
  -------------------------------- */
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // ✅ FIXED: Added /enhanced to the path
        const res = await api.get(
          `/monitor/enhanced/exam/${examId}/proctoring-settings`
        );
        setProctoringSettings(res.data);
      } catch (err) {
        console.error('Failed to fetch proctoring settings:', err);
        // Set default settings if fetch fails
        setProctoringSettings({
          camera_enabled: true,
          microphone_enabled: false,
          face_detection_enabled: true,
          multiple_face_detection: true,
          head_pose_detection: true,
          tab_switch_detection: true,
          min_face_confidence: 0.6,
          max_head_rotation: 30.0,
          detection_interval: 2,
          initial_health: 100,
          health_warning_threshold: 40,
          auto_submit_on_zero_health: true
        });
      }
    };

    if (examId) {
      fetchSettings();
    }
  }, [examId]);

  const fetchExamAndQuestions = async () => {
    try {
      const examRes = await api.get(`/exams/${examId}`);
      setExam(examRes.data);

      const questionsRes = await api.get(`/exams/${examId}/questions`);

      if (!questionsRes.data?.length) {
        setExamError('No questions available in this exam.');
        setLoading(false);
        return;
      }

      const state = window.history.state?.usr;
      const attemptIdFromState = state?.attemptId;

      if (!attemptIdFromState) {
        alert('No attempt found. Please restart the exam.');
        navigate('/student');
        return;
      }

      initExam(
        examId!,
        questionsRes.data,
        examRes.data.duration_minutes * 60,
        attemptIdFromState
      );

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch exam:', error);
      alert('Failed to load exam.');
      navigate('/student');
    }
  };

  /* --------------------------------
     Submission
  -------------------------------- */
  const handleSubmit = () => {
    setShowSubmitModal(true);
  };

  const confirmSubmit = async () => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setIsSubmitting(true);
    
    setShowSubmitModal(false);

    try {
      const responses = Array.from(
        useExamStore.getState().answers.values()
      ).map(a => {
        const question = questions.find(q => q.id === a.questionId);
        const mappedOptionIds = a.selectedOptions.map(idx => question?.options[idx]?.id).filter(Boolean);
            
        return {
          question_id: a.questionId,
          selected_option_ids: mappedOptionIds as string[],
          marked_for_review: a.markedForReview,
        };
      });

      await api.post(`/attempts/${attemptId}/submit`, { responses });

      submitExam();
      navigate(`/student/exam/${examId}/results`, {
        state: { attemptId },
      });
    } catch (error) {
      console.error('Submit failed:', error);
      addToast('Failed to submit exam.', 'error');
      hasSubmittedRef.current = false;
      setIsSubmitting(false);
      setIsHealthZero(false);
    }
  };

  /* --------------------------------
     Proctoring Handlers
  -------------------------------- */
  const handleHealthZero = () => {
    setIsHealthZero(true);
    addToast('Your exam health reached zero. Auto-submitting.', 'error');
    confirmSubmit();
  };

  const handleViolation = (violation: any) => {
    console.log('Violation detected:', violation);
    // Optional: toast / modal
  };

  if (examError) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Exam Error</h2>
        <p className="text-slate-400 mb-8">{examError}</p>
        <button
          onClick={() => navigate('/student')}
          className="px-6 py-3 bg-indigo-600 rounded-lg font-semibold hover:bg-indigo-700 transition"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isHealthZero || isSubmitting) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center fixed inset-0 z-[9999]">
        <AlertTriangle className="w-16 h-16 text-rose-500 mb-4 animate-pulse" />
        <h2 className="text-3xl font-bold mb-4 text-white">
          {isHealthZero ? 'Exam Terminated' : 'Submitting Exam...'}
        </h2>
        <p className="text-slate-300 mb-8 max-w-lg">
          {isHealthZero 
            ? 'Your exam health has depleted entirely due to repeated violations. The system is securely saving and auto-submitting your progress.'
            : 'Please wait while your responses are securely saved. Your camera is now off.'}
        </p>
        <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isFullscreenStart) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center">
        <AlertTriangle className="w-16 h-16 text-indigo-500 mb-4" />
        <h2 className="text-3xl font-bold mb-4">Exam Mode Strict Enforcement</h2>
        <p className="text-slate-300 mb-8 max-w-lg">
          To maintain exam integrity, this assessment requires a full-screen environment. 
          Leaving the full-screen mode, switching tabs, or attempting to open other applications 
          will result in a high-severity penalty.
        </p>
        <button
          onClick={async () => {
            try {
              if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
              }
              setIsFullscreenStart(true);
            } catch (err) {
              addToast('Could not enter fullscreen. Please ensure your browser allows fullscreen.', 'error');
            }
          }}
          className="px-8 py-4 bg-indigo-600 rounded-lg font-bold text-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20"
        >
          Enter Fullscreen & Begin Exam
        </button>
      </div>
    );
  }

  if (!exam || questions.length === 0) {
    return null;
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Health Bar */}
      {attemptId && (
        <HealthBar
          attemptId={attemptId}
          onHealthZero={handleHealthZero}
          showViolations
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-800/80 backdrop-blur-md border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between">
          <h1 className="text-xl font-bold">{exam?.title}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
            <AutoSaveIndicator />
            <ExamTimer />
            <button
              onClick={() => setShowPalette(!showPalette)}
              className="p-2 hover:bg-slate-700 rounded-lg"
            >
              <Palette className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Warning */}
      <div className="bg-amber-900/20 border-b border-amber-900/50 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          This exam is being proctored
        </div>
      </div>

      {/* Camera Proctoring */}
      {proctoringSettings && attemptId && (
        <div className="max-w-7xl mx-auto px-6 py-4">
          <CameraProctoring
            attemptId={attemptId}
            isActive
            settings={proctoringSettings}
            onViolation={handleViolation}
          />
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
        <div className="flex-1 max-w-4xl max-h-full overflow-y-auto px-8 py-6 custom-scrollbar relative">
          <QuestionCard direction={slideDirection} />
          
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={handlePrevQuestion}
              disabled={currentQuestionIndex === 0}
              className="px-6 py-2 bg-slate-700 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>

            {currentQuestionIndex === questions.length - 1 ? (
              <button
                onClick={handleSubmit}
                className="px-6 py-2 bg-emerald-600 rounded-lg"
              >
                Submit Exam
              </button>
            ) : (
              <button
                onClick={handleNextQuestion}
                className="px-6 py-2 bg-indigo-600 rounded-lg"
              >
                Next
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showPalette && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="w-80"
            >
              <QuestionPalette />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showSubmitModal && (
        <SubmitModal
          isOpen={true}
          onClose={() => setShowSubmitModal(false)}
          onConfirm={confirmSubmit}
        />
      )}
    </div>
  );
};

export default TakeExam;