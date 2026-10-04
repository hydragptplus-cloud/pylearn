from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from portal.models import Course, Enrollment, User
from portal.permissions import IsAdminRole


@api_view(["GET"])
@permission_classes([IsAdminRole])
def course_management_overview(request):
    """
    Admin-only endpoint returning platform-wide course management statistics.

    Returns:
      - total_courses: Total courses across all instructors and admin
      - active_instructors: Active accounts with role INSTRUCTOR
      - enrolled_students: Distinct students with at least one enrollment
      - published_rate: Published courses / total courses (0 when no courses)
      - courses_this_month: Courses created in the current calendar month
      - instructor_departments: Distinct non-blank departments among instructors
    """
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_courses = Course.objects.count()
    published_courses = Course.objects.filter(status=Course.Status.PUBLISHED).count()
    published_rate = round(published_courses / total_courses * 100, 1) if total_courses else 0

    active_instructors = User.objects.filter(
        role=User.Role.INSTRUCTOR, is_active=True
    ).count()

    enrolled_students = (
        Enrollment.objects.values("student").distinct().count()
    )

    courses_this_month = Course.objects.filter(created_at__gte=month_start).count()

    instructor_departments = (
        User.objects.filter(role=User.Role.INSTRUCTOR, is_active=True)
        .exclude(department="")
        .values("department")
        .distinct()
        .count()
    )

    return Response({
        "total_courses": total_courses,
        "active_instructors": active_instructors,
        "enrolled_students": enrolled_students,
        "published_rate": published_rate,
        "courses_this_month": courses_this_month,
        "instructor_departments": instructor_departments,
    })


@api_view(["GET"])
@permission_classes([IsAdminRole])
def instructor_list(request):
    """
    Admin-only endpoint listing all active instructors with summary metrics.
    """
    instructors = (
        User.objects.filter(role=User.Role.INSTRUCTOR, is_active=True)
        .annotate(
            course_count=Count("instructor_courses", distinct=True),
            student_count=Count(
                "instructor_courses__enrollments__student",
                distinct=True,
            ),
            published_count=Count(
                "instructor_courses",
                filter=Q(instructor_courses__status=Course.Status.PUBLISHED),
                distinct=True,
            ),
        )
        .order_by("first_name", "last_name", "email")
    )

    data = []
    for instructor in instructors:
        name = instructor.get_full_name() or instructor.email
        data.append({
            "id": instructor.pk,
            "name": name,
            "email": instructor.email,
            "department": instructor.department,
            "avatar": instructor.avatar.url if instructor.avatar else None,
            "course_count": instructor.course_count,
            "published_count": instructor.published_count,
            "student_count": instructor.student_count,
            "date_joined": instructor.date_joined.isoformat(),
        })

    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminRole])
def instructor_courses(request, instructor_id):
    """
    Admin-only read-only endpoint: list all courses for a specific instructor.
    """
    instructor = User.objects.filter(
        pk=instructor_id, role=User.Role.INSTRUCTOR, is_active=True
    ).first()
    if not instructor:
        return Response(
            {"detail": "Instructor not found."},
            status=404,
        )

    courses = (
        Course.objects.filter(instructor=instructor)
        .select_related("category")
        .prefetch_related("materials", "enrollments")
        .order_by("-created_at")
    )

    data = []
    for course in courses:
        data.append({
            "id": course.pk,
            "course_code": course.course_code or "",
            "title": course.title,
            "description": course.description,
            "category": course.category.name if course.category else "",
            "level": course.get_level_display(),
            "status": course.status,
            "course_type": course.course_type,
            "price": str(course.price),
            "duration_hours": course.duration_hours,
            "thumbnail": course.thumbnail.url if course.thumbnail else None,
            "material_count": course.materials.count(),
            "enrollment_count": course.enrollments.count(),
            "created_at": course.created_at.isoformat(),
        })

    instructor_name = instructor.get_full_name() or instructor.email
    return Response({
        "instructor": {
            "id": instructor.pk,
            "name": instructor_name,
            "email": instructor.email,
            "department": instructor.department,
            "avatar": instructor.avatar.url if instructor.avatar else None,
        },
        "courses": data,
    })


@api_view(["GET"])
@permission_classes([IsAdminRole])
def instructor_course_materials(request, instructor_id, course_id):
    """
    Admin-only read-only endpoint: list materials for an instructor's course.
    """
    course = Course.objects.filter(
        pk=course_id, instructor_id=instructor_id, instructor__is_active=True
    ).first()
    if not course:
        return Response({"detail": "Course not found."}, status=404)

    materials = course.materials.order_by("order", "pk")
    data = [
        {
            "id": m.pk,
            "title": m.title,
            "description": m.description,
            "material_type": m.material_type,
            "order": m.order,
            "has_file": bool(m.file),
            "created_at": m.created_at.isoformat(),
        }
        for m in materials
    ]

    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminRole])
def instructor_course_quizzes(request, instructor_id, course_id):
    """
    Admin-only read-only endpoint: list quizzes for an instructor's course.
    """
    course = Course.objects.filter(
        pk=course_id, instructor_id=instructor_id, instructor__is_active=True
    ).first()
    if not course:
        return Response({"detail": "Course not found."}, status=404)

    quizzes = course.quizzes.prefetch_related("questions").order_by("-created_at")
    data = [
        {
            "id": q.pk,
            "title": q.title,
            "description": q.description,
            "passing_score": q.passing_score,
            "is_published": q.is_published,
            "results_published": q.results_published,
            "question_count": q.questions.count(),
            "created_at": q.created_at.isoformat(),
        }
        for q in quizzes
    ]

    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminRole])
def instructor_course_quiz_results(request, instructor_id, course_id, quiz_id):
    """
    Admin-only read-only endpoint: quiz attempt results for an instructor's quiz.
    """
    from portal.models import Quiz, QuizAttempt

    quiz = Quiz.objects.filter(
        pk=quiz_id, course_id=course_id, course__instructor_id=instructor_id
    ).first()
    if not quiz:
        return Response({"detail": "Quiz not found."}, status=404)

    attempts = (
        QuizAttempt.objects.filter(quiz=quiz)
        .select_related("student")
        .order_by("-completed_at")
    )
    data = [
        {
            "id": a.pk,
            "student_name": a.student.get_full_name() or a.student.email,
            "student_email": a.student.email,
            "score": str(a.score),
            "max_score": str(a.max_score),
            "percentage": str(a.percentage),
            "passed": a.passed,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        }
        for a in attempts
    ]

    return Response({
        "quiz": {
            "id": quiz.pk,
            "title": quiz.title,
            "passing_score": quiz.passing_score,
        },
        "attempts": data,
    })
