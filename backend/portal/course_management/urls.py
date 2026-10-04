from django.urls import path

from .views import (
    course_management_overview,
    instructor_list,
    instructor_courses,
    instructor_course_materials,
    instructor_course_quizzes,
    instructor_course_quiz_results,
)

urlpatterns = [
    path("overview/", course_management_overview, name="course-management-overview"),
    path("instructors/", instructor_list, name="course-management-instructors"),
    path(
        "instructors/<int:instructor_id>/courses/",
        instructor_courses,
        name="course-management-instructor-courses",
    ),
    path(
        "instructors/<int:instructor_id>/courses/<int:course_id>/materials/",
        instructor_course_materials,
        name="course-management-instructor-materials",
    ),
    path(
        "instructors/<int:instructor_id>/courses/<int:course_id>/quizzes/",
        instructor_course_quizzes,
        name="course-management-instructor-quizzes",
    ),
    path(
        "instructors/<int:instructor_id>/courses/<int:course_id>/quizzes/<int:quiz_id>/results/",
        instructor_course_quiz_results,
        name="course-management-instructor-quiz-results",
    ),
]
