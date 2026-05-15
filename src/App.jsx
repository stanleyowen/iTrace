import { useEffect, useMemo, useState } from 'react'
import './App.css'

function parseJsonText(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} is not valid JSON.`)
  }
}

function extractUsernameFromHref(href) {
  if (typeof href !== 'string') return null
  const match = href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i)
  return match?.[1] ?? null
}

function fromRelationshipArray(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return item.trim()
      if (typeof item?.title === 'string' && item.title.trim()) {
        return item.title.trim()
      }
      const value = item?.string_list_data?.[0]?.value
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof item?.username === 'string' && item.username.trim()) {
        return item.username.trim()
      }
      return extractUsernameFromHref(item?.string_list_data?.[0]?.href)
    })
    .filter(Boolean)
}

function extractUsernames(payload) {
  if (Array.isArray(payload)) {
    return fromRelationshipArray(payload)
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.relationships_following)) {
      return fromRelationshipArray(payload.relationships_following)
    }
    if (Array.isArray(payload.relationships_followers)) {
      return fromRelationshipArray(payload.relationships_followers)
    }
    if (Array.isArray(payload.followers_1)) {
      return fromRelationshipArray(payload.followers_1)
    }
    if (Array.isArray(payload.users)) {
      return fromRelationshipArray(payload.users)
    }
  }

  throw new Error('Unsupported format. Use Instagram followers/following JSON.')
}

function normalizeUnique(usernames) {
  return [...new Set(usernames.map((name) => name.toLowerCase().trim()))]
}

function buildResult(following, followers, platform, account) {
  const followersSet = new Set(followers)
  const notFollowingBack = following
    .filter((username) => !followersSet.has(username))
    .sort((a, b) => a.localeCompare(b))

  return {
    platform,
    account,
    totalFollowing: following.length,
    totalFollowers: followers.length,
    notFollowingBack,
  }
}

function profileUrl(username) {
  return `https://www.instagram.com/${username}/`
}

