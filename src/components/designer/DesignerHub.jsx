import React, { useState, useEffect, useRef } from 'react';
import AddressAutocomplete from '../investor/AddressAutocomplete.jsx';
import {
  Button,
  Pill,
  Card,
  StatTile,
  Eyebrow,
  SectionHeading,
  Tabs,
  SidePanel,
  Field,
  EmptyState,
  DarkBand
} from '../ui';

const PROJECT_TYPES = [
  { value: 'client', label: 'Client' },
  { value: 'investor', label: 'Investor' },
  { value: 'concept', label: 'Concept' },
  { value: 'coursework', label: 'Coursework' }
];

const STATUS_PILL_MAP = {
  concept: { variant: 'neutral', label: 'Concept' },
  in_design: { variant: 'info', label: 'In Design' },
  in_progress: { variant: 'warning', label: 'In Progress' },
  complete: { variant: 'positive', label: 'Complete' },
  on_hold: { variant: 'neutral', label: 'On Hold' }
};

const STYLE_OPTIONS = [
  'Modern Organic',
  'Warm Minimalist',
  'Japandi',
  'Coastal Contemporary',
  'Mid-Century Modern',
  'Transitional',
  'Mediterranean Revival',
  'Industrial Chic'
];

const QUICK_ROOMS = [
  'Kitchen',
  'Primary bath',
  'Guest bath',
  'Living room',
  'Bedrooms',
  'Front of house'
];

const DESIGNER_TABS = [
  { id: 'projects', label: 'Projects' },
  { id: 'studio', label: 'Design studio' },
  { id: 'budget', label: 'Budget & costs' },
  { id: 'sourcing', label: 'Sourcing library' },
  { id: 'portfolio', label: 'Portfolio' }
];

