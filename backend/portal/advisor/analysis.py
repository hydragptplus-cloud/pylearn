import json
from decimal import Decimal
from urllib.parse import quote

import httpx
from django.db import transaction
from django.utils import timezone

from ..models import AIProviderConfig, Course, QuizAnswer, QuizAttempt
from ..services import decrypt_key
from .models import AdvisorAnalysis, AdvisorAuditLog, AdvisorRecommendation, LearningField


def level_for(percentage):
    value = Decimal(str(percentage))
    if value >= 80:
        return AdvisorAnalysis.Level.ADVANCED
    if value >= 50:
        return AdvisorAnalysis.Level.INTERMEDIATE
    return AdvisorAnalysis.Level.BEGINNER


def _provider_json(prompt):
    config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
    if not config:
        raise ValueError("An Admin must configure an active AI provider.")
    key = decrypt_key(config.encrypted_api_key)
    timeout = httpx.Timeout(45.0)
    if config.provider == AIProviderConfig.Provider.GEMINI:
        url = config.base_url or f"https://generativelanguage.googleapis.com/v1beta/models/{quote(config.model)}:generateContent"
        response = httpx.post(url, params={"key": key}, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=timeout)
        response.raise_for_status()
        raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    else:
        base = config.base_url or "https://api.openai.com/v1"
        response = httpx.post(f"{base.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": config.model, "messages": [{"role": "system", "content": "You are a fair, semantic grader for PyLearn advisor assessments. Grade knowledge and meaning, never superficial formatting. Return one valid JSON object only."}, {"role": "user", "content": prompt}], "temperature": 0.1, "response_format": {"type": "json_object"}}, timeout=timeout)
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)


def _payload(attempt):
    answers = list(attempt.answers.select_related("question", "question__learning_field", "question__advisor_skill"))
    courses = Course.objects.filter(status=Course.Status.PUBLISHED).exclude(enrollments__student=attempt.student).select_related("category").prefetch_related("advisor_skill_mappings__skill")
    fields = LearningField.objects.filter(is_active=True).prefetch_related("skills")
    return {
        "quiz": {"id": attempt.quiz_id, "type": attempt.quiz.quiz_type, "is_initial_assessment": attempt.quiz.is_initial_assessment, "target_field_id": attempt.quiz.target_field_id},
        "learning_fields": [{"field_id": f.id, "name": f.name, "skills": [{"skill_id": s.id, "name": s.name} for s in f.skills.filter(is_active=True)]} for f in fields],
        "answers": [{"answer_id": a.id, "question": a.question.prompt, "type": a.question.question_type, "answer": a.answer, "correct_answer": a.question.correct_answer, "rubric": a.question.grading_rubric, "max_points": a.question.points, "objective_correct": a.is_correct, "field_id": a.question.learning_field_id, "skill_id": a.question.advisor_skill_id} for a in answers],
        "courses": [{"course_id": c.id, "title": c.title, "description": c.description, "category": c.category.name if c.category else "", "level": c.level, "skills": [m.skill.name for m in c.advisor_skill_mappings.all()]} for c in courses],
    }


