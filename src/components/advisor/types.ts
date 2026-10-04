export type AdvisorRecommendation = {
  id: number;
  course: number;
  course_title: string;
  match_type: "ADVANCED" | "EXACT_MATCH" | "BEST_RELATED" | string;
  reason: string;
};

export type AdvisorAnalysis = {
  summary: string;
  strongest_field?: number | null;
  strongest_field_name?: string | null;
  strongest_skills: number[];
  strongest_skill_names: string[];
  field_scores: Array<{ field?: number; field_name?: string; score?: number; percentage?: number }>;
  strengths: string[];
  gaps: string[];
  level?: string;
  recommendations: AdvisorRecommendation[];
};

export type AdvisorAnswer = {
  question_id: number;
  prompt: string;
  question_type: string;
  topic: string;
  field: number | null;
  field_name: string | null;
  skill: number | null;
  skill_name: string | null;
  options: string[];
  max_points: number;
  submitted_answer: string;
  awarded_points: string;
  is_correct: boolean | null;
  correct_answer: string | null;
  ai_feedback: string | null;
};

export type AdvisorAttempt = {
  id: number;
  student?: number | null;
  student_name?: string | null;
  student_email?: string | null;
  quiz: number;
  quiz_title: string;
  quiz_type: string;
  score: string | null;
  max_score: string | null;
  percentage: string | null;
  analysis_status: string;
  analysis_error?: string;
  completed_at: string;
  analyzed_at?: string | null;
  published_at?: string | null;
  analysis?: AdvisorAnalysis | null;
  answers: AdvisorAnswer[];
};
