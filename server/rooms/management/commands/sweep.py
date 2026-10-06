import logging
import time

from django.db import connections
from django.core.management.base import BaseCommand

from rooms.services import sweep_once

log = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Release floor spots held by people who did not reconnect, and close meetings that hit their time limit."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=float, default=5.0, help="Seconds between sweeps.")
        parser.add_argument("--once", action="store_true", help="Run a single sweep and exit.")

    def handle(self, *args, **opts):
        while True:
            try:
                sweep_once()
            except Exception:
                log.exception("Sweep failed")
            finally:
                connections.close_all()
            if opts["once"]:
                return
            time.sleep(opts["interval"])
