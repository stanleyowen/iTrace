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

function extractOnlineComparePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Online payload must be a JSON object.')
  }

  const followers = normalizeUnique(extractUsernames(payload.followers ?? []))
  const following = normalizeUnique(extractUsernames(payload.following ?? []))
  const account =
    typeof payload.account === 'string' && payload.account.trim()
      ? payload.account.trim().toLowerCase()
      : 'logged in user'

  if (followers.length === 0 && following.length === 0) {
    throw new Error('No followers/following found. Run the full console script first.')
  }

  return { followers, following, account }
}

function profileUrl(username) {
  return `https://www.instagram.com/${username}/`
}

function App() {
  const [mode, setMode] = useState('offline')
  const [followingFile, setFollowingFile] = useState(null)
  const [followersFile, setFollowersFile] = useState(null)
  const [onlinePayloadText, setOnlinePayloadText] = useState('')
  const [onlineDelayMs, setOnlineDelayMs] = useState('1500')
  const [onlinePauseAfterFiveMs, setOnlinePauseAfterFiveMs] = useState('10000')
  const [unfollowDelayMs, setUnfollowDelayMs] = useState('4000')
  const [unfollowPauseAfterFiveMs, setUnfollowPauseAfterFiveMs] = useState('30000')
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
    const safeDelay = Number.isFinite(rawDelay) ? Math.max(800, Math.floor(rawDelay)) : 1500
    const rawPause = Number(onlinePauseAfterFiveMs)
    const safePause = Number.isFinite(rawPause) ? Math.max(0, Math.floor(rawPause)) : 10000
    const rawUnfollowDelay = Number(unfollowDelayMs)
    const safeUnfollowDelay = Number.isFinite(rawUnfollowDelay)
      ? Math.max(1000, Math.floor(rawUnfollowDelay))
      : 4000
    const rawUnfollowPause = Number(unfollowPauseAfterFiveMs)
    const safeUnfollowPause = Number.isFinite(rawUnfollowPause)
      ? Math.max(0, Math.floor(rawUnfollowPause))
      : 30000

    return `(async () => {
  const searchCycleDelayMs = ${safeDelay};
  const searchPauseAfterFiveMs = ${safePause};
  const unfollowDelayMs = ${safeUnfollowDelay};
  const unfollowPauseAfterFiveMs = ${safeUnfollowPause};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
      "#" + panelId + " .it-body{padding:12px 14px 14px}",
      "#" + panelId + " .it-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}",
      "#" + panelId + " .it-stat{padding:8px;border-radius:10px;background:rgba(30,41,59,.5);border:1px solid rgba(148,163,184,.2)}",
      "#" + panelId + " .it-stat b{display:block;font-size:13px;color:#f8fafc}",
      "#" + panelId + " .it-stat span{font-size:10px;color:#94a3b8}",
      "#" + panelId + " .it-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:10px}",
      "#" + panelId + " .it-tab{border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.5);color:#cbd5e1;",
      "border-radius:9px;padding:7px 6px;font-size:11px;cursor:pointer}",
      "#" + panelId + " .it-tab.active{border-color:rgba(216,180,254,.6);background:linear-gradient(135deg,#c084fc,#a855f7);color:#fff}",
      "#" + panelId + " .it-search{width:100%;padding:9px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.34);",
      "background:rgba(15,23,42,.54);color:#e2e8f0;margin-bottom:8px}",
      "#" + panelId + " .it-actions{display:flex;gap:8px;margin-bottom:8px}",
      "#" + panelId + " .it-action-btn{flex:1;border:1px solid rgba(148,163,184,.32);background:rgba(15,23,42,.56);color:#e2e8f0;border-radius:9px;padding:7px 8px;font-size:11px;cursor:pointer}",
      "#" + panelId + " .it-action-btn.warn{border-color:rgba(252,165,165,.45);background:rgba(127,29,29,.34);color:#fecaca}",
      "#" + panelId + " .it-action-btn:disabled{opacity:.55;cursor:not-allowed}",
      "#" + panelId + " .it-list{max-height:290px;overflow:auto;display:grid;gap:6px}",
      "#" + panelId + " .it-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;",
      "border-radius:10px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.52)}",
      "#" + panelId + " .it-item a{color:#d8b4fe;text-decoration:none;font-weight:600;font-size:13px}",
      "#" + panelId + " .it-badge{font-size:10px;color:#86efac;background:rgba(74,222,128,.16);padding:2px 7px;border-radius:999px;",
      "border:1px solid rgba(134,239,172,.4)}",
      "#" + panelId + " .it-pill-wrap{display:flex;gap:6px;align-items:center}",
      "#" + panelId + " .it-mini-btn{border:1px solid rgba(252,165,165,.45);background:rgba(127,29,29,.34);color:#fecaca;border-radius:8px;padding:4px 8px;font-size:10px;cursor:pointer}",
      "#" + panelId + " .it-mini-btn:disabled{opacity:.55;cursor:not-allowed}",
      "#" + panelId + " .it-footer{margin-top:8px;font-size:11px;color:#94a3b8}",
    ].join("");
    document.head.appendChild(style);
  }

  function ensurePanelShell() {
    const existing = document.getElementById(panelId);
    if (existing) existing.remove();

    const panel = document.createElement("aside");
    panel.id = panelId;
    panel.innerHTML = ""
      + "<div class='it-head'>"
      + "  <div class='it-title'>iTrace Overlay</div>"
      + "  <button class='it-close' title='Close'>✕</button>"
      + "</div>"
      + "<div class='it-body'>"
      + "  <div class='it-stats'></div>"
      + "  <div class='it-tabs'></div>"
      + "  <input class='it-search' placeholder='Search username...' />"
      + "  <div class='it-actions'></div>"
      + "  <div class='it-list'></div>"
      + "  <div class='it-footer'></div>"
      + "</div>";

    panel.querySelector(".it-close").addEventListener("click", () => panel.remove());
    document.body.appendChild(panel);
    return panel;
  }

  function renderOverlay(payload) {
    ensureUiStyles();
    const panel = ensurePanelShell();

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
    [...(payload.followersRaw || []), ...(payload.followingRaw || [])].forEach((user) => {
      if (user && user.username && user.is_private) privateSet.add(String(user.username).toLowerCase());
    });
    const privateUsers = [...privateSet].sort((a, b) => a.localeCompare(b));

    const tabs = [
      { key: "followers", label: "Followers", list: followers },
      { key: "following", label: "Following", list: following },
      { key: "notFollowBack", label: "No Back", list: notFollowBack },
      { key: "private", label: "Private", list: privateUsers },
    ];

    const statsEl = panel.querySelector(".it-stats");
    const tabsEl = panel.querySelector(".it-tabs");
    const searchEl = panel.querySelector(".it-search");
    const actionsEl = panel.querySelector(".it-actions");
    const listEl = panel.querySelector(".it-list");
    const footerEl = panel.querySelector(".it-footer");
    const unfollowedSet = new Set();
    let isUnfollowing = false;

    statsEl.innerHTML = ""
      + "<div class='it-stat'><b>" + followers.length + "</b><span>Followers</span></div>"
      + "<div class='it-stat'><b>" + following.length + "</b><span>Following</span></div>"
      + "<div class='it-stat'><b>" + notFollowBack.length + "</b><span>No Back</span></div>"
      + "<div class='it-stat'><b>" + privateUsers.length + "</b><span>Private</span></div>";

    let activeKey = "notFollowBack";

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
      if (isUnfollowing || usernames.length === 0) return;
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        footerEl.textContent = "Missing csrftoken. Refresh Instagram and try again.";
        return;
      }

      const approved = window.confirm(
        "Unfollow " + usernames.length + " user(s)? This action cannot be undone."
      );
      if (!approved) return;

      isUnfollowing = true;
      renderActions();
      let completed = 0;
      let success = 0;
      const failed = [];

      for (const username of usernames) {
        const userId = usernameToId.get(username);
        completed += 1;

        if (!userId) {
          failed.push(username);
        } else {
          try {
            await unfollowById(userId, csrfToken);
            unfollowedSet.add(username);
            success += 1;
          } catch {
            failed.push(username);
          }
        }

        footerEl.textContent =
          "@" + payload.account + " • unfollow progress " + completed + "/" + usernames.length;

        if (completed < usernames.length) {
          await sleep(unfollowDelayMs);
          if (completed % 5 === 0 && unfollowPauseAfterFiveMs > 0) {
            await sleep(unfollowPauseAfterFiveMs);
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
        button.textContent = tab.label;
        button.addEventListener("click", () => {
          activeKey = tab.key;
          renderTabs();
          renderActions();
          renderList();
        });
        tabsEl.appendChild(button);
      });
    }

    function renderList() {
      const keyword = String(searchEl.value || "").toLowerCase().trim();
      const selected = tabs.find((t) => t.key === activeKey) || tabs[0];
      const items = keyword
        ? selected.list.filter((u) => u.includes(keyword))
        : selected.list;

      listEl.innerHTML = "";
      items.forEach((username) => {
        const item = document.createElement("div");
        item.className = "it-item";
        const isPrivate = privateSet.has(username);
        const canUnfollow = activeKey === "notFollowBack" && usernameToId.has(username);
        const alreadyUnfollowed = unfollowedSet.has(username);
        const rightSide = canUnfollow
          ? "<span class='it-pill-wrap'>"
              + (isPrivate ? "<span class='it-badge'>private</span>" : "")
              + (alreadyUnfollowed
                ? "<span class='it-badge'>done</span>"
                : "<button class='it-mini-btn' data-unfollow='" + username + "' type='button'>Unfollow</button>")
            + "</span>"
          : (isPrivate ? "<span class='it-badge'>private</span>" : "");
        item.innerHTML = ""
          + "<a href='https://www.instagram.com/" + username + "/' target='_blank' rel='noreferrer'>@" + username + "</a>"
          + rightSide;
        listEl.appendChild(item);
      });

      listEl.querySelectorAll("[data-unfollow]").forEach((button) => {
        button.addEventListener("click", async () => {
          const username = button.getAttribute("data-unfollow");
          if (!username) return;
          await runUnfollow([username]);
        });
      });

      footerEl.textContent =
        "@" + payload.account + " • showing " + items.length + " of " + selected.list.length;
    }

    function renderActions() {
      if (activeKey !== "notFollowBack") {
        actionsEl.innerHTML = "";
        return;
      }

      const visibleCandidates = (tabs.find((t) => t.key === "notFollowBack")?.list || [])
        .filter((username) => usernameToId.has(username) && !unfollowedSet.has(username));

      actionsEl.innerHTML =
        "<button class='it-action-btn warn' type='button' data-unfollow-visible>"
          + "Unfollow visible (" + visibleCandidates.length + ")"
        + "</button>";

      const button = actionsEl.querySelector("[data-unfollow-visible]");
      if (!button) return;
      button.disabled = isUnfollowing || visibleCandidates.length === 0;
      button.addEventListener("click", async () => {
        await runUnfollow(visibleCandidates);
      });
    }

    searchEl.addEventListener("input", renderList);
    renderTabs();
    renderActions();
    renderList();
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

  async function fetchAll(type) {
    const allUsers = [];
    let maxId = null;
    let cycle = 0;

    while (true) {
      const params = new URLSearchParams({
        count: String(pageCount),
        search_surface: "follow_list_page",
      });
      if (maxId) params.set("max_id", maxId);

      const data = await fetchPage(type, params);
      const users = Array.isArray(data.users) ? data.users : [];
      allUsers.push(...users);
      maxId = data.next_max_id || null;
      if (!maxId) break;

      cycle += 1;
      await sleep(searchCycleDelayMs);
      if (cycle % 5 === 0 && searchPauseAfterFiveMs > 0) {
        await sleep(searchPauseAfterFiveMs);
      }
    }

    return allUsers;
  }

  const followersRaw = await fetchAll("followers");
  await sleep(searchCycleDelayMs);
  const followingRaw = await fetchAll("following");

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
  console.log("iTrace payload:", payload);
  console.log("iTrace payload JSON:", JSON.stringify(payload, null, 2));
  if (typeof copy === "function") copy(JSON.stringify(payload, null, 2));
  return payload;
})();`
  }, [onlineDelayMs, onlinePauseAfterFiveMs, unfollowDelayMs, unfollowPauseAfterFiveMs])

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

  async function handleCompareOnline() {
    const payload = parseJsonText(onlinePayloadText, 'Online payload')
    const { followers, following, account } = extractOnlineComparePayload(payload)
    setResult(buildResult(following, followers, 'instagram', account))
  }

  async function handleCompare(event) {
    event.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)

    try {
      if (mode === 'offline') {
        await handleCompareFiles()
      } else {
        await handleCompareOnline()
      }
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
      </header>

      <section className="card mode-switch">
        <button
          type="button"
          className={mode === 'offline' ? 'active' : ''}
          onClick={() => handleModeChange('offline')}
        >
          Offline mode
        </button>
        <button
          type="button"
          className={mode === 'online' ? 'active' : ''}
          onClick={() => handleModeChange('online')}
        >
          Online mode
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
              Run a throttled script in Instagram console to fetch all followers/following,
              inject a modern overlay UI directly on Instagram (including unfollow controls),
              and optionally paste JSON below for iTrace compare. Delay settings here apply
              before running the script.
            </p>
          </div>

          <label className="file-field">
            <span>Default time between search cycles</span>
            <input
              type="number"
              min="800"
              step="100"
              value={onlineDelayMs}
              onChange={(event) => setOnlineDelayMs(event.target.value)}
            />
            <small>(ms)</small>
          </label>

          <label className="file-field">
            <span>Default time to wait after five search cycles</span>
            <input
              type="number"
              min="0"
              step="500"
              value={onlinePauseAfterFiveMs}
              onChange={(event) => setOnlinePauseAfterFiveMs(event.target.value)}
            />
            <small>(ms)</small>
          </label>

          <label className="file-field">
            <span>Default time between unfollows</span>
            <input
              type="number"
              min="1000"
              step="500"
              value={unfollowDelayMs}
              onChange={(event) => setUnfollowDelayMs(event.target.value)}
            />
            <small>(ms)</small>
          </label>

          <label className="file-field">
            <span>Default time to wait after five unfollows</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={unfollowPauseAfterFiveMs}
              onChange={(event) => setUnfollowPauseAfterFiveMs(event.target.value)}
            />
            <small>(ms)</small>
          </label>

          <ol className="steps">
            <li>Open instagram.com and log in.</li>
            <li>Open DevTools Console.</li>
            <li>Copy and run this script to inject the iTrace overlay.</li>
            <li>Paste output JSON into iTrace if you also want local compare.</li>
          </ol>

          <pre className="code-block">{onlineScript}</pre>
          <button type="button" onClick={handleCopyScript}>
            {copiedScript ? 'Copied' : 'Copy script'}
          </button>

          <form onSubmit={handleCompare} className="form-card">
            <label className="file-field">
              <span>Paste iTrace payload JSON</span>
              <textarea
                className="payload-input"
                value={onlinePayloadText}
                onChange={(event) => setOnlinePayloadText(event.target.value)}
                placeholder='{"account":"...","followers":["..."],"following":["..."]}'
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Checking...' : 'Check followback'}
            </button>
          </form>
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
