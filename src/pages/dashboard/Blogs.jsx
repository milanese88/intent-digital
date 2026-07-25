import React, { useState, useEffect, useRef } from 'react';

export default function Blogs() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState([]);
  const [activePostId, setActivePostId] = useState(null);
  
  const [editForm, setEditForm] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);

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

    try {
      const res = await fetch('/api/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action, // 'update', 'publish', or 'unpublish'
          id: editForm.id,
          title: editForm.title,
          excerpt: editForm.excerpt,
          content: editForm.content,
          cover_image_url: editForm.cover_image_url
        })
      });

      const data = await res.json();
      if (res.ok) {
        let msg = 'Draft saved successfully.';
        if (action === 'publish') msg = 'Post published successfully.';
        if (action === 'unpublish') msg = 'Post unpublished successfully.';
        
        setStatusMessage(msg);
        setEditForm({ ...data });
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
      // Vercel Blob requires importing upload, but since we have an API route to handle the token generation:
      // Wait, we need to use the '@vercel/blob/client' upload function locally here.
      // Wait, the client-side upload wrapper uses '@vercel/blob/client'.
      // Let's import it if we can, otherwise we use standard fetch to the API.
      // Actually, `@vercel/blob/client` is exactly what was requested.
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
          <h2 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '28px', color: '#34292A', margin: 0 }}>All Posts</h2>
          <button className="btn-cherry" onClick={handleNewPost} disabled={saving}>
            New Post
          </button>
        </div>
        
        <div style={{ display: 'grid', gap: '16px' }}>
          {posts.length === 0 && <p style={{ color: 'rgba(52, 41, 42, 0.6)' }}>No posts found.</p>}
          {posts.map(p => (
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
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
              </div>
              <div>
                {p.status === 'published' ? (
                  <span className="badge-cherry" style={{ width: '120px' }}>
                    Published
                  </span>
                ) : (
                  <span className="badge-cherry" style={{ width: '120px', backgroundColor: 'rgba(52,41,42,0.1)', color: '#34292A' }}>
                    Draft
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
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

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button type="button" onClick={(e) => savePost(e, 'update')} className="btn-cherry" disabled={saving}>
                Save Draft
              </button>
              
              {editForm.status === 'published' ? (
                <button type="button" onClick={(e) => savePost(e, 'unpublish')} className="btn-cherry-outline" disabled={saving}>
                  Unpublish
                </button>
              ) : (
                <button type="button" onClick={(e) => savePost(e, 'publish')} className="btn-cherry" disabled={saving}>
                  Publish
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
