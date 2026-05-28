import mimetypes
from pathlib import Path

from backend.config import AppConfig


def match_clips_dir(config: AppConfig, match_id: int) -> Path:
    return config.clips_directory / str(match_id)


def list_clips(config: AppConfig, match_id: int) -> list[dict]:
    folder = match_clips_dir(config, match_id)
    if not folder.is_dir():
        return []
    clips = []
    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in config.clip_extensions:
            continue
        clips.append({
            "filename": path.name,
            "url": f"/api/clips/{match_id}/{path.name}",
            "size_bytes": path.stat().st_size,
        })
    return clips


def resolve_clip_path(
    config: AppConfig, match_id: int, filename: str
) -> Path | None:
    folder = match_clips_dir(config, match_id).resolve()
    candidate = (folder / filename).resolve()
    if not str(candidate).startswith(str(folder)):
        return None
    if not candidate.is_file():
        return None
    if candidate.suffix.lower() not in config.clip_extensions:
        return None
    return candidate


def clip_media_type(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"