def _grading_prompt(attempt):
    is_discovery = (
        attempt.quiz.quiz_type == attempt.quiz.QuizType.SKILL_DISCOVERY
        or attempt.quiz.is_initial_assessment
    )

    if is_discovery:
        instructions = """Analyze and grade the complete Skill Discovery assessment attempt supplied below.

Grading rules for every SHORT_ANSWER and LONG_ANSWER:
- Grade semantic correctness: equivalent wording, capitalization, punctuation, grammar, word order, and extra correct explanation must not reduce the score.
- In a reference answer, the pipe character | separates alternative accepted answers. It is never a literal response format. For example, "Continuous Integration|CI" means either phrase is accepted; "Continuous Integration (CI)" is fully correct.
- Treat standard abbreviations and their expanded forms as equivalent when the context makes their meaning clear.
- A response that contains all required concepts in the reference answer or rubric receives full points, even when it is more detailed than expected.
- Give partial credit proportional to the correct required concepts demonstrated. Use zero only for blank, irrelevant, or substantively incorrect responses.
- Feedback must explain missing or incorrect concepts. Never claim a format mismatch merely because the wording differs from the reference answer.
- awarded_points must be a number from 0 through that answer's max_points.

Skill Discovery Analysis rules:
1. Questions in Skill Discovery do not have predefined skill tags. Analyze the questions, the student's answers, correctness, and demonstrated understanding across the assessment.
2. Infer and determine the single most likely Strongest Skill of the student (e.g., "Problem Solving", "Communication", "Python Fundamentals", "System Design", "Algorithmic Thinking", etc.).
3. Do NOT identify or return skill gaps. Skill Discovery does not use skill gaps; "gaps" must be an empty list [].
4. Recommend exactly ONE best course: Based on the student's answers/results and the inferred strongest skill, evaluate the available courses and select the single most suitable course. Do not recommend multiple courses or a list.

Return one JSON object with these keys:
- answer_grades: one item for every SHORT_ANSWER and LONG_ANSWER, containing answer_id, awarded_points, and feedback
- summary: a concise, strength-focused summary of the student's assessment performance
- strongest_skill: the single inferred strongest skill name as a string (e.g. "Problem Solving" or "Communication")
- strongest_skills: [strongest_skill] (array containing only the single strongest skill string)
- strengths: list of 1-3 specific strengths demonstrated by the student
- gaps: [] (must be an empty array)
- recommendations: an array containing EXACTLY ONE object for the single best course:
    - course_id: integer ID of the recommended course from the available courses list
    - match_type: "EXACT_MATCH", "BEST_RELATED", or "ADVANCED"
    - reason: a short, positive, strength-based explanation of why this course is the best recommendation

Use only IDs supplied in the payload. Do not invent course IDs.

ATTEMPT PAYLOAD:
"""
    else:
        instructions = """Analyze and grade the complete Advisor attempt supplied below.

Grading rules for every SHORT_ANSWER and LONG_ANSWER:
- Grade semantic correctness: equivalent wording, capitalization, punctuation, grammar, word order, and extra correct explanation must not reduce the score.
- In a reference answer, the pipe character | separates alternative accepted answers. It is never a literal response format. For example, "Continuous Integration|CI" means either phrase is accepted; "Continuous Integration (CI)" is fully correct.
- Treat standard abbreviations and their expanded forms as equivalent when the context makes their meaning clear.
- A response that contains all required concepts in the reference answer or rubric receives full points, even when it is more detailed than expected.
- Give partial credit proportional to the correct required concepts demonstrated. Use zero only for blank, irrelevant, or substantively incorrect responses.
- Do not demand an exact phrase or a concise format unless the question or grading rubric explicitly requires it.
- Feedback must explain missing or incorrect concepts. Never claim a format mismatch merely because the wording differs from the reference answer.
- awarded_points must be a number from 0 through that answer's max_points.

Return one JSON object with these keys:
- answer_grades: one item for every SHORT_ANSWER and LONG_ANSWER, containing answer_id, awarded_points, and feedback
- summary, strongest_field_id, strongest_skill_ids, field_scores, strengths, gaps
- recommendations: items containing course_id, match_type (ADVANCED, EXACT_MATCH, or BEST_RELATED), and reason

Use only IDs supplied in the payload. Do not invent IDs.

ATTEMPT PAYLOAD:
"""
    return instructions + json.dumps(_payload(attempt), default=str)