export default function DesignerHub({ setActiveDashboardTab }) {
  const [projects, setProjects] = useState([]);
  const [investorProperties, setInvestorProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab & selected project from URL
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('designer_tab') || 'projects';
    }
    return 'projects';
  });

  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('project_id') || null;
    }
    return null;
  });

  // Slide-in panel state (add / edit)
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formName, setFormName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formType, setFormType] = useState('concept');
  const [formStatus, setFormStatus] = useState('concept');
  const [formStyle, setFormStyle] = useState('');
  const [formTargetBudget, setFormTargetBudget] = useState('');
  const [formContingencyPct, setFormContingencyPct] = useState('10');
  const [formInvestorPropId, setFormInvestorPropId] = useState('');
  const [formCoverUrl, setFormCoverUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formRooms, setFormRooms] = useState([]);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Project switcher dropdown state
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef(null);

  // Sync state with URL params
  const updateUrl = (tab, projId) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'designer');
    if (tab) {
      url.searchParams.set('designer_tab', tab);
    }
    if (projId) {
      url.searchParams.set('project_id', projId);
    } else {
      url.searchParams.delete('project_id');
    }
    window.history.replaceState({}, '', url.toString());
  };

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    updateUrl(newTab, selectedProjectId);
  };

  const handleSelectProject = (projId, andGoToStudio = false) => {
    setSelectedProjectId(projId);
    const targetTab = andGoToStudio ? 'studio' : activeTab;
    if (andGoToStudio) {
      setActiveTab('studio');
    }
    updateUrl(targetTab, projId);
    setSwitcherOpen(false);
  };

  // Close switcher dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch projects and investor properties on load
  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/designer/projects');
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized. Please log in to access Designer Hub.');
        }
        throw new Error(`Failed to load projects (HTTP ${res.status})`);
      }
      const data = await res.json();
      const list = data.projects || [];
      setProjects(list);

      // Auto-select first project if none selected and projects exist
      setSelectedProjectId(prev => {
        if (prev && list.some(p => p.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (err) {
      console.error('fetchProjects error:', err);
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvestorProperties = async () => {
    try {
      const res = await fetch('/api/investor/properties');
      if (res.ok) {
        const data = await res.json();
        setInvestorProperties(data.properties || []);
      }
    } catch (err) {
      console.warn('Could not load investor properties for linking:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchInvestorProperties();
  }, []);

  // Handle URL pre-fill from Investor Studio ("Design this property →")
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const linkedPropId = params.get('new_project_property_id');
    if (linkedPropId && investorProperties.length > 0) {
      const prop = investorProperties.find(p => p.id === linkedPropId);
      if (prop) {
        handleOpenNewProject(prop);
        const url = new URL(window.location.href);
        url.searchParams.delete('new_project_property_id');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [investorProperties]);

  // Current selected project object
  const currentProject = projects.find(p => p.id === selectedProjectId) || projects[0] || null;

  // Open New Project Drawer
  const handleOpenNewProject = (prefillProp = null) => {
    setEditingProject(null);
    if (prefillProp) {
      setFormName(`${prefillProp.address} Design`);
      setFormLocation(`${prefillProp.address}${prefillProp.city ? ', ' + prefillProp.city : ''}`);
      setFormType('investor');
      setFormStatus('concept');
      setFormStyle('');
      setFormTargetBudget(prefillProp.list_price ? String(Math.round(Number(prefillProp.list_price) * 0.1)) : '');
      setFormContingencyPct('10');
      setFormInvestorPropId(prefillProp.id);
      setFormCoverUrl(prefillProp.cover_photo_url || '');
      setFormNotes(`Linked to Investor Studio property at ${prefillProp.address}.`);
      setFormRooms(['Kitchen', 'Primary bath', 'Living room', 'Bedrooms']);
    } else {
      setFormName('');
      setFormLocation('');
      setFormType('concept');
      setFormStatus('concept');
      setFormStyle('');
      setFormTargetBudget('');
      setFormContingencyPct('10');
      setFormInvestorPropId('');
      setFormCoverUrl('');
      setFormNotes('');
      setFormRooms([]);
    }
    setFormError(null);
    setIsPanelOpen(true);
  };

  // Open Edit Project Drawer
  const handleOpenEditProject = (proj, e) => {
    if (e) e.stopPropagation();
    setEditingProject(proj);
    setFormName(proj.name || '');
    setFormLocation(proj.location || '');
    setFormType(proj.project_type || 'concept');
    setFormStatus(proj.status || 'concept');
    setFormStyle(proj.style || '');
    setFormTargetBudget(proj.target_budget != null ? String(proj.target_budget) : '');
    setFormContingencyPct(proj.contingency_pct != null ? String(proj.contingency_pct) : '10');
    setFormInvestorPropId(proj.investor_property_id || '');
    setFormCoverUrl(proj.cover_url || '');
    setFormNotes(proj.notes || '');
    setFormRooms([]);
    setFormError(null);
    setIsPanelOpen(true);
  };

  // Save Project (POST or PUT)
  const handleSaveProject = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Project name is required.');
      return;
    }

    setFormSaving(true);
    setFormError(null);

    const payload = {
      name: formName.trim(),
      location: formLocation.trim() || null,
      project_type: formType,
      status: formStatus,
      style: formStyle.trim() || null,
      target_budget: formTargetBudget ? Number(formTargetBudget.replace(/[$,]/g, '')) : null,
      contingency_pct: formContingencyPct ? Number(formContingencyPct.replace(/[%,]/g, '')) : 10,
      investor_property_id: formInvestorPropId || null,
      cover_url: formCoverUrl.trim() || null,
      notes: formNotes.trim() || null,
      initial_rooms: editingProject ? [] : formRooms
    };

    try {
      let res;
      if (editingProject) {
        res = await fetch(`/api/designer/projects?id=${editingProject.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/designer/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save project');
      }

      const result = await res.json();
      setIsPanelOpen(false);
      await fetchProjects();

      if (result.project?.id) {
        handleSelectProject(result.project.id);
      }
    } catch (err) {
      setFormError(err.message || 'An error occurred while saving.');
    } finally {
      setFormSaving(false);
    }
  };

  // Delete Project with confirmation
  const handleDeleteProject = async (proj, e) => {
    if (e) e.stopPropagation();
    const confirmed = window.confirm('Delete this project and all its rooms, images and items?');
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/designer/projects?id=${proj.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to delete project');
      }
      if (selectedProjectId === proj.id) {
        setSelectedProjectId(null);
      }
      await fetchProjects();
    } catch (err) {
      alert(`Error deleting project: ${err.message}`);
    }
  };

  // Calculate stats for Projects Tab
  const activeCount = projects.filter(p => p.status === 'in_design' || p.status === 'in_progress').length;
  const conceptCount = projects.filter(p => p.status === 'concept').length;
  const portfolioCount = projects.filter(p => p.status === 'complete').length;
  const totalBudgets = projects.reduce((acc, p) => acc + (Number(p.target_budget) || 0), 0);

  const formatCurrency = (val) => {
    if (val == null || isNaN(val)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: 'var(--cream)', position: 'relative' }}>
      {/* ========================================================================= */}
      {/* 4. HEADER (shared by all Designer Hub tabs) — Espresso Dark Band           */}
      {/* ========================================================================= */}
      <DarkBand
        maxWidth="1200px"
        paddingTop="64px"
        paddingBottom="0px"
        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}
      >
        <Eyebrow onDark>DESIGNER HUB · STUDIO</Eyebrow>

        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-24)',
          marginBottom: 'var(--space-32)'
        }}>
          <div>
            <SectionHeading level="h1" onDark>
              Design the space.{' '}
              <em style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 400,
                color: 'var(--terracotta-soft)'
              }}>
                Own the budget.
              </em>
            </SectionHeading>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)', flexWrap: 'wrap' }}>
            <Button
              variant="outline-on-dark"
              disabled
              title="Coming in Stage 2"
            >
              + NEW MOOD BOARD
            </Button>

            <Button
              variant="accent"
              onClick={() => handleOpenNewProject()}
            >
              + NEW PROJECT
            </Button>
          </div>
        </div>

        {/* Project Switcher Bar (when projects exist) */}
        {currentProject && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(233, 223, 210, 0.12)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 20px',
            marginBottom: 'var(--space-8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              {/* Switcher title with dropdown */}
              <div style={{ position: 'relative' }} ref={switcherRef}>
                <div
                  onClick={() => setSwitcherOpen(prev => !prev)}
                  title="Switch project"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '22px',
                    fontWeight: 400,
                    color: 'var(--on-dark)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>{currentProject.name}</span>
                  <span style={{ fontSize: '13px', opacity: 0.6 }}>▾</span>
                </div>

                {switcherOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    backgroundColor: 'var(--espresso)',
                    border: '1px solid rgba(233, 223, 210, 0.2)',
                    borderRadius: '12px',
                    padding: '8px 0',
                    boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
                    zIndex: 100,
                    minWidth: '260px'
                  }}>
                    <div style={{
                      padding: '6px 16px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '10px',
                      letterSpacing: 'var(--letter-spacing-label)',
                      textTransform: 'uppercase',
                      color: 'var(--eyebrow-on-dark)',
                      opacity: 0.5
                    }}>
                      YOUR PROJECTS ({projects.length})
                    </div>
                    {projects.map(p => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProject(p.id)}
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          backgroundColor: p.id === currentProject.id ? 'rgba(192, 90, 42, 0.2)' : 'transparent',
                          color: p.id === currentProject.id ? 'var(--terracotta-soft)' : 'var(--on-dark)',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (p.id !== currentProject.id) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                        }}
                        onMouseLeave={(e) => {
                          if (p.id !== currentProject.id) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px' }}>{p.name}</span>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', opacity: 0.6 }}>
                          {p.location || 'No location'} · {p.project_type}
                        </span>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid rgba(233, 223, 210, 0.1)', marginTop: '6px', paddingTop: '6px' }}>
                      <div
                        onClick={() => { setSwitcherOpen(false); handleOpenNewProject(); }}
                        style={{
                          padding: '8px 16px',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '11px',
                          color: 'var(--terracotta-soft)',
                          fontWeight: 600
                        }}
                      >
                        + Create new project
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--eyebrow-on-dark)',
                opacity: 0.75,
                letterSpacing: '0.04em'
              }}>
                {currentProject.location ? `${currentProject.location} · ` : ''}
                <span style={{ textTransform: 'capitalize' }}>{currentProject.project_type}</span>
                {currentProject.style ? ` · ${currentProject.style}` : ''}
              </div>
            </div>

            {/* Linked to Investor Studio pill */}
            {currentProject.investor_property_id && (
              <button
                type="button"
                onClick={() => {
                  if (typeof setActiveDashboardTab === 'function') {
                    setActiveDashboardTab('investor');
                  }
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'investor');
                    url.searchParams.set('property', currentProject.investor_property_id);
                    window.history.pushState({}, '', url.toString());
                    window.location.reload();
                  }
                }}
                title="Open this property in Investor Studio"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(192, 90, 42, 0.15)',
                  border: '1px solid rgba(192, 90, 42, 0.35)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px 12px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--terracotta-soft)',
                  cursor: 'pointer',
                  minHeight: '32px',
                  transition: 'all 0.2s ease',
                  outline: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(192, 90, 42, 0.28)';
                  e.currentTarget.style.borderColor = 'var(--terracotta)';
                  e.currentTarget.style.color = 'var(--cream)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(192, 90, 42, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(192, 90, 42, 0.35)';
                  e.currentTarget.style.color = 'var(--terracotta-soft)';
                }}
              >
                <span>Linked to Investor Studio · {currentProject.investor_property_address || 'Property'} &rarr;</span>
              </button>
            )}
          </div>
        )}

        {/* Bottom Edge Tabs: Sitting on edge of band */}
        <Tabs
          tabs={DESIGNER_TABS}
          activeTab={activeTab}
          onChange={handleTabChange}
          variant="on-dark"
        />
      </DarkBand>

      {/* ========================================================================= */}
      {/* 5. TAB CONTENT                                                            */}
      {/* ========================================================================= */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px 80px 32px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', fontFamily: 'var(--font-sans)' }}>
            <p style={{ color: 'var(--muted)' }}>Loading Designer Hub...</p>
          </div>
        )}

        {error && (
          <div style={{
            padding: '16px 20px',
            backgroundColor: 'var(--negative-bg)',
            border: '1px solid var(--negative)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--negative)',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            marginBottom: 'var(--space-24)'
          }}>
            {error}
          </div>
        )}

        {!loading && activeTab === 'projects' && (
          <div>
            {/* Stat tiles using shared StatTile */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-20)',
              marginBottom: 'var(--space-32)'
            }}>
              <StatTile label="Active Projects" value={activeCount} />
              <StatTile label="Concepts" value={conceptCount} />
              <StatTile label="In Portfolio" value={portfolioCount} />
              <StatTile label="Budgets Tracked" value={formatCurrency(totalBudgets)} />
            </div>

            {/* Empty State using shared EmptyState (No Emojis) */}
            {projects.length === 0 ? (
              <EmptyState
                title="No projects yet"
                description="Start with a concept or link a property from Investor Studio to begin tracking design and budgets."
                action={
                  <Button variant="accent" onClick={() => handleOpenNewProject()}>
                    + Create your first project
                  </Button>
                }
              />
            ) : (
              /* Projects Grid using shared Card */
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: 'var(--space-24)'
              }}>
                {projects.map(proj => {
                  const statusConfig = STATUS_PILL_MAP[proj.status] || STATUS_PILL_MAP.concept;
                  const budgetVal = Number(proj.target_budget) || 0;
                  const contPct = Number(proj.contingency_pct) || 10;
                  const initials = (proj.name || 'P').substring(0, 2).toUpperCase();

                  return (
                    <Card
                      key={proj.id}
                      hoverable
                      onClick={() => handleSelectProject(proj.id, true)}
                      style={{ display: 'flex', flexDirection: 'column' }}
                    >
                      {/* Cover */}
                      <div style={{
                        height: '190px',
                        width: '100%',
                        position: 'relative',
                        backgroundColor: 'var(--espresso)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                      }}>
                        {proj.cover_url ? (
                          <img
                            src={proj.cover_url}
                            alt={proj.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '42px',
                            fontStyle: 'italic',
                            color: 'rgba(255, 255, 255, 0.65)'
                          }}>
                            {initials}
                          </span>
                        )}
                      </div>

                      {/* Card Body */}
                      <div style={{ padding: 'var(--space-24)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 'var(--space-12)'
                        }}>
                          <Pill variant={statusConfig.variant} size="sm">
                            {statusConfig.label}
                          </Pill>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditProject(proj, e)}
                              title="Edit project"
                              aria-label="Edit project"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                padding: '6px',
                                minWidth: '32px',
                                minHeight: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 'var(--radius-pill)',
                                outline: 'none'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--terracotta)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 20h9"/>
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                              </svg>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleDeleteProject(proj, e)}
                              title="Delete project"
                              aria-label="Delete project"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                padding: '6px',
                                minWidth: '32px',
                                minHeight: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 'var(--radius-pill)',
                                outline: 'none'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--negative)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        </div>

                        <SectionHeading level="h3" style={{ marginBottom: '6px' }}>
                          {proj.name}
                        </SectionHeading>

                        <div style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          color: 'var(--muted)',
                          marginBottom: 'var(--space-4)'
                        }}>
                          {proj.location ? `${proj.location} · ` : ''}
                          <span style={{ textTransform: 'capitalize' }}>{proj.project_type}</span>
                          {proj.style ? ` · ${proj.style}` : ''}
                        </div>

                        {proj.investor_property_address && (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginBottom: 'var(--space-12)',
                            fontFamily: 'var(--font-sans)',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--terracotta)'
                          }}>
                            <span>Linked to {proj.investor_property_address}</span>
                          </div>
                        )}

                        <div style={{
                          marginTop: 'auto',
                          paddingTop: 'var(--space-4)',
                          borderTop: '1px solid rgba(52, 41, 42, 0.08)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          color: 'var(--espresso)'
                        }}>
                          <span>
                            <strong>{proj.room_count || 0}</strong> {Number(proj.room_count) === 1 ? 'room' : 'rooms'}
                          </span>

                          <span style={{ textAlign: 'right' }}>
                            {budgetVal > 0 ? (
                              <span>
                                <strong>{formatCurrency(budgetVal)}</strong>
                                <span style={{ opacity: 0.6, fontSize: '11px', marginLeft: '4px' }}>
                                  +{contPct}% cont.
                                </span>
                              </span>
                            ) : (
                              <span style={{ opacity: 0.5 }}>No budget set</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Placeholder for tabs other than Projects (No Emojis) */}
        {!loading && activeTab !== 'projects' && (
          <EmptyState
            title={DESIGNER_TABS.find(t => t.id === activeTab)?.label}
            description="Coming in the next stage."
            icon={
              <Pill variant="warning" size="md">STAGE 2 FEATURE</Pill>
            }
            action={
              currentProject ? (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--sand)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  color: 'var(--espresso)'
                }}>
                  <span>Active project: <strong>{currentProject.name}</strong></span>
                </div>
              ) : null
            }
          />
        )}
      </main>

      {/* ========================================================================= */}
      {/* 5b. SLIDE-IN ADD / EDIT PROJECT PANEL (Using shared SidePanel & Field)    */}
      {/* ========================================================================= */}
      <SidePanel
        isOpen={isPanelOpen}
        onClose={() => !formSaving && setIsPanelOpen(false)}
        eyebrow="DESIGNER HUB"
        title={editingProject ? 'Edit project' : 'Create new project'}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsPanelOpen(false)}
              disabled={formSaving}
            >
              Cancel
            </Button>

            <Button
              variant="accent"
              type="submit"
              disabled={formSaving}
              onClick={handleSaveProject}
            >
              {formSaving ? 'Saving...' : (editingProject ? 'Update Project' : 'Create Project')}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveProject}>
          {formError && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'var(--negative-bg)',
              border: '1px solid var(--negative)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--negative)',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              marginBottom: 'var(--space-20)'
            }}>
              {formError}
            </div>
          )}

          {/* Name */}
          <Field
            label="Project Name"
            required
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Las Olas Villa Renovation"
          />

          {/* Location (Reusing AddressAutocomplete) */}
          <div style={{ marginBottom: 'var(--space-20)' }}>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-label)',
              fontWeight: 700,
              letterSpacing: 'var(--letter-spacing-label)',
              textTransform: 'uppercase',
              color: 'var(--espresso)',
              marginBottom: 'var(--space-8)'
            }}>
              Location
            </label>
            <AddressAutocomplete
              value={formLocation}
              onChange={(val) => setFormLocation(val)}
              onSelect={(data) => {
                const loc = data.address ? `${data.address}${data.city ? ', ' + data.city : ''}` : data.name || '';
                setFormLocation(loc);
              }}
              placeholder="Address, city or neighborhood"
            />
          </div>

          {/* Type & Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <Field
              type="select"
              label="Project Type"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
            >
              {PROJECT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Field>

            <Field
              type="select"
              label="Status"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
            >
              {Object.entries(STATUS_PILL_MAP).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </Field>
          </div>

          {/* Style */}
          <Field
            label="Design Style"
            list="style-options-list"
            value={formStyle}
            onChange={(e) => setFormStyle(e.target.value)}
            placeholder="e.g. Modern Organic, Japandi, Warm Minimalist"
          />
          <datalist id="style-options-list">
            {STYLE_OPTIONS.map(opt => (
              <option key={opt} value={opt} />
            ))}
          </datalist>

          {/* Budget & Contingency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--space-4)' }}>
            <Field
              label="Target Budget ($)"
              value={formTargetBudget}
              onChange={(e) => setFormTargetBudget(e.target.value)}
              placeholder="e.g. 150000"
            />

            <Field
              type="number"
              min="0"
              max="100"
              label="Contingency %"
              value={formContingencyPct}
              onChange={(e) => setFormContingencyPct(e.target.value)}
              placeholder="10"
            />
          </div>

          {/* Link to Investor Studio Property */}
          <Field
            type="select"
            label="Link to Investor Studio Property"
            value={formInvestorPropId}
            onChange={(e) => setFormInvestorPropId(e.target.value)}
          >
            <option value="">None (Independent project)</option>
            {investorProperties.map(ip => (
              <option key={ip.id} value={ip.id}>
                {ip.address} ({ip.city || 'FL'}) {ip.list_price ? `· $${Number(ip.list_price).toLocaleString()}` : ''}
              </option>
            ))}
          </Field>

          {/* Cover URL */}
          <Field
            type="url"
            label="Cover Image URL (optional)"
            value={formCoverUrl}
            onChange={(e) => setFormCoverUrl(e.target.value)}
            placeholder="https://..."
          />

          {/* Quick-start Rooms (on new project only) */}
          {!editingProject && (
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--beige)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-tile)',
              marginBottom: 'var(--space-20)'
            }}>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-label)',
                fontWeight: 700,
                letterSpacing: 'var(--letter-spacing-label)',
                textTransform: 'uppercase',
                color: 'var(--espresso)',
                marginBottom: 'var(--space-8)'
              }}>
                Quick-Start Rooms (Optional)
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {QUICK_ROOMS.map(room => (
                  <label
                    key={room}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      color: 'var(--espresso)',
                      cursor: 'pointer',
                      minHeight: '32px'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formRooms.includes(room)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormRooms(prev => [...prev, room]);
                        } else {
                          setFormRooms(prev => prev.filter(r => r !== room));
                        }
                      }}
                      style={{ accentColor: 'var(--terracotta)', width: '16px', height: '16px' }}
                    />
                    {room}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <Field
            type="textarea"
            label="Notes"
            rows={3}
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Design brief, client preferences, inspiration notes..."
          />
        </form>
      </SidePanel>
    </div>
  );
}
