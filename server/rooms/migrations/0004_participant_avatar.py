from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rooms", "0003_room_opened_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="participant",
            name="avatar",
            field=models.CharField(blank=True, default="", max_length=7),
        ),
    ]
