from django.urls import path

from . import views

urlpatterns = [
    path("rooms/", views.CreateRoom.as_view()),
    path("rooms/<str:code>/join/", views.JoinRoom.as_view()),
    path("rooms/<str:code>/status/", views.RoomStatus.as_view()),
    path("rooms/<str:code>/state/", views.RoomState.as_view()),
    path("rooms/<str:code>/leave/", views.LeaveRoom.as_view()),
    path("rooms/<str:code>/end/", views.EndRoom.as_view()),
    path("rooms/<str:code>/hand/", views.RaiseHand.as_view()),
    path("rooms/<str:code>/hand/lower/", views.LowerHand.as_view()),
    path("rooms/<str:code>/floor/grant/", views.Grant.as_view()),
    path("rooms/<str:code>/floor/reject/", views.Reject.as_view()),
    path("rooms/<str:code>/floor/release/", views.Release.as_view()),
    path("rooms/<str:code>/floor/remove/", views.Remove.as_view()),
    path("rooms/<str:code>/settings/", views.RoomSettings.as_view()),
    path("rooms/<str:code>/questions/", views.QuestionCollection.as_view()),
    path("rooms/<str:code>/questions/inbox/", views.HostQuestionInbox.as_view()),
    path("rooms/<str:code>/questions/export/", views.QuestionExport.as_view()),
    path("rooms/<str:code>/questions/<int:question_id>/", views.MyQuestionDetail.as_view()),
    path("rooms/<str:code>/questions/<int:question_id>/moderate/", views.HostQuestionAction.as_view()),
    path("rooms/<str:code>/questions/<int:question_id>/block/", views.BlockQuestionSender.as_view()),
    path("rooms/<str:code>/questions/<int:question_id>/invite/", views.InviteQuestionSender.as_view()),
    path("rooms/<str:code>/questions/<int:question_id>/publish/", views.PublishQuestion.as_view()),
    path("rooms/<str:code>/announcements/", views.HostAnnouncements.as_view()),
    path("rooms/<str:code>/announcements/<int:announcement_id>/", views.DeleteAnnouncement.as_view()),
    path("rooms/<str:code>/screen-share/start/", views.StartScreenShare.as_view()),
    path("rooms/<str:code>/screen-share/stop/", views.StopScreenShare.as_view()),
    path("livekit/webhook/", views.LiveKitWebhook.as_view()),
]
