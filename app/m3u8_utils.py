from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Callable, Optional
from urllib.parse import urljoin


@dataclass(frozen=True)
class M3u8Key:
    method: str
    uri: str
    iv: Optional[str] = None


@dataclass
class M3u8Segment:
    duration: float
    uri: str
    discontinuity_group: int
    key: Optional[M3u8Key] = None
    map_uri: Optional[str] = None


@dataclass
class M3u8MediaPlaylist:
    segments: list[M3u8Segment]
    target_duration: float
    is_vod: bool


def detect_m3u8_type(content: str) -> str:
    return "master" if "#EXT-X-STREAM-INF" in content else "media"


def _parse_key(line: str, base_url: str) -> Optional[M3u8Key]:
    attrs = line[len("#EXT-X-KEY:") :]
    m_method = re.search(r"METHOD=([^,\s]+)", attrs)
    method = m_method.group(1) if m_method else "NONE"
    if method == "NONE":
        return None
    m_uri = re.search(r'URI="([^"]+)"', attrs)
    uri = urljoin(base_url, m_uri.group(1)) if m_uri else ""
    m_iv = re.search(r"IV=(0x[0-9a-fA-F]+)", attrs)
    iv = m_iv.group(1) if m_iv else None
    return M3u8Key(method=method, uri=uri, iv=iv)


def _parse_map_uri(line: str, base_url: str) -> Optional[str]:
    m_uri = re.search(r'URI="([^"]+)"', line)
    return urljoin(base_url, m_uri.group(1)) if m_uri else None


def parse_media_playlist(content: str, base_url: str) -> M3u8MediaPlaylist:
    lines = [ln.strip() for ln in content.splitlines()]
    segments: list[M3u8Segment] = []
    target_duration = 0.0
    has_endlist = False
    is_explicit_vod = False
    is_live_event = False
    current_group = 0
    current_key: Optional[M3u8Key] = None
    current_map: Optional[str] = None
    current_duration = 0.0

    for line in lines:
        if not line:
            continue
        if line.startswith("#EXT-X-TARGETDURATION:"):
            try:
                target_duration = float(line.split(":", 1)[1].strip())
            except ValueError:
                pass
        elif line == "#EXT-X-ENDLIST":
            has_endlist = True
        elif line == "#EXT-X-PLAYLIST-TYPE:VOD":
            is_explicit_vod = True
        elif line == "#EXT-X-PLAYLIST-TYPE:EVENT":
            is_live_event = True
        elif line == "#EXT-X-DISCONTINUITY":
            current_group += 1
        elif line.startswith("#EXT-X-KEY:"):
            current_key = _parse_key(line, base_url)
        elif line.startswith("#EXT-X-MAP:"):
            current_map = _parse_map_uri(line, base_url)
        elif line.startswith("#EXTINF:"):
            raw_dur = line[len("#EXTINF:") :].split(",", 1)[0].strip()
            try:
                current_duration = float(raw_dur)
            except ValueError:
                current_duration = 0.0
        elif not line.startswith("#"):
            seg_uri = urljoin(base_url, line)
            segments.append(
                M3u8Segment(
                    duration=current_duration,
                    uri=seg_uri,
                    discontinuity_group=current_group,
                    key=current_key,
                    map_uri=current_map,
                )
            )
            current_duration = 0.0

    is_vod = has_endlist or is_explicit_vod or (not is_live_event and bool(segments))
    return M3u8MediaPlaylist(segments=segments, target_duration=target_duration, is_vod=is_vod)


