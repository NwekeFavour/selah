from django.urls import path

from . import views

urlpatterns = [
    path("rooms/", views.CreateRoom.as_view()),
    path("rooms/<str:code>/join/", views.JoinRoom.as_view()),
    path("rooms/<str:code>/state/", views.RoomState.as_view()),
    path("rooms/<str:code>/hand/", views.RaiseHand.as_view()),
    path("rooms/<str:code>/hand/lower/", views.LowerHand.as_view()),
    path("rooms/<str:code>/floor/grant/", views.Grant.as_view()),
    path("rooms/<str:code>/floor/reject/", views.Reject.as_view()),
    path("rooms/<str:code>/floor/release/", views.Release.as_view()),
    path("rooms/<str:code>/floor/remove/", views.Remove.as_view()),
    path("rooms/<str:code>/settings/", views.RoomSettings.as_view()),
    path("livekit/webhook/", views.LiveKitWebhook.as_view()),
]
