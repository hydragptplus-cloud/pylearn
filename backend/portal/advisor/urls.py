from rest_framework.routers import DefaultRouter
from .views import AdvisorAttemptViewSet, AdvisorQuizViewSet, AdvisorSkillViewSet, CourseSkillViewSet, LearningFieldViewSet

router = DefaultRouter()
router.register("fields", LearningFieldViewSet, basename="advisor-field")
router.register("skills", AdvisorSkillViewSet, basename="advisor-skill")
router.register("course-skills", CourseSkillViewSet, basename="advisor-course-skill")
router.register("quizzes", AdvisorQuizViewSet, basename="advisor-quiz")
router.register("attempts", AdvisorAttemptViewSet, basename="advisor-attempt")
urlpatterns = router.urls