def analyze_attempt(attempt_id, actor):
    with transaction.atomic():
        attempt = QuizAttempt.objects.select_for_update().select_related("quiz", "student").get(pk=attempt_id)
        if attempt.quiz.quiz_type == attempt.quiz.QuizType.COURSE:
            raise ValueError("Course quizzes do not use Advisor analysis.")
        if attempt.analysis_status == QuizAttempt.AnalysisStatus.ANALYZING:
            raise ValueError("This attempt is already being analyzed.")
        attempt.analysis_status = QuizAttempt.AnalysisStatus.ANALYZING
        attempt.analysis_error = ""
        attempt.save(update_fields=["analysis_status", "analysis_error", "updated_at"])
    prompt = _grading_prompt(attempt)
    try:
        data = _provider_json(prompt)
        with transaction.atomic():
            attempt = QuizAttempt.objects.select_for_update().select_related("quiz").get(pk=attempt_id)
            answers = {a.id: a for a in attempt.answers.select_related("question")}
            for grade in data.get("answer_grades", []):
                answer = answers.get(int(grade.get("answer_id", 0)))
                if not answer or answer.question.question_type not in {answer.question.QuestionType.SHORT_ANSWER, answer.question.QuestionType.LONG_ANSWER}:
                    continue
                awarded = max(Decimal("0"), min(Decimal(str(grade.get("awarded_points", 0))), Decimal(answer.question.points)))
                answer.awarded_points = awarded
                answer.ai_feedback = str(grade.get("feedback", ""))[:2000]
                answer.save(update_fields=["awarded_points", "ai_feedback"])
            score = sum((a.awarded_points for a in attempt.answers.all()), Decimal("0"))
            maximum = sum((Decimal(a.question.points) for a in attempt.answers.select_related("question")), Decimal("0"))
            percentage = (score / maximum * 100).quantize(Decimal("0.01")) if maximum else Decimal("0")
            
            is_discovery = (
                attempt.quiz.quiz_type == attempt.quiz.QuizType.SKILL_DISCOVERY
                or attempt.quiz.is_initial_assessment
            )

            strongest_id = data.get("strongest_field_id")
            strongest = LearningField.objects.filter(pk=strongest_id).first() if (strongest_id and not is_discovery) else None

            # Handle strongest skills (strings for discovery, IDs or strings for development)
            strongest_skills_raw = data.get("strongest_skills")
            if not strongest_skills_raw and data.get("strongest_skill"):
                strongest_skills_raw = [data.get("strongest_skill")]
            elif not strongest_skills_raw and data.get("strongest_skill_ids"):
                strongest_skills_raw = data.get("strongest_skill_ids")
            if isinstance(strongest_skills_raw, str):
                strongest_skills_raw = [strongest_skills_raw]
            if not isinstance(strongest_skills_raw, list):
                strongest_skills_raw = []

            gaps = [] if is_discovery else data.get("gaps", [])
            field_scores = [] if is_discovery else data.get("field_scores", [])

            reviewer = actor if getattr(actor, "role", None) == "ADMIN" else None
            analysis, _ = AdvisorAnalysis.objects.update_or_create(
                attempt=attempt,
                defaults={
                    "summary": str(data.get("summary", "")),
                    "strongest_field": strongest,
                    "strongest_skills": strongest_skills_raw,
                    "field_scores": field_scores,
                    "strengths": data.get("strengths", []),
                    "gaps": gaps,
                    "level": level_for(percentage),
                    "ai_payload": data,
                    "reviewed_by": reviewer,
                }
            )
            analysis.recommendations.all().delete()
            eligible = {c.id: c for c in Course.objects.filter(status=Course.Status.PUBLISHED).exclude(enrollments__student=attempt.student).prefetch_related("advisor_skill_mappings")}
            gap_skill_ids = {int(g["skill_id"]) for g in data.get("gaps", []) if isinstance(g, dict) and str(g.get("skill_id", "")).isdigit()}
            exact_available = any(gap_skill_ids.intersection({m.skill_id for m in c.advisor_skill_mappings.all()}) for c in eligible.values())
            
            recs_created = 0
            for rec in data.get("recommendations", []):
                course = eligible.get(int(rec.get("course_id", 0)))
                if not course:
                    continue
                kind = rec.get("match_type") or AdvisorRecommendation.MatchType.EXACT_MATCH
                if kind not in AdvisorRecommendation.MatchType.values:
                    kind = AdvisorRecommendation.MatchType.EXACT_MATCH
                
                valid = True
                if not is_discovery:
                    covered = {m.skill_id for m in course.advisor_skill_mappings.all()}
                    if kind == AdvisorRecommendation.MatchType.ADVANCED:
                        valid = course.level == Course.Level.ADVANCED
                    elif kind == AdvisorRecommendation.MatchType.EXACT_MATCH:
                        valid = bool(gap_skill_ids.intersection(covered))
                    elif kind == AdvisorRecommendation.MatchType.BEST_RELATED:
                        valid = not exact_available

                if valid:
                    AdvisorRecommendation.objects.create(
                        analysis=analysis,
                        course=course,
                        match_type=kind,
                        reason=str(rec.get("reason", ""))[:2000]
                    )
                    recs_created += 1
                    if is_discovery:
                        # Exactly ONE recommendation for Discovery
                        break

            if is_discovery and recs_created == 0 and eligible:
                fallback_course = next(iter(eligible.values()))
                skill_name = strongest_skills_raw[0] if strongest_skills_raw else "your assessment"
                AdvisorRecommendation.objects.create(
                    analysis=analysis,
                    course=fallback_course,
                    match_type=AdvisorRecommendation.MatchType.BEST_RELATED,
                    reason=f"Top recommended course based on your strongest skill in {skill_name}."
                )

            attempt.score, attempt.max_score, attempt.percentage = score, maximum, percentage
            attempt.passed = percentage >= attempt.quiz.passing_score
            published_at = timezone.now()
            attempt.analysis_status = QuizAttempt.AnalysisStatus.PUBLISHED
            attempt.analyzed_at = published_at
            attempt.published_at = published_at
            attempt.save(update_fields=["score", "max_score", "percentage", "passed", "analysis_status", "analyzed_at", "published_at", "updated_at"])
            AdvisorAuditLog.objects.create(analysis=analysis, actor=actor, action="AI_ANALYZED", changes={"result": data})
            AdvisorAuditLog.objects.create(analysis=analysis, actor=actor, action="AUTO_PUBLISHED", changes={})
            return analysis
    except Exception as exc:
        QuizAttempt.objects.filter(pk=attempt_id).update(analysis_status=QuizAttempt.AnalysisStatus.ANALYSIS_FAILED, analysis_error=str(exc)[:2000])
        raise
