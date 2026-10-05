import re

from django.conf import settings
from rest_framework import serializers

from .models import Room

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class CreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    mode = serializers.ChoiceField(choices=Room.Mode.values, required=False, default=Room.Mode.APPROVAL)

    def validate_title(self, value):
        return " ".join(_CONTROL.sub(" ", value).split())


class JoinSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=40)
    guest_id = serializers.CharField(min_length=8, max_length=100)
    host_key = serializers.CharField(max_length=200, required=False, allow_blank=True, allow_null=True)

    def validate_display_name(self, value):
        value = " ".join(_CONTROL.sub(" ", value).split())
        if not value:
            raise serializers.ValidationError("Please enter a name.")
        return value


class IdentitySerializer(serializers.Serializer):
    identity = serializers.CharField(max_length=64)


class SettingsSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=Room.Mode.values, required=False)
    speaker_limit = serializers.IntegerField(min_value=1, required=False)

    def validate_speaker_limit(self, value):
        return min(value, settings.SELAH["MAX_SPEAKERS"])
