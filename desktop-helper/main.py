"""
Desktop CRL Helper — run the helper server and optionally register autostart.
One-time install: user runs this (or the built exe) once; then verification on the site works.
"""

import os
import platform
import sys
from pathlib import Path

# Ensure desktop-helper dir is on path when run as script (e.g. python desktop-helper/main.py)
_here = Path(__file__).resolve().parent
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))

from crl_helper_server import PORT, HOST, run_server

AUTOSTART_FLAG_NAME = ".crl-helper-autostart-enabled"
ASKED_AUTOSTART_NAME = ".crl-helper-autostart-asked"


def get_config_dir() -> Path:
    if platform.system() == "Windows":
        base = Path(os.environ.get("APPDATA", os.path.expanduser("~")))
        return base / "CRL-Helper"
    if platform.system() == "Darwin":
        return Path.home() / "Library" / "Application Support" / "CRL-Helper"
    return Path.home() / ".config" / "crl-helper"


def is_autostart_enabled() -> bool:
    config_dir = get_config_dir()
    return (config_dir / AUTOSTART_FLAG_NAME).exists()


def set_autostart_enabled(enabled: bool) -> None:
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)
    flag_file = config_dir / AUTOSTART_FLAG_NAME
    if enabled:
        flag_file.touch()
    elif flag_file.exists():
        flag_file.unlink()


def get_executable_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable)
    return Path(__file__).resolve().parent / "main.py"


def register_autostart() -> bool:
    exe = get_executable_path()
    system = platform.system()

    if system == "Windows":
        startup = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
        if not startup.exists():
            return False
        try:
            import shutil
            if getattr(sys, "frozen", False):
                shutil.copy2(exe, startup / "CRL-Helper.exe")
            else:
                bat = startup / "CRL-Helper.bat"
                bat.write_text(f'@echo off\nstart "" "{sys.executable}" "{exe}"\n', encoding="utf-8")
            set_autostart_enabled(True)
            return True
        except Exception:
            return False

    if system == "Darwin":
        launch_agents = Path.home() / "Library" / "LaunchAgents"
        launch_agents.mkdir(parents=True, exist_ok=True)
        plist = launch_agents / "ru.crl.helper.plist"
        if getattr(sys, "frozen", False):
            args_xml = f"  <string>{exe}</string>\n"
        else:
            args_xml = f"  <string>{sys.executable}</string>\n  <string>{exe}</string>\n"
        content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ru.crl.helper</string>
  <key>ProgramArguments</key>
  <array>
{args_xml}  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
"""
        try:
            plist.write_text(content, encoding="utf-8")
            set_autostart_enabled(True)
            return True
        except Exception:
            return False

    if system == "Linux":
        autostart = Path.home() / ".config" / "autostart"
        autostart.mkdir(parents=True, exist_ok=True)
        desktop = autostart / "crl-helper.desktop"
        exec_line = str(exe) if getattr(sys, "frozen", False) else f"{sys.executable} {exe}"
        content = f"""[Desktop Entry]
Type=Application
Name=CRL Helper
Exec={exec_line}
X-GNOME-Autostart-enabled=true
"""
        try:
            desktop.write_text(content, encoding="utf-8")
            set_autostart_enabled(True)
            return True
        except Exception:
            return False

    return False


def ask_autostart() -> bool:
    try:
        print("Запускать приложение при входе в систему? (y/n): ", end="", flush=True)
        line = sys.stdin.readline()
        return line.strip().lower() in ("y", "yes", "д", "да")
    except Exception:
        return False


def main() -> None:
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)
    asked_file = config_dir / ASKED_AUTOSTART_NAME
    if not asked_file.exists():
        asked_file.touch()
        if ask_autostart():
            if register_autostart():
                print("Автозапуск включён.")
            else:
                print("Не удалось включить автозапуск (недостаточно прав или ОС).")
        else:
            set_autostart_enabled(False)

    print(f"CRL Helper запущен. Оставьте это окно открытым.")
    print(f"Адрес: http://{HOST}:{PORT}/helper?url=<CRL_URL>")
    print("Для выхода закройте окно или нажмите Ctrl+C.")

    try:
        server = run_server(PORT, HOST)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print("", file=sys.stderr)
            print("Ошибка: порт 7777 уже занят (запущена другая копия CRL-Helper или служба).", file=sys.stderr)
            print("Освободите порт: lsof -ti:7777 | xargs kill", file=sys.stderr)
            print("Или остановите службу: launchctl bootout gui/$(id -u) \"$HOME/Library/LaunchAgents/ru.crl.helper.plist\"", file=sys.stderr)
            print("Затем снова запустите этот файл.", file=sys.stderr)
            sys.exit(1)
        raise

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nВыход.")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
