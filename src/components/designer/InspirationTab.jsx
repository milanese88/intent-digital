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
  isValidPinterestBoardUrl,
  normalizePinterestBoardUrl,
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
  const handleAddBoard = async (e) => {
    e?.preventDefault();
    setFormError(null);

    const trimmedUrl = boardUrlInput.trim();
    if (!trimmedUrl) {
      setFormError('Please enter a Pinterest board URL.');
      return;
    }

    if (!isValidPinterestBoardUrl(trimmedUrl)) {
      setFormError('Please enter a valid Pinterest board URL (e.g. pinterest.com/<user>/<board>/ or a pin.it short link).');
      return;
    }

    const normalized = normalizePinterestBoardUrl(trimmedUrl);
    const finalTitle = titleInput.trim() || deriveBoardTitleFromUrl(normalized);

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/designer/pinterest-boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_url: normalized,
          title: finalTitle
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save Pinterest board.');
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
      setFormError(err.message || 'Error saving board.');
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
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 0 var(--space-48) 0' }}>
      {/* Header Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: 'var(--space-24)',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 'var(--space-20)'
        }}
      >
        <div>
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
          onClick={() => setIsFormOpen(!isFormOpen)}
        >
          {isFormOpen ? 'Close &times;' : '+ ADD PINTEREST BOARD \u2192'}
        </Button>
      </div>

      {/* Add Board Form Drawer / Card */}
      {isFormOpen && (
        <Card
          style={{
            marginBottom: 'var(--space-32)',
            border: '1px solid var(--border-strong)',
            backgroundColor: 'var(--white)'
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <h3
              style={{
                margin: '0 0 4px 0',
                fontFamily: 'var(--font-display)',
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--espresso)'
              }}
            >
              Add a Pinterest board
            </h3>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--muted)'
              }}
            >
              Paste any public board link (e.g. <code>pinterest.com/username/board-name/</code> or a <code>pin.it</code> link). Secret boards cannot be embedded.
            </p>
          </div>

          <form onSubmit={handleAddBoard}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
                marginBottom: '16px'
              }}
            >
              <Field
                label="Pinterest Board URL"
                required
                hint="pinterest.com/<user>/<board>/ or pin.it short link"
              >
                <input
                  type="url"
                  placeholder="https://www.pinterest.com/intentdigital/japandi-kitchens/"
                  value={boardUrlInput}
                  onChange={(e) => {
                    setBoardUrlInput(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-input, 14px)',
                    border: '1px solid var(--border-strong)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    backgroundColor: 'var(--cream)',
                    color: 'var(--espresso)'
                  }}
                  required
                />
              </Field>

              <Field
                label="Board Title (Optional)"
                hint="Auto-derived from URL slug if left blank"
              >
                <input
                  type="text"
                  placeholder="e.g. Japandi Kitchens & Warm Wood"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-input, 14px)',
                    border: '1px solid var(--border-strong)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    backgroundColor: 'var(--cream)',
                    color: 'var(--espresso)'
                  }}
                />
              </Field>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--negative-bg, #F5E6E3)',
                  border: '1px solid var(--negative, #8A2A1E)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--negative, #8A2A1E)'
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'SAVE BOARD \u2192'}
              </Button>
              <Button
                type="button"
                variant="secondary"
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
          description="Curate textures, materials, and architectural direction directly alongside your project budgets and specs. In Pinterest, open any board, click Share &rarr; Copy link, and paste the URL above. Note that secret boards cannot be embedded."
          action={
            <Button
              variant="primary"
              onClick={() => setIsFormOpen(true)}
            >
              + ADD YOUR FIRST BOARD \u2192
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
            alignItems: 'start'
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
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '22px',
                      fontWeight: 600,
                      color: 'var(--espresso)',
                      margin: '0 0 2px 0',
                      lineHeight: 1.2
                    }}
                  >
                    {board.title}
                  </h3>
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
                    View on Pinterest &rarr;
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
                    &larr;
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
                    &rarr;
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
                    &times;
                  </button>
                </div>
              </div>

              {/* Responsive Board Embed */}
              <PinterestBoardEmbed
                boardUrl={board.board_url}
                title={board.title}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
