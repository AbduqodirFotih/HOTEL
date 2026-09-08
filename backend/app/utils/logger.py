import os
import sys
from datetime import datetime

class Logger:
    LEVELS = {"debug": 10, "info": 20, "warn": 30, "error": 40}
    COLORS = {
        "debug": "\033[90m", # gray
        "info": "\033[36m",  # cyan
        "warn": "\033[33m",  # yellow
        "error": "\033[31m", # red
        "reset": "\033[0m",
    }
    
    def __init__(self):
        env_level = os.environ.get("LOG_LEVEL", "info").lower()
        self.current_level = self.LEVELS.get(env_level, self.LEVELS["info"])

    def _fmt(self, level_name, args):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        color = self.COLORS.get(level_name, "")
        reset = self.COLORS["reset"]
        tag = f"{color}[{level_name.upper()}]{reset}"
        msg = " ".join(str(a) for a in args)
        return f"{ts} {tag} {msg}"

    def debug(self, *args):
        if self.LEVELS["debug"] >= self.current_level:
            print(self._fmt("debug", args), file=sys.stdout)

    def info(self, *args):
        if self.LEVELS["info"] >= self.current_level:
            print(self._fmt("info", args), file=sys.stdout)

    def warn(self, *args):
        if self.LEVELS["warn"] >= self.current_level:
            print(self._fmt("warn", args), file=sys.stderr)

    def error(self, *args):
        if self.LEVELS["error"] >= self.current_level:
            print(self._fmt("error", args), file=sys.stderr)

logger = Logger()
