import uuid

from django.conf import settings
from django.http import JsonResponse


class RequestIdAndSecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        try:
            response = self.get_response(request)
        except Exception:
            if settings.DEBUG:
                raise
            response = JsonResponse(
                {
                    "detail": "An internal server error occurred.",
                    "request_id": request.request_id,
                },
                status=500,
            )
        response["X-Request-ID"] = request.request_id
        response.setdefault("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'")
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        return response
