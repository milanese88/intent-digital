import React, { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Eyebrow,
  EmptyState,
  Field
} from '../ui';
import PinterestBoardEmbed from './PinterestBoardEmbed.jsx';
import {
  validateAndParsePinterestBoardUrl,
  deriveBoardTitleFromUrl,
  buildPinterestWidgets
} from '../../utils/pinterest.js';

export default function InspirationTab() {
  const [boards, setBoards] = useState(() => {
    if (typeof window !== 'undefined' && Array.isArray(window.__cachedPinterestBoards)) {
      return window.__cachedPinterestBoards;
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined' && Array.isArray(window.__cachedPinterestBoards) && window.__cachedPinterestBoards.length > 0) {
      return false;
    }
    return true;
  });
  const [error, setError] = useState(null);

  // New board form state
  const [boardUrlInput, setBoardUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Fetch boards
  const fetchBoards = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/designer/pinterest-boards');
      if (res.ok) {
        const data = await res.json();
        const list = data.boards || [];
        if (typeof window !== 'undefined') {
          window.__cachedPinterestBoards = list;
        }
        setBoards(list);
      } else {
        throw new Error(`Failed to load boards (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error('Failed to load Pinterest boards:', err);
      if (!silent) setError(err.message || 'Could not load Pinterest boards');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasCache = typeof window !== 'undefined' && Array.isArray(window.__cachedPinterestBoards) && window.__cachedPinterestBoards.length > 0;
    fetchBoards(hasCache);
  }, []);

  useEffect(() => {
    if (boards.length > 0) {
      buildPinterestWidgets();
    }
  }, [boards]);

  // Handle Add Board
  // Order: trim -> empty check -> if pin.it, resolve via API -> validate resolved -> normalize -> save
  const handleAddBoard = async (e) => {
    e?.preventDefault();
    setFormError(null);

    // 1. Trim & 2. Empty check
    const raw = (boardUrlInput || '').trim();
    if (!raw) {
      setFormError('Please enter a Pinterest board URL.');
      return;
    }

    // 3. Format validation
    const initialCheck = validateAndParsePinterestBoardUrl(raw);
    if (!initialCheck.valid) {
      setFormError(initialCheck.error);
      return;
    }

    let finalUrl = raw;
    let kind = initialCheck.kind || 'board';

    // If pin.it shortlink: resolve via server
    if (initialCheck.isShortLink) {
      setIsResolving(true);
      try {
        const resolveRes = await fetch(`/api/designer/pinterest-resolve?url=${encodeURIComponent(raw)}`);
        const resolveData = await resolveRes.json().catch(() => ({}));
        if (!resolveRes.ok) {
          throw new Error(resolveData.error || 'Could not resolve Pinterest short link.');
        }

        const resolvedUrl = resolveData.url || resolveData.resolvedUrl || resolveData.normalizedUrl;
        if (!resolvedUrl) {
          throw new Error('Could not resolve destination URL.');
        }

        // If redirect lands on a pin URL, reject with friendly message
        if (resolvedUrl.includes('/pin/') || resolveData.isPin) {
          setFormError("This looks like a single pin — add it to a room's mood board instead.");
          setIsResolving(false);
          return;
        }

        // Validate resolved board or section URL
        const resolvedParsed = validateAndParsePinterestBoardUrl(resolvedUrl);
        if (!resolvedParsed.valid) {
          setFormError(resolvedParsed.error);
          setIsResolving(false);
          return;
        }

        finalUrl = resolvedParsed.normalizedUrl;
        kind = resolvedParsed.kind || 'board';
      } catch (err) {
        setFormError(err.message || 'Could not resolve pin.it short link.');
        setIsResolving(false);
        return;
      } finally {
        setIsResolving(false);
      }
    } else {
      finalUrl = initialCheck.normalizedUrl;
      kind = initialCheck.kind || 'board';
    }

    const finalTitle = titleInput.trim() || deriveBoardTitleFromUrl(finalUrl);

    // 4. Save board
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/designer/pinterest-boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_url: finalUrl,
          title: finalTitle,
          kind
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't save the board — please try again.");
      }

      const data = await res.json();
      const newBoard = data.board;
      const updated = [...boards, newBoard];
      setBoards(updated);
      if (typeof window !== 'undefined') {
        window.__cachedPinterestBoards = updated;
      }

      setBoardUrlInput('');
      setTitleInput('');
      setIsFormOpen(false);
    } catch (err) {
      const msg = err.message || '';
      const lower = msg.toLowerCase();
      const isRawDbError = lower.includes('relation') || lower.includes('table') || lower.includes('column') || lower.includes('postgres') || lower.includes('syntax') || lower.includes('sql') || lower.includes('database');
      setFormError(isRawDbError || !msg ? "Couldn't save the board — please try again." : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Remove Board
  const handleRemoveBoard = async (boardId) => {
    if (!window.confirm('Remove this Pinterest board from your inspiration library?')) return;
    try {
      const res = await fetch(`/api/designer/pinterest-boards?id=${boardId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const updated = boards.filter(b => b.id !== boardId);
        setBoards(updated);
        if (typeof window !== 'undefined') {
          window.__cachedPinterestBoards = updated;
        }
      }
    } catch (err) {
      console.error('Failed to remove board:', err);
    }
  };

  // Handle Reorder Boards
  const handleMove = async (index, direction) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= boards.length) return;

    const reordered = [...boards];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIdx, 0, moved);

    setBoards(reordered);
    if (typeof window !== 'undefined') {
      window.__cachedPinterestBoards = reordered;
    }

    try {
      await fetch('/api/designer/pinterest-boards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderedIds: reordered.map(b => b.id) })
      });
    } catch (err) {
      console.warn('Failed to sync reorder to server:', err);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Header Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: 'var(--space-24)',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 'var(--space-20)',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: '240px' }}>
          <Eyebrow>Inspiration Library &middot; Pinterest Boards</Eyebrow>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '28px',
              fontWeight: 400,
              color: 'var(--espresso)',
              margin: '4px 0 0 0'
            }}
          >
            Curate visual direction. <em style={{ fontStyle: 'italic' }}>Live from Pinterest.</em>
          </h2>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setIsFormOpen(!isFormOpen);
            setFormError(null);
          }}
        >
          {isFormOpen ? 'Close ×' : '+ ADD PINTEREST BOARD →'}
        </Button>
      </div>

      {/* Add Board Form Drawer / Card */}
      {isFormOpen && (
        <Card
          style={{
            marginBottom: 'var(--space-32)',
            border: '1px solid var(--border-strong)',
            backgroundColor: 'var(--white)',
            padding: 'var(--space-32, 32px)',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ marginBottom: 'var(--space-20, 20px)' }}>
            <h3
              style={{
                margin: '0 0 var(--space-8, 8px) 0',
                fontFamily: "'Instrument Serif', var(--font-display, 'Cormorant Garamond', Georgia, serif)",
                fontSize: '28px',
                fontWeight: 400,
                color: 'var(--espresso)',
                letterSpacing: '-0.01em',
                lineHeight: 1.2
              }}
            >
              Add a Pinterest board
            </h3>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--muted)',
                lineHeight: 1.5
              }}
            >
              Paste any public board or section link (e.g. <code>pinterest.com/username/board-name/</code> or a <code>pin.it</code> link). Secret boards cannot be embedded.
            </p>
          </div>

          <form onSubmit={handleAddBoard} noValidate style={{ width: '100%', boxSizing: 'border-box' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                gap: '16px',
                marginBottom: '16px',
                width: '100%',
                boxSizing: 'border-box'
              }}
            >
              <Field
                type="custom"
                label="Pinterest Board or Section URL"
                required
                helper="pinterest.com/<user>/<board>/, section link, or pin.it short link"
              >
                <input
                  id="pinterest-board-url-input"
                  name="board_url"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://www.pinterest.com/intentdigital/japandi-kitchens/"
                  value={boardUrlInput}
                  onChange={(e) => {
                    setBoardUrlInput(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-input, 14px)',
                    border: '1px solid var(--border-strong)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    backgroundColor: 'var(--cream)',
                    color: 'var(--espresso)',
                    minHeight: '44px',
                    outline: 'none'
                  }}
                  required
                />
              </Field>

              <Field
                type="custom"
                label="Board Title (Optional)"
                helper="Auto-derived from URL slug if left blank"
              >
                <input
                  id="pinterest-board-title-input"
                  name="board_title"
                  type="text"
                  placeholder="e.g. Japandi Kitchens & Warm Wood"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-input, 14px)',
                    border: '1px solid var(--border-strong)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    backgroundColor: 'var(--cream)',
                    color: 'var(--espresso)',
                    minHeight: '44px',
                    outline: 'none'
                  }}
                />
              </Field>
            </div>

            {formError && (
              <div
                id="pinterest-form-error"
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--negative-bg, #F5E6E3)',
                  border: '1px solid var(--negative, #8A2A1E)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--negative, #8A2A1E)',
                  lineHeight: 1.4
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || isResolving}
              >
                {isResolving ? 'Checking link…' : isSubmitting ? 'Saving...' : 'SAVE BOARD →'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting || isResolving}
                onClick={() => {
                  setIsFormOpen(false);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Loading state */}
      {loading && boards.length === 0 && (
        <div
          style={{
            padding: '48px 0',
            textAlign: 'center',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: 'var(--muted)'
          }}
        >
          Loading inspiration boards...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          style={{
            padding: '24px',
            backgroundColor: 'var(--negative-bg, #F5E6E3)',
            border: '1px solid var(--negative, #8A2A1E)',
            borderRadius: 'var(--radius-card, 20px)',
            color: 'var(--negative, #8A2A1E)',
            fontFamily: 'var(--font-sans)',
            marginBottom: '24px'
          }}
        >
          <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600 }}>
            Unable to load boards
          </h4>
          <p style={{ margin: 0, fontSize: '13px' }}>{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && boards.length === 0 && (
        <EmptyState
          title="Bring in your Pinterest boards"
          description="Curate textures, materials, and architectural direction directly alongside your project budgets and specs. In Pinterest, open any board, click Share → Copy link, and paste the URL above. Note that secret boards cannot be embedded."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setIsFormOpen(true);
                setFormError(null);
              }}
            >
              + ADD YOUR FIRST BOARD →
            </Button>
          }
        />
      )}

      {/* Boards Grid */}
      {!loading && boards.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))',
            gap: '24px',
            alignItems: 'start',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {boards.map((board, idx) => (
            <div
              key={board.id}
              style={{
                backgroundColor: 'var(--white, #FFFFFF)',
                border: '1px solid #E4DDD3',
                borderRadius: 'var(--radius-card, 20px)',
                padding: '24px',
                boxShadow: '0 10px 30px rgba(30, 21, 9, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxSizing: 'border-box',
                maxWidth: '100%',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(30, 21, 9, 0.09)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(30, 21, 9, 0.05)';
              }}
            >
              {/* Card Header: Title + Controls */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: '1 1 auto', minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '22px',
                        fontWeight: 600,
                        color: 'var(--espresso)',
                        margin: 0,
                        lineHeight: 1.2
                      }}
                    >
                      {board.title}
                    </h3>
                    {board.kind === 'section' && (
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '10px',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          backgroundColor: 'var(--sand)',
                          border: '1px solid var(--border)',
                          color: 'var(--muted)'
                        }}
                      >
                        Section
                      </span>
                    )}
                  </div>
                  <a
                    href={board.board_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--burgundy)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    View on Pinterest →
                  </a>
                </div>

                {/* Reorder and Remove controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    title="Move up"
                    aria-label="Move board up"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-pill)',
                      backgroundColor: 'var(--beige)',
                      border: '1px solid var(--border)',
                      color: 'var(--espresso)',
                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                      opacity: idx === 0 ? 0.4 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px'
                    }}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === boards.length - 1}
                    title="Move down"
                    aria-label="Move board down"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-pill)',
                      backgroundColor: 'var(--beige)',
                      border: '1px solid var(--border)',
                      color: 'var(--espresso)',
                      cursor: idx === boards.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: idx === boards.length - 1 ? 0.4 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px'
                    }}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveBoard(board.id)}
                    title="Remove board"
                    aria-label="Remove board"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-pill)',
                      backgroundColor: 'var(--negative-bg, #F5E6E3)',
                      border: '1px solid var(--negative, #8A2A1E)',
                      color: 'var(--negative, #8A2A1E)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      marginLeft: '4px'
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Responsive Board Embed */}
              <PinterestBoardEmbed
                boardUrl={board.board_url}
                title={board.title}
                kind={board.kind}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