function App() {
  const [mode, setMode] = useState('online')
  const [followingFile, setFollowingFile] = useState(null)
  const [followersFile, setFollowersFile] = useState(null)
  const [onlineDelayMs, setOnlineDelayMs] = useState('600')
  const [onlinePauseAfterFiveMs, setOnlinePauseAfterFiveMs] = useState('3000')
  const [onlineJitterMs, setOnlineJitterMs] = useState('400')
  const [unfollowDelayMs, setUnfollowDelayMs] = useState('3000')
  const [unfollowPauseAfterFiveMs, setUnfollowPauseAfterFiveMs] = useState('15000')
  const [unfollowJitterMs, setUnfollowJitterMs] = useState('1500')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [copiedScript, setCopiedScript] = useState(false)
  const [visitedUsernames, setVisitedUsernames] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = JSON.parse(
        window.localStorage.getItem('ig-tracker-visited-usernames') ?? '[]',
      )
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  })

  const visitedSet = useMemo(() => new Set(visitedUsernames), [visitedUsernames])

  useEffect(() => {
    window.localStorage.setItem(
      'ig-tracker-visited-usernames',
      JSON.stringify(visitedUsernames),
    )
  }, [visitedUsernames])

  useEffect(() => {
    if (!copiedScript) return
    const timer = window.setTimeout(() => setCopiedScript(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedScript])

  const filteredUsers = useMemo(() => {
    if (!result) return []
    const keyword = query.trim().toLowerCase()
    if (!keyword) return result.notFollowingBack
    return result.notFollowingBack.filter((username) =>
      username.toLowerCase().includes(keyword),
    )
  }, [query, result])

  const onlineScript = useMemo(() => {
    const rawDelay = Number(onlineDelayMs)
    const safeDelay = Number.isFinite(rawDelay) ? Math.max(500, Math.floor(rawDelay)) : 600
    const rawPause = Number(onlinePauseAfterFiveMs)
    const safePause = Number.isFinite(rawPause) ? Math.max(0, Math.floor(rawPause)) : 3000
    const rawUnfollowDelay = Number(unfollowDelayMs)
    const safeUnfollowDelay = Number.isFinite(rawUnfollowDelay)
      ? Math.max(1000, Math.floor(rawUnfollowDelay))
      : 4000
    const rawUnfollowPause = Number(unfollowPauseAfterFiveMs)
    const safeUnfollowPause = Number.isFinite(rawUnfollowPause)
      ? Math.max(0, Math.floor(rawUnfollowPause))
      : 30000
    const rawSearchJitter = Number(onlineJitterMs)
    const safeSearchJitter = Number.isFinite(rawSearchJitter) ? Math.max(0, Math.floor(rawSearchJitter)) : 400
    const rawUnfollowJitter = Number(unfollowJitterMs)
    const safeUnfollowJitter = Number.isFinite(rawUnfollowJitter) ? Math.max(0, Math.floor(rawUnfollowJitter)) : 1500

    return `(async () => {
  const searchCycleDelayMs = ${safeDelay};
  const searchPauseAfterFiveMs = ${safePause};
  const searchJitterMs = ${safeSearchJitter};
  const unfollowDelayMs = ${safeUnfollowDelay};
  const unfollowPauseAfterFiveMs = ${safeUnfollowPause};
  const unfollowJitterMs = ${safeUnfollowJitter};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const jitter = (max) => max > 0 ? Math.floor(Math.random() * max) : 0;
  const appId = "936619743392459";
  const headers = { "x-ig-app-id": appId };
  const pageCount = 25;
  const styleId = "__itrace_insta_style__";
  const panelId = "__itrace_insta_panel__";

  const normalize = (list) =>
    [...new Set((list || []).map((v) => String(v || "").toLowerCase().trim()).filter(Boolean))];

  function ensureUiStyles() {
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) existingStyle.remove();

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      "#" + panelId + "{position:fixed;top:24px;right:24px;width:360px;z-index:2147483647;color:#e2e8f0;",
      "font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border-radius:20px;",
      "background:linear-gradient(160deg,rgba(15,23,42,.95),rgba(17,24,39,.88));backdrop-filter:blur(12px);",
      "border:1px solid rgba(148,163,184,.28);box-shadow:0 20px 56px rgba(2,6,23,.52);overflow:hidden}",
      "#" + panelId + " .it-head{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px;",
      "background:linear-gradient(145deg,rgba(129,140,248,.2),rgba(168,85,247,.14))}",
      "#" + panelId + " .it-title{font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}",
      "#" + panelId + " .it-close{border:0;background:transparent;color:#cbd5e1;font-size:16px;cursor:pointer}",
      "#" + panelId + " .it-loading{padding:12px 14px 14px}",
      "#" + panelId + " .it-loading.hidden{display:none}",
      "#" + panelId + " .it-body{padding:12px 14px 14px}",
      "#" + panelId + " .it-body.hidden{display:none}",
      "#" + panelId + " .it-stats{display:none}",
      "#" + panelId + " .it-stat{padding:8px;border-radius:10px;background:rgba(30,41,59,.5);border:1px solid rgba(148,163,184,.2)}",
      "#" + panelId + " .it-stat b{display:block;font-size:13px;color:#f8fafc}",
      "#" + panelId + " .it-stat span{font-size:10px;color:#94a3b8}",
      "#" + panelId + " .it-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:10px}",
      "#" + panelId + " .it-tab{border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.5);color:#cbd5e1;",
      "border-radius:9px;padding:7px 6px;font-size:11px;cursor:pointer}",
      "#" + panelId + " .it-tab.active{border-color:rgba(216,180,254,.6);background:linear-gradient(135deg,#c084fc,#a855f7);color:#fff}",
      "#" + panelId + " .it-search{width:100%;padding:9px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.34);",
      "background:rgba(15,23,42,.54);color:#e2e8f0;margin-bottom:8px;font-size:12px}",
      "#" + panelId + " .it-actions{display:flex;gap:8px;margin-bottom:8px}",
      "#" + panelId + " .it-action-btn{flex:1;border:1px solid rgba(148,163,184,.32);background:rgba(15,23,42,.56);color:#e2e8f0;border-radius:9px;padding:7px 8px;font-size:11px;cursor:pointer}",
      "#" + panelId + " .it-action-btn.warn{border-color:rgba(252,165,165,.45);background:rgba(127,29,29,.34);color:#fecaca}",
      "#" + panelId + " .it-action-btn:disabled{opacity:.55;cursor:not-allowed}",
      "#" + panelId + " .it-list{max-height:290px;overflow:auto;display:grid;gap:6px}",
      "#" + panelId + " .it-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;",
      "border-radius:10px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.52)}",
      "#" + panelId + " .it-main{display:flex;align-items:center;gap:6px;min-width:0;flex:1}",
      "#" + panelId + " .it-item a{color:#d8b4fe;text-decoration:none;font-weight:600;font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      "#" + panelId + " .it-badge{font-size:10px;color:#86efac;background:rgba(74,222,128,.16);padding:2px 7px;border-radius:999px;",
      "border:1px solid rgba(134,239,172,.4)}",
      "#" + panelId + " .it-pill-wrap{display:flex;gap:6px;align-items:center;flex-shrink:0;margin-left:8px}",
      "#" + panelId + " .it-select{display:inline-flex;align-items:center;justify-content:center}",
      "#" + panelId + " .it-select input{width:12px;height:12px;accent-color:#c084fc;cursor:pointer}",
      "#" + panelId + " .it-mini-btn{border:1px solid rgba(252,165,165,.45);background:rgba(127,29,29,.34);color:#fecaca;border-radius:8px;padding:4px 8px;font-size:10px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .15s ease}",
      "#" + panelId + " .it-item:hover .it-mini-btn{opacity:1;pointer-events:auto}",
      "#" + panelId + " .it-mini-btn:disabled{opacity:.55;cursor:not-allowed}",
      "#" + panelId + " .it-footer{margin-top:8px;font-size:11px;color:#94a3b8}",
      "#" + panelId + " .itp-track{height:8px;border-radius:999px;background:rgba(51,65,85,.65);overflow:hidden}",
      "#" + panelId + " .itp-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#c084fc,#818cf8);",
      "box-shadow:0 0 14px rgba(192,132,252,.45);transition:width .28s ease}",
      "#" + panelId + " .itp-text{margin-top:8px;font-size:11px;color:#cbd5e1}",
      "#" + panelId + " .it-head-actions{display:flex;align-items:center;gap:4px}",
      "#" + panelId + " .it-refresh{border:0;background:transparent;color:#94a3b8;font-size:17px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px;transition:color .15s,background .15s}",
      "#" + panelId + " .it-refresh:hover{color:#f1f5f9;background:rgba(255,255,255,.1)}",
      "#" + panelId + " .it-refresh:disabled{opacity:.35;cursor:not-allowed}",
    ].join("");
    document.head.appendChild(style);
  }

  function ensurePanelShell() {
    const existing = document.getElementById(panelId);
    if (existing) return existing;

    const panel = document.createElement("aside");
    panel.id = panelId;
    panel.innerHTML = ""
      + "<div class='it-head'>"
      + "  <div class='it-title'>iTrace Overlay</div>"
      + "  <div class='it-head-actions'>"
      + "    <button class='it-refresh' title='Refresh data'>↺</button>"
      + "    <button class='it-close' title='Close'>✕</button>"
      + "  </div>"
      + "</div>"
      + "<div class='it-loading'>"
      + "  <div class='itp-track'><div class='itp-fill'></div></div>"
      + "  <div class='itp-text'>Preparing fetch...</div>"
      + "</div>"
      + "<div class='it-body hidden'>"
      + "  <div class='it-stats'></div>"
      + "  <div class='it-tabs'></div>"
      + "  <input class='it-search' placeholder='Search username...' />"
      + "  <div class='it-actions'></div>"
      + "  <div class='it-list'></div>"
      + "  <div class='it-footer'></div>"
      + "</div>";

    panel.querySelector(".it-close").addEventListener("click", () => panel.remove());
    panel.querySelector(".it-refresh").addEventListener("click", () => doFetch());
    document.body.appendChild(panel);
    return panel;
  }

  function setFetchProgress(percent, text) {
    ensureUiStyles();
    const panel = ensurePanelShell();
    const loading = panel.querySelector(".it-loading");
    const body = panel.querySelector(".it-body");
    if (loading) loading.classList.remove("hidden");
    if (body) body.classList.add("hidden");
    const fill = panel.querySelector(".itp-fill");
    const label = panel.querySelector(".itp-text");
    const safe = Math.max(0, Math.min(100, Math.floor(percent)));
    if (fill) fill.style.width = safe + "%";
    if (label) label.textContent = text;
  }

  function removeFetchProgress() {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const loading = panel.querySelector(".it-loading");
    if (loading) loading.classList.add("hidden");
  }

  function renderOverlay(payload) {
    ensureUiStyles();
    const panel = ensurePanelShell();
    const loading = panel.querySelector(".it-loading");
    const body = panel.querySelector(".it-body");
    if (loading) loading.classList.add("hidden");
    if (body) body.classList.remove("hidden");

    const followers = normalize(payload.followers);
    const following = normalize(payload.following);
    const followersSet = new Set(followers);
    const notFollowBack = following.filter((u) => !followersSet.has(u)).sort((a, b) => a.localeCompare(b));
    const usernameToId = new Map(
      (payload.followingRaw || [])
        .filter((user) => user && user.username && (user.id || user.pk))
        .map((user) => [String(user.username).toLowerCase(), String(user.id || user.pk)]),
    );

    const privateSet = new Set();
    const verifiedSet = new Set();
    [...(payload.followersRaw || []), ...(payload.followingRaw || [])].forEach((user) => {
      if (user && user.username && user.is_private) privateSet.add(String(user.username).toLowerCase());
      if (user && user.username && user.is_verified) verifiedSet.add(String(user.username).toLowerCase());
    });
    const privateUsers = [...privateSet].sort((a, b) => a.localeCompare(b));
    const verifiedUsers = [...verifiedSet].sort((a, b) => a.localeCompare(b));

    const tabs = [
      { key: "nonFollowers", label: "Non-followers", list: notFollowBack },
      { key: "followers", label: "Followers", list: followers },
      { key: "verified", label: "Verified", list: verifiedUsers },
      { key: "private", label: "Private", list: privateUsers },
    ];

    const tabsEl = panel.querySelector(".it-tabs");
    const searchEl = panel.querySelector(".it-search");
    const actionsEl = panel.querySelector(".it-actions");
    const listEl = panel.querySelector(".it-list");
    const footerEl = panel.querySelector(".it-footer");
    const unfollowedSet = new Set();
    const selectedSet = new Set();
    let lastFilteredItems = [];
    let isUnfollowing = false;
    let searchRaf = 0;

    let activeKey = "nonFollowers";

    function getCsrfToken() {
      const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : "";
    }

    async function unfollowById(userId, csrfToken) {
      const response = await fetch(
        "https://www.instagram.com/web/friendships/" + userId + "/unfollow/",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-csrftoken": csrfToken,
          },
          mode: "cors",
          credentials: "include",
          body: "",
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || (data && data.status && data.status !== "ok")) {
        throw new Error((data && data.message) || "Unfollow failed");
      }
    }

    async function runUnfollow(usernames) {
      const queue = [...new Set(usernames)];
      if (isUnfollowing || queue.length === 0) return;
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        footerEl.textContent = "Missing csrftoken. Refresh Instagram and try again.";
        return;
      }

      const approved = window.confirm(
        "Unfollow " + queue.length + " user(s)? This action cannot be undone."
      );
      if (!approved) return;

      isUnfollowing = true;
      renderActions();
      let completed = 0;
      let success = 0;
      const failed = [];

      for (const username of queue) {
        const userId = usernameToId.get(username);
        completed += 1;

        if (!userId) {
          failed.push(username);
        } else {
          try {
            await unfollowById(userId, csrfToken);
            unfollowedSet.add(username);
            selectedSet.delete(username);
            success += 1;
          } catch {
            selectedSet.delete(username);
            failed.push(username);
          }
        }

        footerEl.textContent =
          "@" + payload.account + " • unfollow progress " + completed + "/" + queue.length;

        if (completed < queue.length) {
          await sleep(unfollowDelayMs + jitter(unfollowJitterMs));
          if (completed % 5 === 0 && unfollowPauseAfterFiveMs > 0) {
            await sleep(unfollowPauseAfterFiveMs + jitter(unfollowJitterMs));
          }
        }
      }

      isUnfollowing = false;
      renderActions();
      renderList();
      footerEl.textContent =
        "@" +
        payload.account +
        " • unfollow done: " +
        success +
        " success, " +
        failed.length +
        " failed";
      if (failed.length) {
        console.warn("Failed to unfollow:", failed);
      }
    }

    function renderTabs() {
      tabsEl.innerHTML = "";
      tabs.forEach((tab) => {
        const button = document.createElement("button");
        button.className = "it-tab" + (tab.key === activeKey ? " active" : "");
        button.textContent = tab.label + " (" + tab.list.length + ")";
        button.addEventListener("click", () => {
          activeKey = tab.key;
          renderTabs();
          renderList();
          renderActions();
        });
        tabsEl.appendChild(button);
      });
    }

    function renderList() {
      const keyword = String(searchEl.value || "").toLowerCase().trim();
      const selected = tabs.find((t) => t.key === activeKey) || tabs[0];
      const filteredItems = keyword
        ? selected.list.filter((u) => u.includes(keyword))
        : selected.list;
      lastFilteredItems = filteredItems;
      const renderLimit = keyword ? filteredItems.length : Math.min(filteredItems.length, 180);
      const items = filteredItems.slice(0, renderLimit);

      listEl.innerHTML = "";
      const fragment = document.createDocumentFragment();
      items.forEach((username) => {
        const item = document.createElement("div");
        item.className = "it-item";
        const isPrivate = privateSet.has(username);
        const canUnfollow = activeKey === "nonFollowers" && usernameToId.has(username);
        const alreadyUnfollowed = unfollowedSet.has(username);
        const checked = selectedSet.has(username) ? " checked" : "";
        if (canUnfollow && !alreadyUnfollowed) {
          item.setAttribute("data-row-select", username);
        }

        const controls = canUnfollow
          ? "<span class='it-pill-wrap'>"
              + (alreadyUnfollowed
                ? "<span class='it-badge'>done</span>"
                : "<button class='it-mini-btn' data-unfollow='" + username + "' type='button'>Unfollow</button>")
              + "<label class='it-select'><input type='checkbox' data-select='" + username + "'" + checked + " /></label>"
          + "</span>"
          : "";
        const trailingBadge = isPrivate ? "<span class='it-badge'>private</span>" : "";
        const main = ""
          + "<span class='it-main'>"
          + "<a href='https://www.instagram.com/" + username + "/' target='_blank' rel='noreferrer'>@" + username + "</a>"
          + trailingBadge
          + "</span>";
        item.innerHTML = ""
          + main
          + controls;
        fragment.appendChild(item);
      });
      listEl.appendChild(fragment);

      listEl.querySelectorAll("[data-unfollow]").forEach((button) => {
        button.addEventListener("click", async () => {
          const username = button.getAttribute("data-unfollow");
          if (!username) return;
          await runUnfollow([username]);
        });
      });

      listEl.querySelectorAll("[data-select]").forEach((input) => {
        input.addEventListener("change", (event) => {
          const username = event.target.getAttribute("data-select");
          if (!username) return;
          if (event.target.checked) {
            selectedSet.add(username);
          } else {
            selectedSet.delete(username);
          }
          renderActions();
        });
      });

      listEl.querySelectorAll(".it-item[data-row-select]").forEach((row) => {
        row.addEventListener("click", (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          if (
            target.closest("a") ||
            target.closest("[data-unfollow]") ||
            target.closest("[data-select]")
          ) {
            return;
          }

          const username = row.getAttribute("data-row-select");
          if (!username) return;
          if (selectedSet.has(username)) {
            selectedSet.delete(username);
          } else {
            selectedSet.add(username);
          }
          renderList();
          renderActions();
        });
      });

      footerEl.textContent =
        "@" +
        payload.account +
        " • showing " +
        items.length +
        " of " +
        selected.list.length +
        " • selected " +
        [...selectedSet].filter((username) => usernameToId.has(username) && !unfollowedSet.has(username)).length +
        (renderLimit < filteredItems.length ? " • refine search for full list" : "");
    }

    function renderActions() {
      if (activeKey !== "nonFollowers") {
        actionsEl.innerHTML = "";
        return;
      }

      const visibleCandidates = (lastFilteredItems || [])
        .filter((username) => usernameToId.has(username) && !unfollowedSet.has(username));
      const selectedCandidates = [...selectedSet]
        .filter((username) => usernameToId.has(username) && !unfollowedSet.has(username));

      actionsEl.innerHTML =
        "<button class='it-action-btn' type='button' data-select-visible>"
          + "Select visible (" + visibleCandidates.length + ")"
        + "</button>"
        + "<button class='it-action-btn' type='button' data-clear-selected>"
          + "Clear selected (" + selectedCandidates.length + ")"
        + "</button>"
        + "<button class='it-action-btn warn' type='button' data-unfollow-visible>"
          + "Unfollow selected (" + selectedCandidates.length + ")"
        + "</button>";

      const selectButton = actionsEl.querySelector("[data-select-visible]");
      const clearButton = actionsEl.querySelector("[data-clear-selected]");
      const unfollowButton = actionsEl.querySelector("[data-unfollow-visible]");
      if (!selectButton || !clearButton || !unfollowButton) return;

      selectButton.disabled = isUnfollowing || visibleCandidates.length === 0;
      clearButton.disabled = isUnfollowing || selectedCandidates.length === 0;
      unfollowButton.disabled = isUnfollowing || selectedCandidates.length === 0;

      selectButton.addEventListener("click", () => {
        visibleCandidates.forEach((username) => selectedSet.add(username));
        renderActions();
        renderList();
      });

      clearButton.addEventListener("click", () => {
        selectedSet.clear();
        renderActions();
        renderList();
      });

      unfollowButton.addEventListener("click", async () => {
        await runUnfollow(selectedCandidates);
      });
    }

    searchEl.addEventListener("input", () => {
      if (searchRaf) cancelAnimationFrame(searchRaf);
      searchRaf = requestAnimationFrame(() => {
        renderList();
        renderActions();
      });
    });
    renderTabs();
    renderList();
    renderActions();
  }

  async function fetchPage(type, params, retries = 3) {
    let attempt = 0;
    let lastError = null;

    while (attempt < retries) {
      try {
        const response = await fetch(
          "https://www.instagram.com/api/v1/friendships/" + type + "/?" + params.toString(),
          { method: "GET", headers, credentials: "include" }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== "ok") {
          throw new Error(
            (data && data.message) ||
              ("HTTP " + response.status + " / status=" + (data && data.status))
          );
        }

        return data;
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt < retries) {
          await sleep(searchCycleDelayMs * (attempt + 1));
        }
      }
    }

    throw new Error(type + " request failed after retries: " + (lastError?.message || "unknown"));
  }

  async function fetchAll(type, phaseStart, phaseEnd) {
    const allUsers = [];
    let maxId = null;
    let cycle = 0;
    let page = 0;
    let fetchedCount = 0;

    while (true) {
      const params = new URLSearchParams({
        count: String(pageCount),
        search_surface: "follow_list_page",
      });
      if (maxId) params.set("max_id", maxId);

      const data = await fetchPage(type, params);
      const users = Array.isArray(data.users) ? data.users : [];
      allUsers.push(...users);
      fetchedCount += users.length;
      page += 1;
      maxId = data.next_max_id || null;
      const hasMore = Boolean(maxId);
      const progress = hasMore
        ? Math.min(phaseEnd - 2, phaseStart + page * 6)
        : phaseEnd;
      setFetchProgress(
        progress,
        "Fetching " + type + " • " + fetchedCount + " users loaded",
      );
      if (!maxId) break;

      cycle += 1;
      await sleep(searchCycleDelayMs + jitter(searchJitterMs));
      if (cycle % 5 === 0 && searchPauseAfterFiveMs > 0) {
        await sleep(searchPauseAfterFiveMs + jitter(searchJitterMs));
      }
    }

    return allUsers;
  }

  async function doFetch() {
    ensureUiStyles();
    const panel = ensurePanelShell();
    const refreshBtn = panel.querySelector(".it-refresh");
    const body = panel.querySelector(".it-body");
    if (refreshBtn) refreshBtn.disabled = true;
    if (body) {
      body.innerHTML =
        "<div class='it-stats'></div>" +
        "<div class='it-tabs'></div>" +
        "<input class='it-search' placeholder='Search username...' />" +
        "<div class='it-actions'></div>" +
        "<div class='it-list'></div>" +
        "<div class='it-footer'></div>";
      body.classList.add("hidden");
    }

    try {
      setFetchProgress(3, "Starting Instagram fetch...");
      const followersRaw = await fetchAll("followers", 5, 49);
      await sleep(searchCycleDelayMs + jitter(searchJitterMs));
      setFetchProgress(51, "Followers done. Fetching following...");
      const followingRaw = await fetchAll("following", 53, 98);
      setFetchProgress(100, "Completed. Rendering overlay...");

      const payload = {
        account: window._sharedData?.config?.viewer?.username || "logged in user",
        delayMs: searchCycleDelayMs,
        pauseAfterFiveCyclesMs: searchPauseAfterFiveMs,
        unfollowDelayMs,
        unfollowPauseAfterFiveMs,
        followers: normalize(followersRaw.map((u) => u.username)),
        following: normalize(followingRaw.map((u) => u.username)),
        followersRaw,
        followingRaw,
      };

      renderOverlay(payload);
      setTimeout(removeFetchProgress, 1200);
      console.log("iTrace payload:", payload);
      console.log("iTrace payload JSON:", JSON.stringify(payload, null, 2));
      if (typeof copy === "function") copy(JSON.stringify(payload, null, 2));
      return payload;
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  return await doFetch();
})();`
  }, [onlineDelayMs, onlinePauseAfterFiveMs, onlineJitterMs, unfollowDelayMs, unfollowPauseAfterFiveMs, unfollowJitterMs])

  function markVisited(username) {
    setVisitedUsernames((current) => {
      if (current.includes(username)) return current
      return [...current, username]
    })
  }

  function handleModeChange(nextMode) {
    setMode(nextMode)
    setError('')
    setResult(null)
    setQuery('')
  }

  async function handleCopyScript() {
    try {
      await navigator.clipboard.writeText(onlineScript)
      setCopiedScript(true)
    } catch {
      setError('Could not copy script automatically. Please copy it manually.')
    }
  }

  async function handleCompareFiles() {
    if (!followingFile || !followersFile) {
      setError('Please upload both files first.')
      return
    }

    const [followingText, followersText] = await Promise.all([
      followingFile.text(),
      followersFile.text(),
    ])

    const followingPayload = parseJsonText(followingText, 'Following file')
    const followersPayload = parseJsonText(followersText, 'Followers file')

    const following = normalizeUnique(extractUsernames(followingPayload))
    const followers = normalizeUnique(extractUsernames(followersPayload))
    setResult(buildResult(following, followers, 'instagram', 'your account'))
  }

  async function handleCompare(event) {
    event.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)

    try {
      await handleCompareFiles()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">OFFLINE + ONLINE</p>
        <h1>iTrace Followback Checker</h1>
        <p className="subtitle">
          Compare following vs followers and find who does not follow back.
        </p>
        <div className="hero-links">
          <a
            className="github-link"
            href="https://github.com/stanleyowen/iTrace"
            target="_blank"
            rel="noreferrer"
            aria-label="Open iTrace GitHub repository"
            title="GitHub repository"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.426 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.866-.014-1.699-2.782.605-3.369-1.344-3.369-1.344-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.004.071 1.532 1.032 1.532 1.032.893 1.532 2.341 1.09 2.91.834.09-.647.35-1.09.636-1.341-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.254-.446-1.272.098-2.651 0 0 .84-.269 2.75 1.027A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.748-1.027 2.748-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.748 0 .268.18.58.688.481A10.019 10.019 0 0 0 22 12.017C22 6.484 17.523 2 12 2Z"
                fill="currentColor"
              />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </header>

      <section className="card mode-switch">
        <button
          type="button"
          className={mode === 'online' ? 'active' : ''}
          onClick={() => handleModeChange('online')}
        >
          iTrace Online
        </button>
        <button
          type="button"
          className={mode === 'offline' ? 'active' : ''}
          onClick={() => handleModeChange('offline')}
        >
          Offline mode
        </button>
      </section>

      {mode === 'offline' && (
        <>
          <details className="card guide">
            <summary>How to export the Instagram JSON files</summary>
            <ol>
              <li>
                Open{' '}
                <a
                  href="https://accountscenter.instagram.com/info_and_permissions/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Accounts Center → Info and permissions
                </a>
                .
              </li>
              <li>Choose <strong>Export your information</strong>.</li>
              <li>Choose <strong>Create export</strong>.</li>
              <li>Select the Instagram account you want to export.</li>
              <li>Set format to <strong>JSON</strong>.</li>
              <li>Set date range to <strong>All time</strong>.</li>
              <li>
                Open <strong>Customize information</strong> and select{' '}
                <strong>Connections</strong> → <strong>Followers and following</strong>
                . Other categories are optional.
              </li>
              <li>Download the export when ready, then upload the JSON files here.</li>
            </ol>
          </details>

          <form className="card form-card" onSubmit={handleCompare}>
            <div className="section-head">
              <h2>Select your files</h2>
              <p>Use Instagram export files for following and followers.</p>
            </div>

            <div className="file-grid">
              <label className="file-field">
                <span>Following JSON</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => setFollowingFile(event.target.files?.[0] ?? null)}
                />
                <small>{followingFile?.name || 'No file selected'}</small>
              </label>

              <label className="file-field">
                <span>Followers JSON</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => setFollowersFile(event.target.files?.[0] ?? null)}
                />
                <small>{followersFile?.name || 'No file selected'}</small>
              </label>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Checking...' : 'Check followback'}
            </button>
          </form>
        </>
      )}

      {mode === 'online' && (
        <section className="card form-card">
          <div className="section-head">
            <h2>Instagram web console mode</h2>
            <p>
              Fetches your followers and following via Instagram's internal API, then injects
              a live overlay UI with search and bulk unfollow. Defaults are tuned for the
              fastest safe speed — fetch delays are low-risk read ops, unfollow delays are
              kept conservative to avoid action blocks.
            </p>
          </div>

          <label className="file-field">
            <span>Delay between fetch pages</span>
            <input
              type="number"
              min="500"
              step="100"
              value={onlineDelayMs}
              onChange={(event) => setOnlineDelayMs(event.target.value)}
            />
            <small>ms — read-only op, safe down to 500ms. Default 600ms.</small>
          </label>

          <label className="file-field">
            <span>Cooldown after every 5 fetch pages</span>
            <input
              type="number"
              min="0"
              step="500"
              value={onlinePauseAfterFiveMs}
              onChange={(event) => setOnlinePauseAfterFiveMs(event.target.value)}
            />
            <small>ms — brief breather to avoid bursting. Default 3000ms.</small>
          </label>

          <label className="file-field">
            <span>Fetch random jitter</span>
            <input
              type="number"
              min="0"
              step="100"
              value={onlineJitterMs}
              onChange={(event) => setOnlineJitterMs(event.target.value)}
            />
            <small>ms — adds 0–N ms randomly to each fetch delay to break the fixed pattern. Default 400ms.</small>
          </label>

          <label className="file-field">
            <span>Delay between unfollows</span>
            <input
              type="number"
              min="1000"
              step="500"
              value={unfollowDelayMs}
              onChange={(event) => setUnfollowDelayMs(event.target.value)}
            />
            <small>ms — write op, keep above 2500ms to avoid action blocks. Default 3000ms.</small>
          </label>

          <label className="file-field">
            <span>Cooldown after every 5 unfollows</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={unfollowPauseAfterFiveMs}
              onChange={(event) => setUnfollowPauseAfterFiveMs(event.target.value)}
            />
            <small>ms — longer pause reduces ban risk on bulk unfollows. Default 15000ms.</small>
          </label>

          <label className="file-field">
            <span>Unfollow random jitter</span>
            <input
              type="number"
              min="0"
              step="250"
              value={unfollowJitterMs}
              onChange={(event) => setUnfollowJitterMs(event.target.value)}
            />
            <small>ms — adds 0–N ms randomly to each unfollow delay. Default 1500ms.</small>
          </label>

          <ol className="steps">
            <li>
              Open{' '}
              <a href="https://www.instagram.com/" target="_blank" rel="noreferrer">
                instagram.com
              </a>{' '}
              and log in.
            </li>
            <li>
              Open DevTools Console —{' '}
              <span className="devtools-hint">
                press <kbd>F12</kbd> or <kbd>Ctrl+Shift+J</kbd> (Windows/Linux) /{' '}
                <kbd>⌘+Option+J</kbd> (Mac), or right-click anywhere on the page and choose{' '}
                <strong>Inspect</strong>, then click the <strong>Console</strong> tab.
              </span>
            </li>
            <li>Copy and run this script to inject the iTrace overlay.</li>
            <li>Use the injected UI directly for search, selection, and unfollow.</li>
          </ol>

          <pre className="code-block">{onlineScript}</pre>
          <button type="button" onClick={handleCopyScript}>
            {copiedScript ? 'Copied' : 'Copy script'}
          </button>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="card results">
          <div className="section-head">
            <h2>Results</h2>
            <p>
              Comparing <strong>{result.account}</strong> on {result.platform}.
            </p>
          </div>

          <div className="stats">
            <article>
              <p>You follow</p>
              <strong>{result.totalFollowing}</strong>
            </article>
            <article>
              <p>Follow you</p>
              <strong>{result.totalFollowers}</strong>
            </article>
            <article>
              <p>Not following back</p>
              <strong>{result.notFollowingBack.length}</strong>
            </article>
          </div>

          <input
            className="search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search username..."
          />

          <ul className="list">
            {filteredUsers.map((username) => (
              <li key={username}>
                <a
                  href={profileUrl(username)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markVisited(username)}
                >
                  <span>@{username}</span>
                  {visitedSet.has(username) && (
                    <span className="checkmark" aria-label="Visited">
                      ✓
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          {filteredUsers.length === 0 && (
            <p className="empty">No usernames match your search.</p>
          )}
        </section>
      )}
    </main>
  )
}

export default App
