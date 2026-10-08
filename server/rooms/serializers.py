import re

from django.conf import settings
from rest_framework import serializers

from .models import Question, Room

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class CreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    mode = serializers.ChoiceField(choices=Room.Mode.values, required=False, default=Room.Mode.APPROVAL)

    def validate_title(self, value):
        return " ".join(_CONTROL.sub(" ", value).split())


class JoinSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=40)
    host_key = serializers.CharField(max_length=200, required=False, allow_blank=True)
    guest_id = serializers.CharField(min_length=8, max_length=100, required=False)
    avatar = serializers.RegexField(r"^\d{7}$", required=False, allow_blank=True)

    def validate_display_name(self, value):
        value = " ".join(_CONTROL.sub(" ", value).split())
        if not value:
            raise serializers.ValidationError("Please enter a name.")
        return value

    def validate_avatar(self, value):
        limits = (8, 8, 8, 10, 8, 3, 3)
        if value and any(int(digit) >= limit for digit, limit in zip(value, limits)):
            raise serializers.ValidationError("Choose a valid avatar.")
        return value


class ClaimHostSerializer(serializers.Serializer):
    host_key = serializers.CharField(max_length=200)


class IdentitySerializer(serializers.Serializer):
    identity = serializers.CharField(max_length=64)


class SettingsSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=Room.Mode.values, required=False)
    speaker_limit = serializers.IntegerField(min_value=1, required=False)
    questions_enabled = serializers.BooleanField(required=False)
    anonymous_questions_enabled = serializers.BooleanField(required=False)

    def validate_speaker_limit(self, value):
        return min(value, settings.SELAH["MAX_SPEAKERS"])


class QuestionCreateSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=500, trim_whitespace=True)
    anonymous = serializers.BooleanField(default=False)

    def validate_text(self, value):
        value = " ".join(_CONTROL.sub(" ", value).split())
        if not value:
            raise serializers.ValidationError("Write a message first.")
        return value


class AnnouncementSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=500, trim_whitespace=True)

    def validate_text(self, value):
        value = " ".join(_CONTROL.sub(" ", value).split())
        if not value:
            raise serializers.ValidationError("Write an announcement first.")
        return value


class TextUpdateSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=500, trim_whitespace=True)

    def validate_text(self, value):
        value = " ".join(_CONTROL.sub(" ", value).split())
        if not value:
            raise serializers.ValidationError("Message cannot be empty.")
        return value


class QuestionActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=("answered", "dismissed"))
