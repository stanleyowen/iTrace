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
      if (typeof item?.title === 'string' && item.title.trim()) {
        return item.title.trim()
      }
      const value = item?.string_list_data?.[0]?.value
      if (typeof value === 'string' && value.trim()) return value.trim()
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
      return payload.users.map((user) => user?.username).filter(Boolean)
    }
  }

  throw new Error('Unsupported format. Use Instagram followers/following JSON.')
}

function normalizeUnique(usernames) {
  return [...new Set(usernames.map((name) => name.toLowerCase().trim()))]
}

function buildResult(following, followers) {
  const followersSet = new Set(followers)
  const notFollowingBack = following
    .filter((username) => !followersSet.has(username))
    .sort((a, b) => a.localeCompare(b))

  return {
    totalFollowing: following.length,
    totalFollowers: followers.length,
    notFollowingBack,
  }
}

function App() {
  const [followingFile, setFollowingFile] = useState(null)
  const [followersFile, setFollowersFile] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
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

  const filteredUsers = useMemo(() => {
    if (!result) return []
    const keyword = query.trim().toLowerCase()
    if (!keyword) return result.notFollowingBack
    return result.notFollowingBack.filter((username) =>
      username.toLowerCase().includes(keyword),
    )
  }, [query, result])

  function markVisited(username) {
    setVisitedUsernames((current) => {
      if (current.includes(username)) return current
      return [...current, username]
    })
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
    setResult(buildResult(following, followers))
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
        <p className="eyebrow">PRIVATE • LOCAL • SIMPLE</p>
        <h1>Instagram Followback Checker</h1>
        <p className="subtitle">
          Compare your following vs followers using Instagram JSON exports.
        </p>
      </header>

      <details className="card guide">
        <summary>How to export the JSON files</summary>
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
          <p>Use the export files for following and followers.</p>
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

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="card results">
          <div className="section-head">
            <h2>Results</h2>
            <p>
              Profiles marked with ✓ were already opened in your current browser.
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
                  href={`https://www.instagram.com/${username}/`}
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
