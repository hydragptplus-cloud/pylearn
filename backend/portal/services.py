import json
from urllib.parse import quote
import httpx
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.utils import timezone
from .models import AIProviderConfig, EmailNotification


class AIProviderError(ValueError):
    pass


def log_activity(actor, action, entity, entity_id="", details=""):
    from .models import ActivityLog
    return ActivityLog.objects.create(actor=actor, action=action, entity=entity, entity_id=str(entity_id or ""), details=details)


def queue_email(recipient, event_type, subject, summary):
    return EmailNotification.objects.create(
        recipient=recipient,
        event_type=event_type,
        subject=subject,
        summary=summary,
        status=EmailNotification.Status.SENT,
        attempted_at=timezone.now(),
    )


def retry_email(record):
    record.status = EmailNotification.Status.SENT
    record.error_message = ""
    record.attempted_at = timezone.now()
    record.save(update_fields=["status", "error_message", "attempted_at", "updated_at"])
    return record


def _fernet():
    if not settings.AI_CONFIG_ENCRYPTION_KEY:
        raise ValueError("AI_CONFIG_ENCRYPTION_KEY is not configured.")
    return Fernet(settings.AI_CONFIG_ENCRYPTION_KEY.encode())


def encrypt_key(value):
    return _fernet().encrypt(value.encode()).decode()


def decrypt_key(value):
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("The configured AI key cannot be decrypted.") from exc


def masked_key(config):
    try:
        key = decrypt_key(config.encrypted_api_key)
        return f"{key[:3]}...{key[-4:]}" if len(key) > 8 else "********"
    except ValueError:
        return "unavailable"


def normalize_ai_model(provider, model):
    value = str(model or "").strip()
    generic_aliases = {
        "gpt-oss-20b": "openai/gpt-oss-20b",
        "gpt-oss-120b": "openai/gpt-oss-120b",
    }
    if provider == AIProviderConfig.Provider.GENERIC:
        return generic_aliases.get(value.casefold(), value)
    if provider == AIProviderConfig.Provider.GEMINI:
        gemini_aliases = {
            "gemini 2.5 flash": "gemini-2.5-flash",
            "gemini 2.5 flash-lite": "gemini-2.5-flash-lite",
            "gemini 2.5 pro": "gemini-2.5-pro",
        }
        return gemini_aliases.get(value.casefold(), value)
    return value


def _provider_error(config, exc):
    provider = config.get_provider_display()
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code if exc.response is not None else "unknown"
        return AIProviderError(
            f"{provider} request failed with HTTP {status_code}. Check the configured model, base URL, and API key."
        )
    if isinstance(exc, httpx.RequestError):
        return AIProviderError(f"{provider} request failed before a response was received. Check network access and provider settings.")
    if isinstance(exc, (KeyError, IndexError, TypeError, json.JSONDecodeError)):
        return AIProviderError(f"{provider} returned an unexpected AI response.")
    return AIProviderError(f"{provider} could not complete the AI analysis.")


def generate_assessment_recommendations(student, performance, available_courses):
    config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
    if not config:
        raise ValueError("An Admin must configure an active AI provider.")
    api_key = decrypt_key(config.encrypted_api_key)
    prompt = (
        "Analyze the following student's Skill discoveryquiz performance, including every question, selected answer, "
        "correct answer, correctness, and topic. Determine the single knowledge or skill area where the student performed "
        "best, then match that strongest area against the provided list of available courses.\n"
        "Return ONLY a valid JSON object with a single key 'recommendations'. The value should be a JSON array of objects. "
        "The array must contain exactly one object for the one best-matching course, or an empty array if no course matches. "
        "The object must have exactly two keys: 'course_id' (the integer ID of the recommended course) and 'reason' "
        "(a short, personalized explanation of the strongest area the student demonstrated and why this course is the best database match). "
        "For passed attempts, the reason must be positive and strength-based. Do not say the student lacks, needs basics, "
        "has not demonstrated knowledge, or should start over unless the submitted answers actually show that weakness. "
        "Do not recommend every related course. Do not choose a course only because it relates to one question.\n"
        "Do not include markdown, prose, or code fences.\n\n"
        "Student Performance:\n" + json.dumps(performance, default=str) + "\n\n"
        "Available Courses:\n" + json.dumps(available_courses, default=str)
    )
    timeout = httpx.Timeout(30.0)
    try:
        if config.provider == AIProviderConfig.Provider.GEMINI:
            url = config.base_url or f"https://generativelanguage.googleapis.com/v1beta/models/{quote(config.model)}:generateContent"
            response = httpx.post(url, params={"key": api_key}, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=timeout)
            response.raise_for_status()
            text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        else:
            base = config.base_url or "https://api.openai.com/v1"
            response = httpx.post(
                f"{base.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": config.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are PyLearn's course recommendation engine. You only return valid JSON objects.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                },
                timeout=timeout,
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
        
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        
        try:
            dict_data = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start < 0 or end <= start:
                raise ValueError("Unexpected JSON structure")
            dict_data = json.loads(cleaned[start:end + 1])
            
        if "recommendations" in dict_data and isinstance(dict_data["recommendations"], list):
            data = dict_data["recommendations"]
        else:
            raise ValueError("Unexpected JSON structure, missing 'recommendations' key")
            
        return data
    except Exception as exc:
        raise _provider_error(config, exc) from exc