def filter_ad_segments(segments: list[M3u8Segment]) -> tuple[list[M3u8Segment], int]:
    """Exact port of Predidit/Kazumi M3u8AdFilter.filterAds."""
    if not segments:
        return segments, 0

    groups: dict[int, list[M3u8Segment]] = {}
    for seg in segments:
        groups.setdefault(seg.discontinuity_group, []).append(seg)

    if len(groups) <= 1:
        return segments, 0

    group_durations = {gid: sum(s.duration for s in segs) for gid, segs in groups.items()}
    max_duration = max(group_durations.values()) if group_durations else 0.0
    sorted_keys = sorted(groups.keys())
    ad_groups: set[int] = set()

    for gid in sorted_keys:
        dur = group_durations[gid]
        if dur == max_duration:
            continue
        is_ad = False
        if dur < max_duration * 0.3:
            is_ad = True
        if gid in (sorted_keys[0], sorted_keys[-1]) and dur < 30.0:
            is_ad = True
        if dur < 10.0:
            is_ad = True
        if is_ad:
            ad_groups.add(gid)

    if not ad_groups:
        return segments, 0

    filtered = [s for s in segments if s.discontinuity_group not in ad_groups]
    return filtered, len(segments) - len(filtered)


def rewrite_m3u8_passthrough(content: str, base_url: str, sub_uri_builder: Callable[[str], str]) -> str:
    """Rewrites every resource URI (playlists, segments, EXT-X-KEY, EXT-X-MAP) via proxy."""
    out_lines: list[str] = []

    def _wrap(uri: str) -> str:
        trimmed = uri.strip()
        if not trimmed:
            return uri
        return sub_uri_builder(urljoin(base_url, trimmed))

    def _replace_uri_attr(match: re.Match[str]) -> str:
        return f'URI="{_wrap(match.group(1))}"'

    for line in content.splitlines():
        if not line.strip():
            out_lines.append("")
            continue
        if line.startswith("#"):
            out_lines.append(re.sub(r'URI="([^"]+)"', _replace_uri_attr, line))
        else:
            out_lines.append(_wrap(line))
    return "\n".join(out_lines) + "\n"


def build_filtered_media_playlist(
    content: str,
    base_url: str,
    sub_uri_builder: Callable[[str], str],
    enable_ad_filter: bool = True,
) -> tuple[str, int]:
    """Parses media playlist, optionally filters discontinuity ad groups, and rewrites URIs."""
    try:
        playlist = parse_media_playlist(content, base_url)
        if not playlist.segments:
            return rewrite_m3u8_passthrough(content, base_url, sub_uri_builder), 0

        if enable_ad_filter:
            segments, removed = filter_ad_segments(playlist.segments)
        else:
            segments, removed = playlist.segments, 0

        max_seg_dur = max((s.duration for s in segments), default=10.0)
        target_dur = playlist.target_duration if playlist.target_duration > 0 else max_seg_dur

        lines = [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            f"#EXT-X-TARGETDURATION:{max(1, math.ceil(target_dur))}",
            "#EXT-X-MEDIA-SEQUENCE:0",
        ]
        if playlist.is_vod:
            lines.append("#EXT-X-PLAYLIST-TYPE:VOD")

        last_group = segments[0].discontinuity_group if segments else 0
        last_key: Optional[M3u8Key] = None
        last_map: Optional[str] = None
        first_seg = True

        for idx, seg in enumerate(segments):
            if idx > 0 and seg.discontinuity_group != last_group:
                lines.append("#EXT-X-DISCONTINUITY")
                last_group = seg.discontinuity_group

            if first_seg or seg.key != last_key:
                if seg.key is None:
                    if last_key is not None:
                        lines.append("#EXT-X-KEY:METHOD=NONE")
                else:
                    proxied_key = sub_uri_builder(seg.key.uri)
                    key_line = f'#EXT-X-KEY:METHOD={seg.key.method},URI="{proxied_key}"'
                    if seg.key.iv:
                        key_line += f",IV={seg.key.iv}"
                    lines.append(key_line)
                last_key = seg.key

            if seg.map_uri and seg.map_uri != last_map:
                lines.append(f'#EXT-X-MAP:URI="{sub_uri_builder(seg.map_uri)}"')
                last_map = seg.map_uri

            first_seg = False
            lines.append(f"#EXTINF:{seg.duration:.6f},")
            lines.append(sub_uri_builder(seg.uri))

        if playlist.is_vod:
            lines.append("#EXT-X-ENDLIST")

        return "\n".join(lines) + "\n", removed
    except Exception:
        return rewrite_m3u8_passthrough(content, base_url, sub_uri_builder), 0
