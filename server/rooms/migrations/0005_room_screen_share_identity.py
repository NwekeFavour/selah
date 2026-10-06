from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rooms", "0004_participant_avatar"),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="screen_share_identity",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
    ]
