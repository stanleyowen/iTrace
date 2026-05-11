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

    return `(async () => {
  const delayMs = ${safeDelay};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const appId = "936619743392459";
  const headers = { "x-ig-app-id": appId };
  const pageCount = 12;

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
          await sleep(delayMs * (attempt + 1));
        }
      }
    }

    throw new Error(type + " request failed after retries: " + (lastError?.message || "unknown"));
  }

  async function fetchAll(type) {
    const allUsers = [];
    let maxId = null;

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
      await sleep(delayMs + 300);
    }

    return allUsers;
  }

  const followersRaw = await fetchAll("followers");
  await sleep(delayMs);
  const followingRaw = await fetchAll("following");

  const payload = {
    account: window._sharedData?.config?.viewer?.username || "logged in user",
    delayMs,
    followers: followersRaw.map((u) => u.username).filter(Boolean),
    following: followingRaw.map((u) => u.username).filter(Boolean),
    followersRaw,
    followingRaw,
  };

  console.log("iTrace payload:", payload);
  console.log("iTrace payload JSON:", JSON.stringify(payload, null, 2));
  if (typeof copy === "function") copy(JSON.stringify(payload, null, 2));
  return payload;
})();`
  }, [onlineDelayMs])

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
              then paste the JSON payload below.
            </p>
          </div>

          <label className="file-field">
            <span>API interval delay (ms, minimum 800)</span>
            <input
              type="number"
              min="800"
              step="100"
              value={onlineDelayMs}
              onChange={(event) => setOnlineDelayMs(event.target.value)}
            />
          </label>

          <ol className="steps">
            <li>Open instagram.com and log in.</li>
            <li>Open DevTools Console.</li>
            <li>Copy and run this script.</li>
            <li>Paste output JSON into iTrace and click check.</li>
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
