import React, { useState, useEffect, useRef } from 'react';

// Helper to format date to local string like "24 Jul 2026 at 9:00 AM"
const formatLocal = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Helper for `<input type="datetime-local">` which expects "YYYY-MM-DDThh:mm" in local time
const toLocalDatetimeInput = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d)) return '';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Blogs() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState([]);
  const [activePostId, setActivePostId] = useState(null);
  
  const [editForm, setEditForm] = useState(null);
  const [localScheduledFor, setLocalScheduledFor] = useState('');
  
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // View mode
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [isMobile, setIsMobile] = useState(false);

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && viewMode === 'calendar') {
        setViewMode('list');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/blog');
      const data = await res.json();
      if (res.ok) {
        setPosts(data || []);
      } else {
        setErrorMsg('Failed to load posts.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleEditClick = (post) => {
    setActivePostId(post.id);
    setEditForm({ ...post });
    setLocalScheduledFor(post.scheduled_for ? toLocalDatetimeInput(post.scheduled_for) : '');
    setStatusMessage('');
    setErrorMsg('');
  };

  const handleFormChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handleNewPost = async () => {
    setSaving(true);
    setStatusMessage('');
    setErrorMsg('');
    try {
      const res = await fetch('/api/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' })
      });
      const newPost = await res.json();
      if (res.ok) {
        await fetchPosts();
        handleEditClick(newPost);
      } else {
        setErrorMsg(newPost.error || 'Failed to create post.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const savePost = async (e, action = 'update') => {
    if (e) e.preventDefault();
    if (!editForm) return;
    
    setSaving(true);
    setStatusMessage('');
    setErrorMsg('');

    let payloadScheduledFor = editForm.scheduled_for;

    if (action === 'schedule') {
      if (!localScheduledFor) {
        setErrorMsg('Please select a date and time to schedule.');
        setSaving(false);
        return;
      }
      // Convert local datetime string to UTC ISO string
      const d = new Date(localScheduledFor);
      if (isNaN(d)) {
        setErrorMsg('Invalid date time.');
        setSaving(false);
        return;
      }
      if (d <= new Date()) {
        setErrorMsg('Scheduled time must be in the future.');
        setSaving(false);
        return;
      }
      payloadScheduledFor = d.toISOString();
    }

    try {
      const res = await fetch('/api/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action, 
          id: editForm.id,
          title: editForm.title,
          excerpt: editForm.excerpt,
          content: editForm.content,
          cover_image_url: editForm.cover_image_url,
          scheduled_for: payloadScheduledFor
        })
      });

      const data = await res.json();
      if (res.ok) {
        let msg = 'Draft saved successfully.';
        if (action === 'publish') msg = 'Post published successfully.';
        if (action === 'unpublish') msg = 'Post unpublished successfully.';
        if (action === 'schedule') msg = 'Post scheduled successfully.';
        if (action === 'unschedule') msg = 'Post unscheduled successfully.';
        
        setStatusMessage(msg);
        setEditForm({ ...data });
        setLocalScheduledFor(data.scheduled_for ? toLocalDatetimeInput(data.scheduled_for) : '');
        await fetchPosts();
      } else {
        setErrorMsg(data.error || 'Failed to save post.');
      }
    } catch (err) {
      setErrorMsg('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const uploadCoverImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('File too large (max 5MB)');
      return;
    }
    setSaving(true);
    setStatusMessage('Uploading image...');
    try {
      const { upload } = await import('@vercel/blob/client');
      const newBlob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload-blog-image',
      });
      setEditForm(prev => ({ ...prev, cover_image_url: newBlob.url }));
      setStatusMessage('Image uploaded successfully. Remember to save.');
    } catch (err) {
      console.error(err);
      setErrorMsg('Upload failed. ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Grouped Lists
  const scheduledPosts = posts.filter(p => p.status === 'scheduled').sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
  const draftPosts = posts.filter(p => p.status === 'draft').sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const publishedPosts = posts.filter(p => p.status === 'published').sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  // Calendar Helpers
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => <div key={`blank-${i}`} className="cal-cell empty"></div>);
    const days = [];
    
    const todayStr = new Date().toDateString();

    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d);
      const isToday = cellDate.toDateString() === todayStr;
      
      // Find posts for this day (scheduled or published)
      const dayPosts = posts.filter(p => {
        if (p.status === 'draft') return false;
        const targetDate = p.status === 'scheduled' ? new Date(p.scheduled_for) : new Date(p.published_at);
        return targetDate.getFullYear() === year && targetDate.getMonth() === month && targetDate.getDate() === d;
      });

      days.push(
        <div key={d} className={`cal-cell ${isToday ? 'today' : ''}`} style={{ 
          border: '1px solid rgba(52, 41, 42, 0.1)', 
          minHeight: '100px', 
          padding: '8px',
          backgroundColor: isToday ? 'rgba(65, 16, 27, 0.03)' : '#fff'
        }}>
          <div style={{ fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--secondary-color)' : '#34292A', marginBottom: '8px' }}>
            {d}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {dayPosts.map(p => (
              <div 
                key={p.id} 
                onClick={() => handleEditClick(p)}
                style={{
                  fontSize: '10px',
                  fontFamily: 'Montserrat, sans-serif',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  backgroundColor: p.status === 'scheduled' ? 'var(--secondary-color)' : 'rgba(52,41,42,0.1)',
                  color: p.status === 'scheduled' ? '#fff' : '#34292A',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {p.title}
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    const totalSlots = blanks.length + days.length;
    const endBlanksCount = totalSlots % 7 === 0 ? 0 : 7 - (totalSlots % 7);
    const endBlanks = Array.from({ length: endBlanksCount }, (_, i) => <div key={`end-blank-${i}`} className="cal-cell empty"></div>);
    
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '24px', color: '#34292A', margin: 0 }}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={prevMonth} className="btn-cherry-outline" style={{ padding: '8px 16px', fontSize: '11px' }}>&lt;</button>
            <button onClick={goToday} className="btn-cherry-outline" style={{ padding: '8px 16px', fontSize: '11px' }}>Today</button>
            <button onClick={nextMonth} className="btn-cherry-outline" style={{ padding: '8px 16px', fontSize: '11px' }}>&gt;</button>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'rgba(52, 41, 42, 0.6)' }}>{day}</div>
          ))}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {blanks}
          {days}
          {endBlanks}
        </div>

        {draftPosts.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <h4 style={{ fontFamily: 'Montserrat', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Undated Drafts</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {draftPosts.map(p => (
                <div 
                  key={p.id}
                  onClick={() => handleEditClick(p)}
                  style={{
                    fontSize: '11px',
                    fontFamily: 'Montserrat, sans-serif',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(52,41,42,0.1)',
                    color: '#34292A',
                    cursor: 'pointer'
                  }}
                >
                  {p.title}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderListGroup = (title, items, isScheduled = false) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ fontFamily: 'Montserrat', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px', color: '#34292A' }}>
          {title} ({items.length})
        </h4>
        <div style={{ display: 'grid', gap: '8px' }}>
          {items.map(p => (
            <div 
              key={p.id} 
              style={{
                border: '1px solid rgba(52, 41, 42, 0.2)',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: activePostId === p.id ? 'rgba(52, 41, 42, 0.03)' : 'transparent',
                cursor: 'pointer'
              }}
              onClick={() => handleEditClick(p)}
            >
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#34292A' }}>{p.title}</h3>
                <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)' }}>
                  {p.status === 'scheduled' ? `Scheduled for ${formatLocal(p.scheduled_for)}` : 
                   p.status === 'published' ? `Published ${formatLocal(p.published_at)}` : 
                   `Last edited ${formatLocal(p.updated_at)}`}
                </span>
              </div>
              <div>
                {p.status === 'published' ? (
                  <span className="badge-cherry" style={{ width: '120px' }}>Published</span>
                ) : p.status === 'scheduled' ? (
                  <span className="badge-cherry" style={{ width: '120px' }}>Scheduled</span>
                ) : (
                  <span className="badge-cherry" style={{ width: '120px', backgroundColor: 'rgba(52,41,42,0.1)', color: '#34292A' }}>Draft</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading && posts.length === 0) {
    return <div style={{ padding: '24px' }}>Loading blogs...</div>;
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ 
        fontFamily: '"Atelier Fleur", serif', 
        fontSize: '42px', 
        letterSpacing: '-0.02em', 
        color: '#34292A',
        margin: '0 0 32px 0'
      }}>
        Blogs
      </h1>

      {errorMsg && <p style={{ color: 'red', marginBottom: '16px' }}>{errorMsg}</p>}
      {statusMessage && <p style={{ color: '#34292A', fontWeight: 500, marginBottom: '16px' }}>{statusMessage}</p>}

      <div style={{ 
        backgroundColor: '#fff', 
        border: '1px solid rgba(52, 41, 42, 0.1)', 
        borderRadius: '8px', 
        padding: '32px',
        marginBottom: '32px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <h2 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '28px', color: '#34292A', margin: 0 }}>All Posts</h2>
            {!isMobile && (
              <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(52,41,42,0.2)' }}>
                <button 
                  onClick={() => setViewMode('list')} 
                  style={{ padding: '6px 12px', fontSize: '11px', border: 'none', background: viewMode === 'list' ? 'rgba(52,41,42,0.1)' : '#fff', cursor: 'pointer', fontFamily: 'Montserrat', fontWeight: 600, color: '#34292A' }}
                >
                  LIST
                </button>
                <button 
                  onClick={() => setViewMode('calendar')} 
                  style={{ padding: '6px 12px', fontSize: '11px', border: 'none', borderLeft: '1px solid rgba(52,41,42,0.2)', background: viewMode === 'calendar' ? 'rgba(52,41,42,0.1)' : '#fff', cursor: 'pointer', fontFamily: 'Montserrat', fontWeight: 600, color: '#34292A' }}
                >
                  CALENDAR
                </button>
              </div>
            )}
          </div>
          <button className="btn-cherry" onClick={handleNewPost} disabled={saving}>
            New Post
          </button>
        </div>
        
        {viewMode === 'calendar' && !isMobile ? (
          renderCalendar()
        ) : (
          <div>
            {posts.length === 0 && <p style={{ color: 'rgba(52, 41, 42, 0.6)' }}>No posts found.</p>}
            {renderListGroup('Scheduled', scheduledPosts, true)}
            {renderListGroup('Drafts', draftPosts)}
            {renderListGroup('Published', publishedPosts)}
          </div>
        )}
      </div>

      {editForm && (
        <div style={{ 
          backgroundColor: '#fff', 
          border: '1px solid rgba(52, 41, 42, 0.1)', 
          borderRadius: '8px', 
          padding: '32px'
        }}>
          <h2 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '28px', color: '#34292A', margin: '0 0 24px 0' }}>
            Edit Post
          </h2>

          <div style={{ marginBottom: '24px' }}>
            <label className="form-pill-label">Cover Image</label>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              {editForm.cover_image_url && (
                <img 
                  src={editForm.cover_image_url} 
                  alt="Cover Preview" 
                  style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(52,41,42,0.1)' }}
                />
              )}
              <div>
                <input 
                  type="file" 
                  accept="image/jpeg, image/png, image/webp"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={uploadCoverImage}
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-cherry-outline"
                  disabled={saving}
                >
                  Upload Cover Image
                </button>
                <p style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)', marginTop: '8px', fontFamily: 'Montserrat' }}>JPG, PNG, WebP up to 5MB.</p>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => savePost(e, 'update')} style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label className="form-pill-label" htmlFor="title">Title</label>
              <input 
                className="form-pill-input" 
                id="title" 
                name="title" 
                value={editForm.title || ''} 
                onChange={handleFormChange} 
                required
              />
            </div>
            <div>
              <label className="form-pill-label" htmlFor="excerpt">Excerpt</label>
              <input 
                className="form-pill-input" 
                id="excerpt" 
                name="excerpt" 
                value={editForm.excerpt || ''} 
                onChange={handleFormChange} 
                required
              />
            </div>
            <div>
              <label className="form-pill-label" htmlFor="content">Content</label>
              <textarea 
                className="form-pill-input" 
                id="content" 
                name="content" 
                value={editForm.content || ''} 
                onChange={handleFormChange} 
                rows={20}
                style={{ 
                  resize: 'vertical',
                  borderRadius: '12px',
                  padding: '16px',
                  fontFamily: 'Montserrat, sans-serif'
                }}
                required
              />
            </div>

            {editForm.status !== 'published' && (
              <div style={{ marginTop: '16px', borderTop: '1px solid rgba(52,41,42,0.1)', paddingTop: '16px' }}>
                <label className="form-pill-label" htmlFor="schedule_date">Schedule Publication</label>
                <input 
                  type="datetime-local" 
                  id="schedule_date"
                  className="form-pill-input"
                  style={{ width: 'fit-content' }}
                  value={localScheduledFor}
                  onChange={(e) => setLocalScheduledFor(e.target.value)}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button type="button" onClick={(e) => savePost(e, 'update')} className="btn-cherry" disabled={saving}>
                Save Draft
              </button>
              
              {editForm.status === 'published' ? (
                <button type="button" onClick={(e) => savePost(e, 'unpublish')} className="btn-cherry-outline" disabled={saving}>
                  Unpublish
                </button>
              ) : (
                <>
                  <button 
                    type="button" 
                    onClick={(e) => savePost(e, 'schedule')} 
                    className="btn-cherry" 
                    disabled={saving || !localScheduledFor || new Date(localScheduledFor) <= new Date()}
                  >
                    Schedule
                  </button>
                  {editForm.status === 'scheduled' && (
                    <button type="button" onClick={(e) => savePost(e, 'unschedule')} className="btn-cherry-outline" disabled={saving}>
                      Unschedule
                    </button>
                  )}
                  <button type="button" onClick={(e) => savePost(e, 'publish')} className="btn-cherry" disabled={saving}>
                    Publish Now
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
