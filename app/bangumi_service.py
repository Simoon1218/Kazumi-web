from __future__ import annotations

import asyncio
import json
import random
import time
from collections import OrderedDict
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlencode, urlparse, urlunparse

import httpx

from app.config import BANGUMI_USER_AGENT, logger
from app.storage import RuntimeStore

MIRROR_DOMAIN = "https://api.kazumi.fyi"
V0_BASE = "https://api.bgm.tv"
NEXT_BASE = "https://next.bgm.tv"

COLLECT_TO_BGM = {
    1: 3,  # 在看 -> doing
    2: 1,  # 想看 -> wish
    3: 4,  # 搁置 -> on_hold
    4: 2,  # 看过 -> collect
    5: 5,  # 抛弃 -> dropped
}
BGM_TO_COLLECT = {v: k for k, v in COLLECT_TO_BGM.items()}


class BangumiService:
    """Bangumi public & authenticated API client mirroring Predidit/Kazumi & KazumiWeb."""

    CACHE_LIMIT = 150
    CACHE_TTL_SECONDS = 300

    def __init__(self, store: RuntimeStore) -> None:
        self.store = store
        self._cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    @property
    def use_mirror(self) -> bool:
        return bool(self.store.get_settings().get("enableBangumiProxy"))

    def _client(self) -> httpx.AsyncClient:
        proxy = self.store.get_proxy_url()
        return httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=10.0),
            follow_redirects=True,
            proxy=proxy,
            headers={
                "User-Agent": BANGUMI_USER_AGENT,
                "Accept": "application/json",
            },
        )

    def _mirrorize(self, url: str) -> str:
        parsed = urlparse(url)
        if parsed.netloc in {"api.bgm.tv", "next.bgm.tv"}:
            mirror_host = urlparse(MIRROR_DOMAIN).netloc
            return urlunparse(parsed._replace(netloc=mirror_host))
        return url

    async def _raw_request(
        self,
        method: str,
        url: str,
        body: Optional[dict[str, Any]] = None,
        token: Optional[str] = None,
    ) -> Any:
        headers: dict[str, str] = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        last_exc: Optional[Exception] = None
        async with self._client() as client:
            for attempt in range(3):
                if attempt > 0:
                    await asyncio.sleep(0.4 * attempt)
                try:
                    resp = await client.request(
                        method,
                        url,
                        json=body if body is not None else None,
                        headers=headers or None,
                    )
                    if resp.status_code < 200 or resp.status_code >= 300:
                        raise httpx.HTTPStatusError(
                            f"HTTP {resp.status_code}",
                            request=resp.request,
                            response=resp,
                        )
                    if not resp.content:
                        return {}
                    return resp.json()
                except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError, httpx.ConnectTimeout) as exc:
                    last_exc = exc
                    logger.warning("BangumiService transient error (%d/3) for %s: %s", attempt + 1, url, exc)
                except Exception:
                    raise
        assert last_exc is not None
        raise last_exc

    async def _request_json(
        self,
        method: str,
        url: str,
        body: Optional[dict[str, Any]] = None,
        use_cache: bool = True,
        token: Optional[str] = None,
    ) -> Any:
        cache_key = f"{method} {url} {json.dumps(body, sort_keys=True) if body is not None else ''}"
        hit = self._cache.get(cache_key) if (use_cache and not token) else None
        if hit and (time.monotonic() - hit[0]) < self.CACHE_TTL_SECONDS:
            return hit[1]

        async def _uncached() -> Any:
            if self.use_mirror and not token:
                mirrored = self._mirrorize(url)
                if mirrored != url:
                    try:
                        return await self._raw_request(method, mirrored, body=body)
                    except Exception as exc:
                        logger.warning("Bangumi mirror failed (%s), falling back to official: %s", mirrored, exc)
            return await self._raw_request(method, url, body=body, token=token)

        try:
            result = await _uncached()
            if use_cache and not token:
                self._cache.pop(cache_key, None)
                self._cache[cache_key] = (time.monotonic(), result)
                while len(self._cache) > self.CACHE_LIMIT:
                    self._cache.popitem(last=False)
            return result
        except Exception:
            if hit:
                logger.warning("BangumiService serving stale cache for %s", url)
                return hit[1]
            raise

    # ---------- Public Endpoints ----------

    async def popular(self, tag: str = "", offset: int = 0, limit: int = 24) -> dict[str, Any]:
        if self.use_mirror:
            params: dict[str, Any] = {"limit": limit, "offset": offset}
            if tag:
                params["tag"] = tag
            try:
                data = await self._request_json(
                    "GET",
                    f"{MIRROR_DOMAIN}/kazumi/v1/popular/subjects?{urlencode(params)}",
                )
                raw_list = data if isinstance(data, list) else (data.get("data") or [])
                return {"items": self._map_items(raw_list)}
            except Exception as exc:
                logger.warning("Mirror popular failed, falling back to official: %s", exc)

        if not tag:
            data = await self._request_json(
                "GET",
                f"{NEXT_BASE}/p1/trending/subjects?type=2&limit={limit}&offset={offset}",
            )
            subjects = [
                e.get("subject")
                for e in (data.get("data") or [])
                if isinstance(e, dict) and isinstance(e.get("subject"), dict)
            ]
            return {"items": self._map_items(subjects)}

        rank = random.randint(1, 5000)
        body = {
            "keyword": "",
            "sort": "rank",
            "filter": {
                "type": [2],
                "tag": [tag],
                "rank": [f">{rank}", "<=99999"],
                "nsfw": False,
            },
        }
        data = await self._request_json(
            "POST",
            f"{V0_BASE}/v0/search/subjects?limit={limit}&offset=0",
            body=body,
            use_cache=False,
        )
        items = self._map_items(data.get("data") or [])
        if not items and rank > 1:
            body["filter"]["rank"] = [">0", "<=99999"]
            data = await self._request_json(
                "POST",
                f"{V0_BASE}/v0/search/subjects?limit={limit}&offset=0",
                body=body,
                use_cache=False,
            )
            items = self._map_items(data.get("data") or [])
        return {"items": items}

    async def timeline(self, season: str = "") -> dict[str, Any]:
        if not season:
            data = await self._request_json("GET", f"{NEXT_BASE}/p1/calendar")
            days: list[list[dict[str, Any]]] = []
            for i in range(1, 8):
                raw_day = data.get(str(i)) or []
                subjects = [
                    e.get("subject")
                    for e in raw_day
                    if isinstance(e, dict) and isinstance(e.get("subject"), dict)
                ]
                days.append(self._map_items(subjects))
            return {"days": days}

        parts = season.split("-")
        year = int(parts[0])
        quarter = int(parts[1])
        season_idx = quarter - 1
        start_month = season_idx * 3
        start_year = year
        if start_month == 0:
            start_month = 12
            start_year -= 1
        start_str = f"{start_year:04d}-{start_month:02d}-01"
        end_month = (season_idx + 1) * 3
        end_str = f"{year:04d}-{end_month:02d}-01"

        if self.use_mirror:
            try:
                q = urlencode({"start": f"{start_str} 00:00:00.000", "end": f"{end_str} 00:00:00.000"})
                data = await self._request_json("GET", f"{MIRROR_DOMAIN}/kazumi/v1/calendar/season?{q}")
                days = []
                for i in range(1, 8):
                    raw_day = data.get(str(i)) or []
                    subjects = [
                        e.get("subject")
                        for e in raw_day
                        if isinstance(e, dict) and isinstance(e.get("subject"), dict)
                    ]
                    days.append(self._map_items(subjects))
                return {"season": season, "days": days}
            except Exception as exc:
                logger.warning("Mirror season calendar failed, falling back to official: %s", exc)

        days = [[] for _ in range(7)]
        for round_idx in range(4):
            body = {
                "keyword": "",
                "sort": "rank",
                "filter": {
                    "type": [2],
                    "tag": ["日本"],
                    "air_date": [f">={start_str}", f"<{end_str}"],
                    "rank": [">0", "<=99999"],
                    "nsfw": True,
                },
            }
            data = await self._request_json(
                "POST",
                f"{V0_BASE}/v0/search/subjects?limit=20&offset={round_idx * 20}",
                body=body,
            )
            raw_list = data.get("data") or []
            for raw in raw_list:
                if not isinstance(raw, dict):
                    continue
                item = self._map_item(raw)
                wd = item.get("airWeekday", 0)
                if 1 <= wd <= 7:
                    days[wd - 1].append(item)
            if len(raw_list) < 20:
                break
        return {"season": season, "days": days}

    async def search(
        self,
        keyword: str = "",
        offset: int = 0,
        limit: int = 20,
        sort: str = "heat",
        tags: Optional[list[str]] = None,
        air_date: Optional[tuple[str, str]] = None,
        rank_range: Optional[tuple[Optional[int], Optional[int]]] = None,
        score_range: Optional[tuple[Optional[float], Optional[float]]] = None,
        weekdays: Optional[list[int]] = None,
    ) -> dict[str, Any]:
        tags = tags or []
        if rank_range and (rank_range[0] is not None or rank_range[1] is not None):
            rank_filter = []
            if rank_range[0] is not None:
                rank_filter.append(f">={rank_range[0]}")
            if rank_range[1] is not None:
                rank_filter.append(f"<={rank_range[1]}")
        else:
            rank_filter = [">0", "<=99999"] if sort == "rank" else [">=0", "<=99999"]

        flt: dict[str, Any] = {
            "type": [2],
            "tag": tags,
            "rank": rank_filter,
            "nsfw": False,
        }
        if air_date:
            flt["air_date"] = [f">={air_date[0]}", f"<{air_date[1]}"]
        if score_range and (score_range[0] is not None or score_range[1] is not None):
            rating_filter = []
            if score_range[0] is not None:
                rating_filter.append(f">={score_range[0]:.1f}")
            if score_range[1] is not None:
                rating_filter.append(f"<={score_range[1]:.1f}")
            flt["rating"] = rating_filter
        if weekdays:
            flt["air_weekday"] = sorted({w for w in weekdays if 1 <= w <= 7})

        body = {"keyword": keyword, "sort": sort, "filter": flt}
        data = await self._request_json(
            "POST",
            f"{V0_BASE}/v0/search/subjects?limit={limit}&offset={offset}",
            body=body,
        )
        raw = data.get("data") or []
        return {"items": self._map_items(raw), "rawCount": len(raw)}

    async def detail(self, subject_id: int) -> dict[str, Any]:
        try:
            data = await self._request_json("GET", f"{NEXT_BASE}/p1/subjects/{subject_id}")
            return self._map_item(data)
        except Exception:
            data = await self._request_json("GET", f"{V0_BASE}/v0/subjects/{subject_id}")
            return self._map_item(data)

    async def characters(self, subject_id: int) -> dict[str, Any]:
        data = await self._request_json("GET", f"{V0_BASE}/v0/subjects/{subject_id}/characters")
        rel_order = {"主角": 1, "配角": 2, "客串": 3}
        mapped = []
        for c in (data if isinstance(data, list) else []):
            if not isinstance(c, dict):
                continue
            images = c.get("images") or {}
            actors = []
            for a in (c.get("actors") or []):
                if not isinstance(a, dict):
                    continue
                a_img = a.get("images") or {}
                actors.append(
                    {
                        "id": a.get("id"),
                        "name": a.get("name") or "",
                        "image": a_img.get("medium") or "",
                    }
                )
            mapped.append(
                {
                    "id": c.get("id"),
                    "name": c.get("name") or "",
                    "relation": c.get("relation") or "",
                    "image": images.get("large") or images.get("medium") or "",
                    "actors": actors,
                }
            )
        mapped.sort(key=lambda x: rel_order.get(x["relation"], 4))
        return {"characters": mapped}

    async def relations(self, subject_id: int) -> dict[str, Any]:
        data = await self._request_json("GET", f"{V0_BASE}/v0/subjects/{subject_id}/subjects")
        items = []
        for r in (data if isinstance(data, list) else []):
            if not isinstance(r, dict) or r.get("type") != 2:
                continue
            rel = str(r.get("relation") or "").strip() or "关联"
            items.append({"relation": rel, "bangumi": self._map_item(r)})
        return {"items": items}

    async def character(self, character_id: int) -> dict[str, Any]:
        data = await self._request_json("GET", f"{V0_BASE}/v0/characters/{character_id}")
        images = data.get("images") or {}
        infobox = []
        for f in (data.get("infobox") or []):
            if not isinstance(f, dict):
                continue
            val = f.get("value")
            if isinstance(val, list):
                text = " / ".join(str(e.get("v") or "") for e in val if isinstance(e, dict) and e.get("v"))
            else:
                text = str(val or "")
            if text:
                infobox.append({"key": str(f.get("key") or ""), "value": text})
        return {
            "id": data.get("id"),
            "name": data.get("name") or "",
            "summary": data.get("summary") or "",
            "image": images.get("large") or images.get("medium") or "",
            "infobox": infobox,
        }

    async def comments(self, subject_id: int, offset: int = 0) -> dict[str, Any]:
        data = await self._request_json(
            "GET",
            f"{NEXT_BASE}/p1/subjects/{subject_id}/comments?limit=20&offset={offset}",
        )
        items = []
        for c in (data.get("data") or []):
            if not isinstance(c, dict):
                continue
            user = c.get("user") or {}
            avatar = user.get("avatar") or {}
            items.append(
                {
                    "user": {
                        "username": user.get("username") or "",
                        "nickname": user.get("nickname") or "",
                        "avatar": avatar.get("medium") or "",
                    },
                    "rate": c.get("rate") or 0,
                    "comment": c.get("comment") or "",
                    "updatedAt": c.get("updatedAt") or 0,
                }
            )
        return {"total": data.get("total", len(items)), "items": items}

    async def staff(self, subject_id: int) -> dict[str, Any]:
        try:
            data = await self._request_json("GET", f"{NEXT_BASE}/p1/subjects/{subject_id}/staffs/persons")
            raw_list = data.get("data") or []
            items = []
            for s in raw_list:
                if not isinstance(s, dict):
                    continue
                st = s.get("staff") if isinstance(s.get("staff"), dict) else s
                images = st.get("images") or {}
                positions = []
                for p in (s.get("positions") or []):
                    if not isinstance(p, dict):
                        continue
                    ptype = p.get("type") or {}
                    label = ptype.get("cn") or ptype.get("en") or ""
                    positions.append({"type": label, "summary": p.get("summary") or ""})
                items.append(
                    {
                        "id": st.get("id"),
                        "name": st.get("name") or "",
                        "nameCN": st.get("nameCN") or "",
                        "image": images.get("medium") or images.get("large") or "",
                        "positions": positions,
                    }
                )
            return {"total": data.get("total", len(items)), "items": items}
        except Exception:
            data = await self._request_json("GET", f"{V0_BASE}/v0/subjects/{subject_id}/persons")
            items = []
            for s in (data if isinstance(data, list) else []):
                if not isinstance(s, dict):
                    continue
                images = s.get("images") or {}
                items.append(
                    {
                        "id": s.get("id"),
                        "name": s.get("name") or "",
                        "nameCN": "",
                        "image": images.get("medium") or images.get("large") or "",
                        "positions": [{"type": s.get("relation") or "", "summary": ""}],
                    }
                )
            return {"total": len(items), "items": items}

    async def episodes(self, subject_id: int) -> dict[str, Any]:
        items: list[dict[str, Any]] = []
        offset = 0
        total: Optional[int] = None
        while True:
            data = await self._request_json(
                "GET",
                f"{V0_BASE}/v0/episodes?subject_id={subject_id}&offset={offset}&limit=100",
            )
            if total is None and isinstance(data.get("total"), int):
                total = data["total"]
            page = data.get("data") or []
            if not page:
                break
            for raw in page:
                if isinstance(raw, dict):
                    items.append(self._map_episode(raw))
            offset += len(page)
            if total is not None and offset >= total:
                break
        return {"items": items}

    async def episode_comments(self, subject_id: int, episode: int) -> dict[str, Any]:
        ep_data = await self._request_json(
            "GET",
            f"{V0_BASE}/v0/episodes?subject_id={subject_id}&offset={max(0, episode - 1)}&limit=1",
        )
        page = ep_data.get("data") or []
        if not page or not isinstance(page[0], dict):
            return {"episode": None, "items": []}
        ep_info = self._map_episode(page[0])
        ep_id = ep_info["id"]
        data = await self._request_json("GET", f"{NEXT_BASE}/p1/episodes/{ep_id}/comments")
        items = []
        for c in (data if isinstance(data, list) else []):
            if not isinstance(c, dict):
                continue
            user = c.get("user") or {}
            avatar = user.get("avatar") or {}
            replies = []
            for r in (c.get("replies") or []):
                if not isinstance(r, dict):
                    continue
                ru = r.get("user") or {}
                ra = ru.get("avatar") or {}
                replies.append(
                    {
                        "user": {
                            "username": ru.get("username") or "",
                            "nickname": ru.get("nickname") or "",
                            "avatar": ra.get("medium") or "",
                        },
                        "content": r.get("content") or "",
                        "createdAt": r.get("createdAt") or 0,
                    }
                )
            items.append(
                {
                    "user": {
                        "username": user.get("username") or "",
                        "nickname": user.get("nickname") or "",
                        "avatar": avatar.get("medium") or "",
                    },
                    "content": c.get("content") or "",
                    "createdAt": c.get("createdAt") or 0,
                    "replies": replies,
                }
            )
        return {"episode": ep_info, "items": items}

    # ---------- Authenticated Bangumi Account Sync ----------

    async def get_me(self, token: str) -> dict[str, Any]:
        return await self._request_json("GET", f"{V0_BASE}/v0/me", use_cache=False, token=token)

    async def pull_user_collections(self, token: str, username: str) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        offset = 0
        limit = 50
        while True:
            data = await self._request_json(
                "GET",
                f"{V0_BASE}/v0/users/{username}/collections?subject_type=2&limit={limit}&offset={offset}",
                use_cache=False,
                token=token,
            )
            page = data.get("data") or []
            total = data.get("total", 0)
            for item in page:
                if not isinstance(item, dict):
                    continue
                bgm_type = item.get("type")
                local_type = BGM_TO_COLLECT.get(bgm_type, 0)
                if not local_type:
                    continue
                subj = item.get("subject") or {}
                sid = item.get("subject_id") or subj.get("id")
                if not sid:
                    continue
                mapped_subject = self._map_item(subj) if subj else {"id": sid, "name": "", "nameCn": ""}
                updated = item.get("updated_at") or ""
                try:
                    ts_ms = int(datetime.fromisoformat(updated.replace("Z", "+00:00")).timestamp() * 1000)
                except Exception:
                    ts_ms = int(time.time() * 1000)
                results.append(
                    {
                        "bangumiId": int(sid),
                        "type": local_type,
                        "time": ts_ms,
                        "bangumi": mapped_subject,
                    }
                )
            offset += len(page)
            if not page or offset >= total:
                break
            await asyncio.sleep(0.2)
        return results

    async def push_collection(
        self,
        token: str,
        subject_id: int,
        local_type: int,
        rate: Optional[int] = None,
        comment: Optional[str] = None,
    ) -> bool:
        bgm_type = COLLECT_TO_BGM.get(local_type)
        if not bgm_type:
            return False
        payload: dict[str, Any] = {"type": bgm_type}
        if rate is not None and 0 <= rate <= 10:
            payload["rate"] = rate
        if comment is not None:
            payload["comment"] = comment
        await self._request_json(
            "POST",
            f"{V0_BASE}/v0/users/-/collections/{subject_id}",
            body=payload,
            use_cache=False,
            token=token,
        )
        return True

    # ---------- Mapping helpers ----------

    def _map_items(self, raw_list: list[Any]) -> list[dict[str, Any]]:
        return [self._map_item(r) for r in raw_list if isinstance(r, dict)]

    def _map_item(self, raw: dict[str, Any]) -> dict[str, Any]:
        rating = raw.get("rating") if isinstance(raw.get("rating"), dict) else {}
        images = raw.get("images") if isinstance(raw.get("images"), dict) else {
            "large": raw.get("image") or "",
            "common": "",
            "medium": "",
            "small": "",
            "grid": "",
        }
        air_date = self._resolve_air_date(raw)
        score = float(rating.get("score") or 0.0)
        return {
            "id": raw.get("id"),
            "type": raw.get("type", 2),
            "name": raw.get("name") or "",
            "nameCn": self._resolve_name_cn(raw),
            "summary": raw.get("summary") or "",
            "airDate": air_date,
            "airWeekday": self._weekday_of(air_date),
            "rank": rating.get("rank") or 0,
            "ratingScore": round(score, 1),
            "votes": rating.get("total") or 0,
            "votesCount": self._resolve_votes_count(rating),
            "images": images,
            "info": raw.get("info") or "",
            "tags": [
                {"name": t.get("name") or "", "count": t.get("count") or 0}
                for t in (raw.get("tags") or [])
                if isinstance(t, dict)
            ],
            "alias": self._resolve_aliases(raw),
        }

    @staticmethod
    def _map_episode(raw: dict[str, Any]) -> dict[str, Any]:
        ep_type = int(raw.get("type") or 0)
        type_names = {0: "ep", 1: "sp", 2: "op", 3: "ed"}
        return {
            "id": raw.get("id") or 0,
            "episode": raw.get("sort") or 0,
            "type": ep_type,
            "name": raw.get("name") or "",
            "nameCn": raw.get("name_cn") or raw.get("nameCN") or "",
            "readType": type_names.get(ep_type, ""),
        }

    @staticmethod
    def _resolve_name_cn(raw: dict[str, Any]) -> str:
        return str(raw.get("name_cn") or raw.get("nameCN") or raw.get("name") or "")

    @staticmethod
    def _resolve_air_date(raw: dict[str, Any]) -> str:
        top = str(raw.get("date") or "").strip()
        if top:
            return top
        airtime = raw.get("airtime")
        if isinstance(airtime, dict):
            nested = str(airtime.get("date") or "").strip()
            if nested:
                return nested
        return ""

    @staticmethod
    def _weekday_of(air_date: str) -> int:
        if not air_date:
            return 0
        try:
            return datetime.strptime(air_date[:10], "%Y-%m-%d").isoweekday()
        except Exception:
            return 0

    @staticmethod
    def _resolve_votes_count(rating: dict[str, Any]) -> list[int]:
        count = rating.get("count")
        if isinstance(count, dict):
            return [int(count.get(str(i), 0) or 0) for i in range(1, 11)]
        if isinstance(count, list):
            return [int(x or 0) for x in count]
        return []

    @staticmethod
    def _resolve_aliases(raw: dict[str, Any]) -> list[str]:
        infobox = raw.get("infobox")
        if not isinstance(infobox, list):
            return []
        for entry in infobox:
            if not isinstance(entry, dict) or entry.get("key") != "别名":
                continue
            val = entry.get("value")
            if isinstance(val, str) and val.strip():
                return [val.strip()]
            if isinstance(val, list):
                return [
                    str(v.get("v") or "").strip()
                    for v in val
                    if isinstance(v, dict) and str(v.get("v") or "").strip()
                ]
        return []
